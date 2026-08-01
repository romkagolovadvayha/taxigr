import { describe, expect, it } from 'vitest';

import {
  buildNominatimQueries,
  filterExactHouseResults,
  prioritizeGrahovoDistrict,
  searchAddresses,
} from '../server/geocoding';

describe('local address directory', () => {
  it('finds Grahovo addresses without an external request', async () => {
    const results = await searchAddresses('Ачинцева');
    expect(results).toHaveLength(2);
    expect(results[0]?.label).toContain('Грахово');
    expect(results[0]?.houseNumber).toBeUndefined();
    expect(results[1]?.houseNumber).toBe('5');
    expect(results[0]?.coordinates.latitude).toBeCloseTo(56.0477, 4);
  });

  it('finds nearby settlements locally', async () => {
    const results = await searchAddresses('Благодатное');
    expect(results[0]?.details).toContain('Граховский район');
    expect(results[0]?.coordinates.latitude).toBeCloseTo(55.9995786, 6);
    expect(results[0]?.coordinates.longitude).toBeCloseTo(51.8684492, 6);
  });

  it('prioritizes Grahovo for a short street query and keeps a Russia-wide fallback', () => {
    expect(buildNominatimQueries('Советская')).toEqual([
      'Советская, Грахово, Удмуртская Республика',
      'Советская',
    ]);
    expect(buildNominatimQueries('улица Колпакова, Грахово')).toEqual([
      'улица Колпакова, Грахово',
    ]);
  });

  it('prioritizes a house-first query and rejects a street-level substitute', () => {
    expect(buildNominatimQueries('50 лет Победы, 19')).toEqual([
      '19, 50 лет Победы, Грахово, Удмуртская Республика',
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

  it('returns the verified point for 50 лет Победы, 19 without punctuation', async () => {
    const results = await searchAddresses('50 лет Победы 19');

    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe('ул. 50 лет Победы, 19');
    expect(results[0]?.details).toContain('точка дома');
    expect(results[0]?.coordinates.latitude).toBeCloseTo(56.055332, 6);
    expect(results[0]?.coordinates.longitude).toBeCloseTo(51.960263, 6);
  });

  it('suggests the street before houses for a partial numeric street name', async () => {
    const results = await searchAddresses('50');

    expect(results[0]?.label).toBe('ул. 50 лет Победы');
    expect(results[0]?.houseNumber).toBeUndefined();
    expect(results[1]?.label).toBe('ул. 50 лет Победы, 19');
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
});
