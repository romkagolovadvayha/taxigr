import { describe, expect, it } from 'vitest';

import type { Address } from '../src/domain/models';
import {
  calculateCommissionMinor,
  calculateFareMinor,
  calculateWaitingChargeMinor,
  classifyPricingScope,
  defaultPricingRules,
} from '../src/domain/pricing';

const grahovo: Address = {
  id: 'grahovo',
  label: 'с. Грахово, ул. Ачинцева, 5',
  houseNumber: '5',
  coordinates: { latitude: 56.0477, longitude: 51.9586 },
};
const grahovoSecond: Address = {
  id: 'grahovo-second',
  label: 'с. Грахово, ул. 50 лет Победы, 19',
  houseNumber: '19',
  coordinates: { latitude: 56.055332, longitude: 51.960263 },
};
const districtVillage: Address = {
  id: 'district',
  label: 'д. Благодатное, ул. Благодатновская, 53А',
  details: 'Граховский район, Удмуртская Республика',
  houseNumber: '53А',
  coordinates: { latitude: 55.9995786, longitude: 51.8684492 },
};
const mozhga: Address = {
  id: 'mozhga',
  label: 'г. Можга, Привокзальная ул., 6',
  houseNumber: '6',
  coordinates: { latitude: 56.445658, longitude: 52.1972249 },
};

describe('route pricing', () => {
  it('uses a fixed 150 ruble fare inside Grahovo', () => {
    const scope = classifyPricingScope(grahovo, grahovoSecond);
    expect(scope).toBe('grahovo');
    expect(calculateFareMinor(500, 'economy', scope)).toBe(15_000);
    expect(calculateFareMinor(8_000, 'economy', scope)).toBe(15_000);
  });

  it('uses 60 rubles per kilometer inside Grahovo district', () => {
    const scope = classifyPricingScope(grahovo, districtVillage);
    expect(scope).toBe('district');
    expect(calculateFareMinor(9_500, 'economy', scope)).toBe(57_000);
  });

  it('uses 30 rubles per kilometer for intercity rides', () => {
    const scope = classifyPricingScope(grahovo, mozhga);
    expect(scope).toBe('intercity');
    expect(calculateFareMinor(61_000, 'economy', scope)).toBe(183_000);
  });

  it('adds the fixed child tariff surcharge without seat selection', () => {
    const economy = calculateFareMinor(9_500, 'economy', 'district');
    const child = calculateFareMinor(9_500, 'child', 'district');
    expect(child - economy).toBe(defaultPricingRules.childSurchargeMinor);
  });
});

describe('paid waiting', () => {
  it('keeps the first three minutes free', () => {
    expect(calculateWaitingChargeMinor(0)).toBe(0);
    expect(calculateWaitingChargeMinor(180)).toBe(0);
  });

  it('charges four rubles for every started minute after the free limit', () => {
    expect(calculateWaitingChargeMinor(181)).toBe(400);
    expect(calculateWaitingChargeMinor(240)).toBe(400);
    expect(calculateWaitingChargeMinor(241)).toBe(800);
  });
});

describe('commission', () => {
  it('calculates commission in basis points', () => {
    expect(calculateCommissionMinor(100_000, 1_200)).toBe(12_000);
    expect(calculateCommissionMinor(100_000, 950)).toBe(9_500);
  });
});
