import { describe, expect, it } from 'vitest';
import { driverNavigationAddress, navigationPagePath, parseNavigationPage, yandexNavigationUrls } from '../src/domain/external-navigation';
import type { Address, RideStatus } from '../src/domain/models';

const pickup: Address = { id: 'osm-pickup', label: 'с. Грахово, ул. Ачинцева, 11', houseNumber: '11',
  coordinatePrecision: 'precise', coordinates: { latitude: 56.0477, longitude: 51.9586 } };
const first: Address = { ...pickup, id: 'first', label: 'Первая остановка', coordinates: { latitude: 56.05, longitude: 51.96 } };
const last: Address = { ...pickup, id: 'last', label: 'Конечная остановка', coordinates: { latitude: 56.06, longitude: 51.97 } };

describe('driver navigation destination', () => {
  const ride = { pickup, destination: last, destinations: [first, last] };
  it.each<RideStatus>(['accepted', 'driver_arriving'])('navigates to pickup in %s', status => {
    expect(driverNavigationAddress({ ...ride, status })).toBe(pickup);
  });
  it.each<RideStatus>(['driver_waiting', 'in_progress'])('navigates to the next uncompleted stop in %s', status => {
    expect(driverNavigationAddress({ ...ride, status, nextDestinationIndex: 0 })).toBe(first);
    expect(driverNavigationAddress({ ...ride, status, nextDestinationIndex: 1 })).toBe(last);
  });
  it('handles old orders without the stops array', () => {
    expect(driverNavigationAddress({ pickup, destination: last, status: 'in_progress' })).toBe(last);
  });
  it.each<RideStatus>(['draft', 'searching', 'completed', 'cancelled'])('does not offer navigation for %s', status => {
    expect(driverNavigationAddress({ ...ride, status })).toBeNull();
  });
  it('handles an absent order', () => expect(driverNavigationAddress(null)).toBeNull());
});

describe('Yandex navigation links', () => {
  it('round-trips messenger HTTPS links without session tokens or order details', () => {
    const path = navigationPagePath(pickup);
    const url = new URL(path, 'https://taxigr.ru');
    expect(url.pathname).toBe('/navigate');
    expect([...url.searchParams.keys()]).toEqual(['address', 'lat', 'lon']);
    const parsed = parseNavigationPage(Object.fromEntries(url.searchParams));
    expect(parsed?.coordinates).toEqual(pickup.coordinates);
    expect(parsed?.label).toBe(pickup.label);
    expect(yandexNavigationUrls(parsed!).mode).toBe('route');
  });
  it('keeps an unconfirmed bot address as text when opened from a messenger', () => {
    const path = navigationPagePath({ ...pickup, id: 'manual:bot' });
    const url = new URL(path, 'https://taxigr.ru');
    expect(url.searchParams.has('lat')).toBe(false);
    expect(parseNavigationPage(Object.fromEntries(url.searchParams))?.coordinatePrecision).toBe('approximate');
  });
  it.each([
    {}, { address: ['one', 'two'] }, { address: 'House', lat: 'NaN', lon: '51' },
    { address: 'House', lat: '91', lon: '51' }, { address: 'House', lat: '56' },
    { address: 'House', lat: ' ', lon: ' ' }, { address: 'House', lat: '0', lon: '0' },
  ])('rejects malformed navigation links: %j', params => expect(parseNavigationPage(params)).toBeNull());
  it('passes the exact house coordinates and lets Navigator obtain the current position', () => {
    const urls = yandexNavigationUrls(pickup);
    const native = new URL(urls.navigator);
    expect(native.protocol).toBe('yandexnavi:');
    expect(native.hostname).toBe('build_route_on_map');
    expect(Object.fromEntries(native.searchParams)).toEqual({ lat_to: '56.0477', lon_to: '51.9586' });
    expect(new URL(urls.maps).searchParams.get('rtext')).toBe('~56.0477,51.9586');
    expect(new URL(urls.maps).searchParams.get('rtt')).toBe('auto');
    expect(urls.mode).toBe('route');
  });
  it.each([
    { id: 'manual:bot', coordinates: { latitude: 0, longitude: 0 } },
    { id: 'gar:house' },
    { coordinatePrecision: 'approximate' as const },
    { coordinates: { latitude: NaN, longitude: 51 } },
    { coordinates: { latitude: 91, longitude: 51 } },
    { coordinates: { latitude: 56, longitude: 181 } },
  ])('searches the address instead of navigating to an unreliable point: %j', change => {
    const label = 'Грахово, кафе «Дом & сад» #2';
    const urls = yandexNavigationUrls({ ...pickup, label, ...change });
    expect(new URL(urls.navigator).hostname).toBe('map_search');
    expect(new URL(urls.navigator).searchParams.get('text')).toBe(label);
    expect(new URL(urls.maps).searchParams.get('text')).toBe(label);
    expect(new URL(urls.navigator).searchParams.has('lat_to')).toBe(false);
    expect(urls.mode).toBe('search');
  });
  it('rejects a missing address instead of opening a blank navigation screen', () => {
    expect(() => yandexNavigationUrls({ ...pickup, id: 'manual:empty', label: ' ' })).toThrow('не указан');
  });
});
