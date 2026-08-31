import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildNominatimQueries,
  filterExactHouseResults,
  prioritizeGrahovoDistrict,
  searchAddresses,
} from '../server/geocoding';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local address directory', () => {
  it('finds Grahovo addresses without an external request', async () => {
    const results = await searchAddresses('Ачинцева');
    expect(results.length).toBeGreaterThan(20);
    expect(results[0]?.label).toBe('с. Грахово, ул. Ачинцева');
    expect(results[0]?.houseNumber).toBeUndefined();
    const houseFive = results.find((address) => address.houseNumber === '5');
    expect(houseFive?.label).toContain('Ачинцева');
    expect(houseFive?.coordinates.latitude).toBeCloseTo(56.0477, 3);
  });

  it('finds nearby settlements locally', async () => {
    const results = await searchAddresses('Благодатное');
    expect(results[0]?.details).toContain('Граховский район');
    expect(results[0]?.coordinates.latitude).toBeCloseTo(55.9995786, 6);
    expect(results[0]?.coordinates.longitude).toBeCloseTo(51.8684492, 6);
  });

  it('prefers an exact outside settlement over roads that contain its name', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const payload = url.searchParams.get('q') === 'Алнаши'
        ? [
            {
              place_id: 122,
              display_name: 'Алнаши — Грахово, Старый Утчан, Алнашский район, Удмуртия, Россия',
              name: 'Алнаши — Грахово',
              lat: '56.1300000',
              lon: '52.2000000',
              type: 'road',
              address: {
                village: 'Старый Утчан',
                county: 'Алнашский район',
                state: 'Удмуртия',
                country: 'Россия',
              },
            },
            {
              place_id: 123,
              display_name: 'Алнаши, Алнашский район, Удмуртия, Россия',
              name: 'Алнаши',
              lat: '56.1848812',
              lon: '52.4755309',
              type: 'town',
              address: {
                town: 'Алнаши',
                county: 'Алнашский район',
                state: 'Удмуртия',
                country: 'Россия',
              },
            },
          ]
        : [
            {
              place_id: 121,
              display_name: 'Алнаши — Грахово, Грахово, Граховский район, Удмуртия, Россия',
              name: 'Алнаши — Грахово',
              lat: '56.0500000',
              lon: '51.9600000',
              type: 'road',
              address: {
                village: 'Грахово',
                county: 'Граховский район',
                state: 'Удмуртия',
                country: 'Россия',
              },
            },
          ];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchAddresses('Алнаши');

    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe('Алнаши');
    expect(results[0]?.details).toContain('Алнашский район');
  });

  it('prioritizes Grahovo for a short street query and keeps a Russia-wide fallback', () => {
    expect(buildNominatimQueries('Советская')).toEqual([
      'Советская, Граховский район, Удмуртская Республика',
      'Советская',
    ]);
    expect(buildNominatimQueries('улица Колпакова, Грахово')).toEqual([
      'улица Колпакова, Грахово',
    ]);
  });

  it('prioritizes a house-first query and rejects a street-level substitute', () => {
    expect(buildNominatimQueries('50 лет Победы, 19')).toEqual([
      '19, 50 лет Победы, Граховский район, Удмуртская Республика',
      '50 лет Победы, 19',
    ]);

    const results = filterExactHouseResults('50 лет Победы 19', [
      {
        id: 'street',
        label: 'улица 50 лет Победы',
        details: 'Грахово',
        coordinates: { latitude: 56.0548205, longitude: 51.9581126 },
      },
    ]);

    expect(results).toEqual([]);
  });

  it('does not treat a building suffix as the requested house number', () => {
    const results = filterExactHouseResults('Набережные Челны проспект Мира 1', [
      {
        id: 'wrong-building',
        label: 'проспект Мира, 86 ст1',
        details: 'Набережные Челны, Татарстан',
        houseNumber: '86 ст1',
        coordinates: { latitude: 55.7545, longitude: 52.4278 },
      },
    ]);

    expect(results).toEqual([]);
  });

  it('returns the verified point for 50 лет Победы, 19 without punctuation', async () => {
    const results = await searchAddresses('50 лет Победы 19');

    expect(results[0]?.label).toBe('ул. 50 лет Победы, 19');
    expect(results[0]?.details).toContain('точка дома');
    expect(results[0]?.coordinates.latitude).toBeCloseTo(56.055332, 6);
    expect(results[0]?.coordinates.longitude).toBeCloseTo(51.960263, 6);
  });

  it('suggests the street before houses for a partial numeric street name', async () => {
    const results = await searchAddresses('50');

    expect(results[0]?.label).toBe('с. Грахово, ул. 50 лет Победы');
    expect(results[0]?.houseNumber).toBeUndefined();
    expect(results.some((address) => address.label === 'ул. 50 лет Победы, 19')).toBe(true);
  });

  it('returns houses after a selected street with a trailing comma', async () => {
    const results = await searchAddresses('ул. 50 лет Победы,');

    expect(results.some((address) => address.label === 'ул. 50 лет Победы, 19')).toBe(true);
  });

  it('does not substitute house 19 when the user asks for house 1', async () => {
    const results = await searchAddresses('ул. 50 лет Победы, 1');

    expect(results.every((address) => address.houseNumber !== '19')).toBe(true);
  });

  it('shows Grahovo district above equally named addresses from other districts', () => {
    const results = prioritizeGrahovoDistrict([
      {
        id: 'izhevsk',
        label: 'Советская улица, 10',
        details: 'Ижевск, Удмуртская Республика',
        coordinates: { latitude: 56.85, longitude: 53.2 },
      },
      {
        id: 'grahovo-village',
        label: 'Советская улица, 10',
        details: 'д. Верхняя Игра, Граховский район, Удмуртская Республика',
        coordinates: { latitude: 56.01, longitude: 51.9 },
      },
      {
        id: 'mozhga',
        label: 'Советская улица, 10',
        details: 'Можгинский район, Удмуртская Республика',
        coordinates: { latitude: 56.2, longitude: 52.5 },
      },
      {
        id: 'grahovo-okrug',
        label: 'Советская улица, 10',
        details: 'с. Грахово, Граховский муниципальный округ, Удмуртская Республика',
        coordinates: { latitude: 56.05, longitude: 51.96 },
      },
    ]);

    expect(results.map((address) => address.id)).toEqual([
      'grahovo-village',
      'grahovo-okrug',
      'izhevsk',
      'mozhga',
    ]);
  });

  it('preserves geocoder relevance order inside the same priority group', () => {
    const results = prioritizeGrahovoDistrict([
      {
        id: 'first-local',
        label: 'улица Мира',
        details: 'Граховский район',
        coordinates: { latitude: 56, longitude: 52 },
      },
      {
        id: 'second-local',
        label: 'переулок Мира',
        details: 'Граховский район',
        coordinates: { latitude: 56.01, longitude: 52.01 },
      },
    ]);

    expect(results.map((address) => address.id)).toEqual(['first-local', 'second-local']);
  });

  it('contains the complete Porshur GAR directory and ranks it above Porshurskaya street', async () => {
    const results = await searchAddresses('Поршур');
    const porshurHouses = results.filter(
      (address) => address.label.startsWith('д. Поршур,') && !!address.houseNumber,
    );

    expect(results[0]?.label).toBe('д. Поршур');
    expect(results[1]?.label).toBe('д. Поршур, ул. Тимофеева');
    expect(results[2]?.label).toBe('д. Поршур, ул. Бабаева');
    expect(porshurHouses).toHaveLength(65);
  });

  it('finds registered Porshur houses by settlement, street and number', async () => {
    const babaeva = await searchAddresses('Поршур Бабаева 32');
    const timofeeva = await searchAddresses('Поршур Тимофеева 1А');

    expect(babaeva).toHaveLength(1);
    expect(babaeva[0]?.label).toBe('д. Поршур, ул. Бабаева, 32');
    expect(babaeva[0]?.coordinates.latitude).toBeCloseTo(56.0248498, 6);
    expect(timofeeva[0]?.label).toBe('д. Поршур, ул. Тимофеева, 1А');
    expect(timofeeva[0]?.coordinates.longitude).toBeCloseTo(51.7077961, 6);
  });

  it('scopes unknown settlements to Grahovo district instead of Grahovo village', () => {
    expect(buildNominatimQueries('Поршур')).toEqual([
      'Поршур, Граховский район, Удмуртская Республика',
      'Поршур',
    ]);
  });
});
