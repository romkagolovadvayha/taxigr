import type { Address, Tariff, TariffCode } from './models';

export type PricingScope = 'grahovo' | 'district' | 'intercity';

export type FarePeriod = '07-22' | '22-02' | '02-07';

export type PricingRules = {
  currency: 'RUB';
  grahovoFare07To22Minor: number;
  grahovoFare22To02Minor: number;
  grahovoFare02To07Minor: number;
  districtPerKilometer07To22Minor: number;
  districtPerKilometer22To02Minor: number;
  districtPerKilometer02To07Minor: number;
  intercityPerKilometerMinor: number;
  childSurchargeMinor: number;
  waitingFreeMinutes: number;
  waitingPerMinuteMinor: number;
  searchPriceIncreaseIntervalMinutes: number;
  searchPriceIncreaseStepMinor: number;
  serviceCommissionBps: number;
};

export const defaultPricingRules: PricingRules = {
  currency: 'RUB',
  grahovoFare07To22Minor: 15_000,
  grahovoFare22To02Minor: 15_000,
  grahovoFare02To07Minor: 15_000,
  districtPerKilometer07To22Minor: 6_000,
  districtPerKilometer22To02Minor: 6_000,
  districtPerKilometer02To07Minor: 6_000,
  intercityPerKilometerMinor: 3_000,
  childSurchargeMinor: 7_000,
  waitingFreeMinutes: 3,
  waitingPerMinuteMinor: 400,
  searchPriceIncreaseIntervalMinutes: 4,
  searchPriceIncreaseStepMinor: 3_000,
  serviceCommissionBps: 1_200,
};

const grahovoPattern = /(?:^|[\s,])(?:село|с\.)?\s*грахово(?:[\s,]|$)/iu;
const grahovoDistrictPattern =
  /граховск(?:ий|ого|ом).{0,40}(?:район|муниципальн\w*\s+округ)/iu;

function addressContext(address: Address): string {
  return `${address.label} ${address.details ?? ''}`.trim();
}

export function isGrahovoAddress(address: Address): boolean {
  return grahovoPattern.test(addressContext(address));
}

export function isGrahovoDistrictAddress(address: Address): boolean {
  const context = addressContext(address);
  return grahovoPattern.test(context) || grahovoDistrictPattern.test(context);
}

export function classifyPricingScope(
  pickup: Address,
  destination: Address,
): PricingScope {
  if (isGrahovoAddress(pickup) && isGrahovoAddress(destination)) {
    return 'grahovo';
  }
  if (
    isGrahovoDistrictAddress(pickup) &&
    isGrahovoDistrictAddress(destination)
  ) {
    return 'district';
  }
  return 'intercity';
}

export const pricingScopeLabel: Record<PricingScope, string> = {
  grahovo: 'По Грахово',
  district: 'По Граховскому району',
  intercity: 'Межгород',
};

export function farePeriodAt(date = new Date()): FarePeriod {
  // Самарское время круглый год соответствует UTC+4 и не использует переход на летнее время.
  const samaraHour = (date.getUTCHours() + 4) % 24;
  if (samaraHour >= 7 && samaraHour < 22) return '07-22';
  if (samaraHour >= 22 || samaraHour < 2) return '22-02';
  return '02-07';
}

export const farePeriodLabel: Record<FarePeriod, string> = {
  '07-22': 'С 07:00 до 22:00',
  '22-02': 'С 22:00 до 02:00',
  '02-07': 'С 02:00 до 07:00',
};

function grahovoFareMinorAt(rules: PricingRules, date: Date): number {
  const period = farePeriodAt(date);
  if (period === '07-22') return rules.grahovoFare07To22Minor;
  if (period === '22-02') return rules.grahovoFare22To02Minor;
  return rules.grahovoFare02To07Minor;
}

function districtPerKilometerMinorAt(rules: PricingRules, date: Date): number {
  const period = farePeriodAt(date);
  if (period === '07-22') return rules.districtPerKilometer07To22Minor;
  if (period === '22-02') return rules.districtPerKilometer22To02Minor;
  return rules.districtPerKilometer02To07Minor;
}

function roundToTenRubles(minor: number): number {
  return Math.ceil(minor / 1_000) * 1_000;
}

export function calculateFareMinor(
  distanceMeters: number,
  tariff: TariffCode,
  scope: PricingScope,
  rules = defaultPricingRules,
  date = new Date(),
): number {
  const routePrice = scope === 'grahovo'
    ? grahovoFareMinorAt(rules, date)
    : roundToTenRubles(
        (distanceMeters / 1_000) *
          (scope === 'district'
            ? districtPerKilometerMinorAt(rules, date)
            : rules.intercityPerKilometerMinor),
      );
  return routePrice +
    (tariff === 'child' ? rules.childSurchargeMinor : 0);
}

export function calculateWaitingChargeMinor(
  totalWaitingSeconds: number,
  freeMinutes = defaultPricingRules.waitingFreeMinutes,
  perMinuteMinor = defaultPricingRules.waitingPerMinuteMinor,
): number {
  const billableSeconds = Math.max(0, Math.floor(totalWaitingSeconds) - freeMinutes * 60);
  const billableMinutes = Math.ceil(billableSeconds / 60);
  return billableMinutes * perMinuteMinor;
}

export function calculateCommissionMinor(
  fareMinor: number,
  commissionBps = defaultPricingRules.serviceCommissionBps,
): number {
  return Math.round((fareMinor * commissionBps) / 10_000);
}

export function buildTariffs(
  distanceMeters: number,
  scope: PricingScope,
  rules = defaultPricingRules,
  date = new Date(),
): Tariff[] {
  return [
    {
      code: 'economy',
      title: 'Эконом',
      description: 'Обычная поездка',
      childSeatIncluded: false,
      etaMinutes: 4,
      priceMinor: calculateFareMinor(distanceMeters, 'economy', scope, rules, date),
    },
    {
      code: 'child',
      title: 'Детский',
      description: 'Приедет машина с подходящим креслом',
      childSeatIncluded: true,
      etaMinutes: 7,
      priceMinor: calculateFareMinor(distanceMeters, 'child', scope, rules, date),
    },
  ];
}
