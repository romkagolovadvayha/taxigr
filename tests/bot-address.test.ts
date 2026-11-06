import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from '../src/domain/models';
import { grahovoAddressCatalog } from '../src/data/grahovo-address-catalog';
vi.mock('../server/address-directory', () => ({ getAddressDirectory: vi.fn().mockResolvedValue([]) }));
vi.mock('../server/geocoding', () => ({ searchAddresses: vi.fn().mockResolvedValue([]) }));
vi.mock('../server/places', () => ({ listPlaces: vi.fn().mockResolvedValue([]), placeToAddress: vi.fn() }));
vi.mock('../server/remembered-addresses', () => ({ getRememberedAddresses: vi.fn().mockResolvedValue([]) }));
vi.mock('../server/bot-address-ai', () => ({ interpretBotAddress: vi.fn().mockResolvedValue(null) }));
import { getAddressDirectory } from '../server/address-directory';
import { searchAddresses } from '../server/geocoding';
import { interpretBotAddress } from '../server/bot-address-ai';
import { listPlaces, placeToAddress } from '../server/places';
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
    ['с кизнера нужно забрать и увезти в Мари возжай', ['кизнера', 'Мари возжай']],
    ['Заберите нас с санатория в Кизнере, а потом отвезите в Мари-Возжай', ['санатория в Кизнере', 'Мари-Возжай']],
    ['Из посёлка Кизнера надо забрать, увезти до Мари-Возжая', ['посёлка Кизнера', 'Мари-Возжая']],
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
  beforeEach(() => {
    vi.mocked(getAddressDirectory).mockResolvedValue([house]);
    vi.mocked(searchAddresses).mockReset().mockResolvedValue([]);
    vi.mocked(interpretBotAddress).mockReset().mockResolvedValue(null);
    vi.mocked(listPlaces).mockReset().mockResolvedValue([]);
  });
  it.each(['Конзовод', 'на Конзавод', 'до Конзовода', 'Заречный'])('uses the same district destination for %s', async query => {
    vi.mocked(getAddressDirectory).mockResolvedValue(grahovoAddressCatalog);
    expect((await resolveBotAddressOptions(query, false)).address?.label).toBe('с. Заречный');
    expect(searchAddresses).not.toHaveBeenCalled();
    expect(interpretBotAddress).not.toHaveBeenCalled();
  });

  it('recognizes a bare alias as a pickup settlement without assigning a house point', async () => {
    vi.mocked(getAddressDirectory).mockResolvedValue(grahovoAddressCatalog);
    expect(await resolveBotAddressOptions('с Конзовода', true)).toMatchObject({
      address: null, candidates: [], recognized: { label: 'с. Заречный', kind: 'settlement' },
    });
    expect(searchAddresses).not.toHaveBeenCalled();
    expect(interpretBotAddress).not.toHaveBeenCalled();
  });
  it('removes a time request before looking up a house', async () => {
    const lebed = { ...house, id: 'test-lebed', label: 'с. Заречный, ул. Лебедевская, 3', houseNumber: '3' };
    vi.mocked(getAddressDirectory).mockResolvedValue([lebed]);
    expect((await resolveBotAddressOptions('Лебедевская 3. Через 30 минут', true)).address?.id).toBe(lebed.id);
    expect(interpretBotAddress).not.toHaveBeenCalled();
    expect(searchAddresses).not.toHaveBeenCalled();
  });
  it('verifies the AI correction in the directory before accepting it', async () => {
    vi.mocked(interpretBotAddress).mockResolvedValue({ pickup: 'Советская 10', destination: null });
    expect((await resolveBotAddressOptions('Заберите с десятого дома на Советской, пожалуйста', true)).address).toEqual(house);
    expect(interpretBotAddress).toHaveBeenCalledOnce();
    vi.mocked(interpretBotAddress).mockResolvedValue({ pickup: 'Советская 11', destination: null });
    expect((await resolveBotAddressOptions('Заберите с непонятного места', true)).address).toBeNull();
  });
  it('resolves an AI result that places the house number before a numbered street', async () => {
    const victory = { ...house, id: 'victory', label: 'с. Грахово, ул. 50 лет Победы, 19', houseNumber: '19' };
    vi.mocked(getAddressDirectory).mockResolvedValue([victory]);
    vi.mocked(interpretBotAddress).mockResolvedValue({ pickup: 'дом 19 на улице 50 лет Победы', destination: null });
    const result = await resolveBotAddressOptions('Заберите меня у дома под номером 19 на улице 50 лет Победы', true);
    expect(interpretBotAddress).toHaveBeenCalledOnce();
    expect(result.address).toEqual(victory);
    expect(searchAddresses).not.toHaveBeenCalled();
  });
  it('shows one result for a cafe and its nearby house at the same address', async () => {
    const roadside = { ...house, label: 'с. Грахово, ул. Дорожная, 13', houseNumber: '13' };
    vi.mocked(getAddressDirectory).mockResolvedValue([roadside]);
    vi.mocked(listPlaces).mockResolvedValue([{
      id: 'maximum', name: 'Караоке-кафе «Максимум»', addressLabel: 'ул. Дорожная, 13', houseNumber: '13', aliases: [],
      category: 'food', coordinates: roadside.coordinates, socialLinks: [], photoUrls: [],
      schedule: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
      active: true, createdAt: '', updatedAt: '',
    }]);
    vi.mocked(placeToAddress).mockReturnValue({
      ...roadside, id: 'place:maximum', placeId: 'maximum', label: `Караоке-кафе «Максимум», ${roadside.label}`,
      coordinates: { ...roadside.coordinates, latitude: roadside.coordinates.latitude + 0.0003 },
    });
    const result = await resolveBotAddressOptions('Дорожная 13', false);
    expect(result.candidates).toEqual([]);
    expect(result.address?.houseNumber).toBe('13');
  });
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
  it('distinguishes the two Kizners and resolves the named district destination', async () => {
    vi.mocked(getAddressDirectory).mockResolvedValue(grahovoAddressCatalog);
    const result = await resolveBotAddressOptions('кизнера', true);
    expect(result.address).toBeNull();
    expect(result.candidates.map(address => address.label)).toEqual(['п. Кизнер', 'с. Кизнер']);
    expect((await resolveBotAddressOptions('посёлка Кизнера', true)).address?.label).toBe('п. Кизнер');
    expect((await resolveBotAddressOptions('села Кизнера', true)).address?.label).toBe('с. Кизнер');
    expect((await resolveBotAddressOptions('Мари возжай', false)).address?.label).toBe('д. Мари-Возжай');
    expect(searchAddresses).not.toHaveBeenCalled();
  });
});
