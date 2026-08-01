import type { Address, Tariff, TariffCode } from './models';

export type PricingScope = 'grahovo' | 'district' | 'intercity';

export type PricingRules = {
  currency: 'RUB';
  grahovoFixedFareMinor: number;
  districtPerKilometerMinor: number;
  intercityPerKilometerMinor: number;
  childSurchargeMinor: number;
  waitingFreeMinutes: number;
  waitingPerMinuteMinor: number;
  serviceCommissionBps: number;
};

export const defaultPricingRules: PricingRules = {
  currency: 'RUB',
  grahovoFixedFareMinor: 15_000,
  districtPerKilometerMinor: 6_000,
  intercityPerKilometerMinor: 3_000,
  childSurchargeMinor: 7_000,
  waitingFreeMinutes: 3,
  waitingPerMinuteMinor: 400,
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

function roundToTenRubles(minor: number): number {
  return Math.ceil(minor / 1_000) * 1_000;
}

export function calculateFareMinor(
  distanceMeters: number,
  tariff: TariffCode,
  scope: PricingScope,
  rules = defaultPricingRules,
): number {
  const routePrice =
    scope === 'grahovo'
      ? rules.grahovoFixedFareMinor
      : roundToTenRubles(
          (distanceMeters / 1_000) *
            (scope === 'district'
              ? rules.districtPerKilometerMinor
              : rules.intercityPerKilometerMinor),
        );
  return routePrice + (tariff === 'child' ? rules.childSurchargeMinor : 0);
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
): Tariff[] {
  return [
    {
      code: 'economy',
      title: 'Эконом',
      description: 'Обычная поездка',
      childSeatIncluded: false,
      etaMinutes: 4,
      priceMinor: calculateFareMinor(distanceMeters, 'economy', scope, rules),
    },
    {
      code: 'child',
      title: 'Детский',
      description: 'Приедет машина с подходящим креслом',
      childSeatIncluded: true,
      etaMinutes: 7,
      priceMinor: calculateFareMinor(distanceMeters, 'child', scope, rules),
    },
  ];
}
