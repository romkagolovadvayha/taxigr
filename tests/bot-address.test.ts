import { describe, expect, it, vi } from 'vitest';
import type { Address } from '../src/domain/models';
vi.mock('../server/address-directory', () => ({ getAddressDirectory: vi.fn().mockResolvedValue([]) }));
vi.mock('../server/geocoding', () => ({ searchAddresses: vi.fn().mockResolvedValue([]) }));
vi.mock('../server/places', () => ({ listPlaces: vi.fn().mockResolvedValue([]), placeToAddress: vi.fn() }));
import { botAddressScore, chooseBotAddress, normalizeBotAddress, splitBotRoute, unresolvedBotAddress } from '../server/bot-address';

const house: Address = { id: 'house', label: 'с. Грахово, ул. Советская, 10', houseNumber: '10', kind: 'house',
  coordinates: { latitude: 56.05, longitude: 51.96 }, coordinatePrecision: 'precise' };

describe('messenger free-text addresses', () => {
  it.each(['СОВЕТСКАЯ10', 'советкая 10', '10 советская', 'ул. Советская, дом 10', 'cjdtncrfz 10', 'sovetskaya 10'])(
    'recognizes %s without guessing a different house', query => expect(chooseBotAddress(query, [house], true)).toEqual(house),
  );
  it.each(['Советская 11', 'Советская 1', 'советская 10а', 'какой-то магазин', 'совсем другой адрес'])(
    'does not fabricate a match for %s', query => expect(chooseBotAddress(query, [house], true)).toBeNull(),
  );
  it('refuses an ambiguous street in two settlements', () => {
    const other = { ...house, id: 'other', label: 'д. Лолошур-Возжи, ул. Советская, 10', coordinates: {latitude:56.2,longitude:52.1} };
    expect(chooseBotAddress('Советская 10', [house, other], true)).toBeNull();
    expect(chooseBotAddress('Грахово Советская 10', [house, other], true)).toEqual(house);
  });
  it('never prices approximate catalogue coordinates', () => {
    expect(chooseBotAddress('Советская 10', [{ ...house, coordinatePrecision: 'approximate' }], true)).toBeNull();
  });
  it.each([
    ['Советская 10 → больница', ['Советская 10', 'больница']],
    ['такси от Советской 10 до больницы', ['Советской 10', 'больницы']],
    ['из Грахово в Можгу', ['Грахово', 'Можгу']],
    ['Советская 10\nбольница', ['Советская 10', 'больница']],
    ['Советская 10 - больница', ['Советская 10', 'больница']],
  ])('splits a route %s', (text, expected) => expect(splitBotRoute(text as string)).toEqual(expected));
  it('preserves an unknown address verbatim for the driver', () => {
    const raw='За старой баней, у зелёного забора';
    expect(unresolvedBotAddress(raw)).toMatchObject({label:raw, coordinatePrecision:'approximate'});
    expect(unresolvedBotAddress(raw).id).toMatch(/^manual:/);
    expect(normalizeBotAddress('  УЛ. СОВЕТСКАЯ10  ')).toContain('советская 10');
    expect(botAddressScore('Советская 11',house)).toBe(0);
  });
});
