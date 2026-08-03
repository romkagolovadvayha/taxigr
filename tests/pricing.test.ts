import { describe, expect, it } from 'vitest';

import {
  calculateCommissionMinor,
  calculateFareMinor,
  calculateWaitingChargeMinor,
  defaultPricingRules,
  farePeriodAt,
} from '../src/domain/pricing';

describe('route pricing', () => {
  const rules = {
    ...defaultPricingRules,
    grahovoFare07To22Minor: 15_000,
    grahovoFare22To02Minor: 20_000,
    grahovoFare02To07Minor: 25_000,
    districtPerKilometer07To22Minor: 6_000,
    districtPerKilometer22To02Minor: 7_000,
    districtPerKilometer02To07Minor: 8_000,
    intercityPerKilometerMinor: 3_000,
  };

  it('uses a fixed time-based fare inside Grahovo', () => {
    const daytime = new Date('2026-08-03T03:00:00.000Z'); // 07:00 in Samara
    expect(calculateFareMinor(500, 'economy', 'grahovo', rules, daytime)).toBe(15_000);
    expect(calculateFareMinor(8_000, 'economy', 'grahovo', rules, daytime)).toBe(15_000);
  });

  it('uses a separate time-based per-kilometer rate inside Grahovo district', () => {
    const daytime = new Date('2026-08-03T03:00:00.000Z');
    expect(calculateFareMinor(9_500, 'economy', 'district', rules, daytime)).toBe(57_000);
  });

  it('keeps a separate intercity per-kilometer rate', () => {
    const daytime = new Date('2026-08-03T03:00:00.000Z');
    const late = new Date('2026-08-03T18:00:00.000Z');
    expect(calculateFareMinor(61_000, 'economy', 'intercity', rules, daytime)).toBe(183_000);
    expect(calculateFareMinor(61_000, 'economy', 'intercity', rules, late)).toBe(183_000);
  });

  it('switches periods exactly at 22:00, 02:00 and 07:00 Samara time', () => {
    expect(farePeriodAt(new Date('2026-08-03T17:59:59.999Z'))).toBe('07-22');
    expect(farePeriodAt(new Date('2026-08-03T18:00:00.000Z'))).toBe('22-02');
    expect(farePeriodAt(new Date('2026-08-03T21:59:59.999Z'))).toBe('22-02');
    expect(farePeriodAt(new Date('2026-08-03T22:00:00.000Z'))).toBe('02-07');
    expect(farePeriodAt(new Date('2026-08-04T02:59:59.999Z'))).toBe('02-07');
    expect(farePeriodAt(new Date('2026-08-04T03:00:00.000Z'))).toBe('07-22');

    expect(calculateFareMinor(9_500, 'economy', 'district', rules, new Date('2026-08-03T18:00:00.000Z'))).toBe(67_000);
    expect(calculateFareMinor(9_500, 'economy', 'district', rules, new Date('2026-08-03T22:00:00.000Z'))).toBe(76_000);
  });

  it('adds the fixed child tariff surcharge without seat selection', () => {
    const daytime = new Date('2026-08-03T03:00:00.000Z');
    const economy = calculateFareMinor(9_500, 'economy', 'district', rules, daytime);
    const child = calculateFareMinor(9_500, 'child', 'district', rules, daytime);
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
