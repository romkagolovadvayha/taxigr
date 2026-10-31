import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from '../src/domain/models';
import { grahovoAddressCatalog } from '../src/data/grahovo-address-catalog';
vi.mock('../server/address-directory', () => ({ getAddressDirectory: vi.fn().mockResolvedValue([]) }));
vi.mock('../server/geocoding', () => ({ searchAddresses: vi.fn().mockResolvedValue([]) }));
vi.mock('../server/places', () => ({ listPlaces: vi.fn().mockResolvedValue([]), placeToAddress: vi.fn() }));
vi.mock('../server/remembered-addresses', () => ({ getRememberedAddresses: vi.fn().mockResolvedValue([]) }));
import { getAddressDirectory } from '../server/address-directory';
import { searchAddresses } from '../server/geocoding';
import { botAddressScore, chooseBotAddress, normalizeBotAddress, splitBotRoute, unresolvedBotAddress, resolveBotAddressOptions } from '../server/bot-address';

const house: Address = { id: 'house', label: 'с. Грахово, ул. Советская, 10', houseNumber: '10', kind: 'house',
  coordinates: { latitude: 56.05, longitude: 51.96 }, coordinatePrecision: 'precise' };

describe('messenger free-text addresses', () => {
  it.each(['СОВЕТСКАЯ10', 'советкая 10', 'советсакя 10', 'Советской 10', 'хочу на советскую 10', 'советская улца10', '10 советская', 'ул. Советская, дом 10', 'cjdtncrfz 10', 'sovetskaya 10'])(
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
  it('rejects conflicting precise coordinates even when both labels are identical', () => {
    expect(chooseBotAddress(house.label, [house, {...house,id:'conflicting',coordinates:{latitude:56.2,longitude:52.1}}], true)).toBeNull();
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

describe('bot resolution through the real parsing pipeline', () => {
  beforeEach(() => { vi.mocked(getAddressDirectory).mockResolvedValue([house]); vi.mocked(searchAddresses).mockReset().mockResolvedValue([]); });
  it.each([
    ['Грахово, ул 50 лет победы дом 10 кв 2', 'с. Грахово, ул. 50 лет Победы, 10'],
    ['Ул Ачинцева 11 подъезд 3 15 квартира', 'с. Грахово, ул. Ачинцева, 11'],
    ['Ачинцева 11, кв.15, подъезд 3, этаж 2', 'с. Грахово, ул. Ачинцева, 11'],
    ['Ачинцева 11 кв15', 'с. Грахово, ул. Ачинцева, 11'],
    ['Ачинцева дом11кв15', 'с. Грахово, ул. Ачинцева, 11'],
  ])('resolves the real catalogue house in %s without confusing access details', async (raw, label) => {
    vi.mocked(getAddressDirectory).mockResolvedValue(grahovoAddressCatalog);
    const result = await resolveBotAddressOptions(raw, true);
    expect(result.address).toMatchObject({ label, coordinatePrecision: 'precise' });
    expect(result.candidates).toEqual([]);
    expect(searchAddresses).not.toHaveBeenCalled();
  });
  it('keeps actual compound house numbers and building suffixes intact', () => {
    expect(normalizeBotAddress('Молодёжная 4-1')).toBe('молодежная 4-1');
    expect(normalizeBotAddress('Советская 10/2 кв 15')).toBe('советская 10/2');
    expect(normalizeBotAddress('Советская 10 корпус 2 кв 15')).toBe('советская 10 к 2');
    expect(chooseBotAddress('Советская 11 кв 10', [house], true)).toBeNull();
  });
  it('resolves a typo locally without geocoding', async () => {
    expect((await resolveBotAddressOptions('заберите меня с советской10', true)).address?.label).toBe(house.label);
    expect(searchAddresses).not.toHaveBeenCalled();
  });
  it('keeps approximate rivals in the choice instead of guessing the only mapped house', async () => {
    const other: Address = { ...house, id: 'gar:other', label: 'д. Каменное, ул. Советская, 10', coordinatePrecision: 'approximate', coordinates: { latitude:56.2,longitude:52.1 } };
    vi.mocked(getAddressDirectory).mockResolvedValue([house, other]);
    const result = await resolveBotAddressOptions('советкая10', true);
    expect(result.address).toBeNull(); expect(result.candidates).toHaveLength(2);
    expect((await resolveBotAddressOptions('советкая10', true, house)).address).toEqual(house);
  });
  it('uses a mapped house instead of asking to choose its obsolete GAR anchor', async () => {
    vi.mocked(getAddressDirectory).mockResolvedValue([house, {...house,id:'gar:old',coordinatePrecision:'approximate',coordinates:{latitude:56.06,longitude:51.97}}]);
    const result = await resolveBotAddressOptions('советкая10', true);
    expect(result.address).toEqual(house); expect(result.candidates).toEqual([]);
  });
  it('refines the corrected canonical address, and never prices an approximate anchor', async () => {
    const approximate: Address = { ...house, id:'gar:house', coordinatePrecision:'approximate' };
    vi.mocked(getAddressDirectory).mockResolvedValue([approximate]);
    vi.mocked(searchAddresses).mockResolvedValue([house]);
    expect((await resolveBotAddressOptions('советкая10', true)).address).toEqual(house);
    expect(searchAddresses).toHaveBeenCalledWith(house.label, false, true);
    vi.mocked(searchAddresses).mockResolvedValue([approximate]);
    expect((await resolveBotAddressOptions('советкая10', true)).address).toBeNull();
  });
  it.each(['Можга', 'в можгу', 'я хочу в можгу', 'Можга придорожная 10'])('returns only the city for %s', async query => {
    expect((await resolveBotAddressOptions(query, false)).address).toMatchObject({label:'г. Можга',kind:'settlement'});
    expect(searchAddresses).not.toHaveBeenCalled();
  });
});
