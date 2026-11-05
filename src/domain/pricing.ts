import type { Address, Tariff, TariffCode } from './models';
import { normalizeRouteStops } from './route-stops';

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
  intercityPerKilometer07To22Minor: number;
  intercityPerKilometer22To02Minor: number;
  intercityPerKilometer02To07Minor: number;
  childSurchargeMinor: number;
  additionalStopGrahovoSurchargeBps: number;
  waitingFreeMinutes: number;
  waitingPerMinuteMinor: number;
  searchPriceIncreaseIntervalMinutes: number;
  searchPriceIncreaseStepMinor: number;
  serviceCommissionBps: number;
  passengerCancellationLimit: number;
  passengerCancellationWindowHours: number;
  passengerCancellationBlockHours: number;
};

export const defaultPricingRules: PricingRules = {
  currency: 'RUB',
  grahovoFare07To22Minor: 15_000,
  grahovoFare22To02Minor: 15_000,
  grahovoFare02To07Minor: 15_000,
  districtPerKilometer07To22Minor: 6_000,
  districtPerKilometer22To02Minor: 6_000,
  districtPerKilometer02To07Minor: 6_000,
  intercityPerKilometerMinor: 5_000,
  intercityPerKilometer07To22Minor: 5_000,
  intercityPerKilometer22To02Minor: 7_000,
  intercityPerKilometer02To07Minor: 10_000,
  childSurchargeMinor: 7_000,
  additionalStopGrahovoSurchargeBps: 6_000,
  waitingFreeMinutes: 3,
  waitingPerMinuteMinor: 400,
  searchPriceIncreaseIntervalMinutes: 4,
  searchPriceIncreaseStepMinor: 3_000,
  serviceCommissionBps: 0,
  passengerCancellationLimit: 3,
  passengerCancellationWindowHours: 24,
  passengerCancellationBlockHours: 24,
};

const grahovoPattern = /(?:^|[\s,])(?:село|с\.)?\s*грахово(?:[\s,]|$)/iu;
const grahovoDistrictPattern =
  /граховск(?:ий|ого|ом).{0,40}(?:район|муниципальн\w*\s+округ)/iu;
const GRAHOVO_CENTER = { latitude: 56.04758, longitude: 51.95842 } as const;
export const grahovoDriverBaseAddress: Address = {
  id: 'grahovo-driver-base', label: 'с. Грахово', coordinates: GRAHOVO_CENTER,
};
const GRAHOVO_RADIUS_METERS = 6_000;
const GRAHOVO_DISTRICT_RADIUS_METERS = 40_000;

function addressContext(address: Address): string {
  return `${address.label} ${address.details ?? ''}`.trim();
}

function distanceFromGrahovo(address: Address): number {
  const latitudeDelta = (address.coordinates.latitude - GRAHOVO_CENTER.latitude) * Math.PI / 180;
  const longitudeDelta = (address.coordinates.longitude - GRAHOVO_CENTER.longitude) * Math.PI / 180;
  const latitude1 = GRAHOVO_CENTER.latitude * Math.PI / 180;
  const latitude2 = address.coordinates.latitude * Math.PI / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

export function isGrahovoAddress(address: Address): boolean {
  return grahovoPattern.test(addressContext(address)) &&
    distanceFromGrahovo(address) <= GRAHOVO_RADIUS_METERS;
}

/** The driver starts in Grahovo; a return uses the same outward itinerary. */
export function billableRoutePoints(pickup: Address, destinations: readonly Address[]): Address[] {
  const stops = normalizeRouteStops(pickup, destinations);
  const points = [pickup, ...stops];
  if (!stops.length || isGrahovoAddress(pickup)) return points;
  if (isGrahovoAddress(stops[stops.length - 1]!)) return points.reverse();
  return [grahovoDriverBaseAddress, ...points];
}

export function isGrahovoDistrictAddress(address: Address): boolean {
  const context = addressContext(address);
  return (grahovoPattern.test(context) || grahovoDistrictPattern.test(context) ||
    isKotlovkaFareAddress(address) || isYagiKaksiFareAddress(address)) &&
    distanceFromGrahovo(address) <= GRAHOVO_DISTRICT_RADIUS_METERS;
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

const pricingScopeRank: Record<PricingScope, number> = {
  grahovo: 0,
  district: 1,
  intercity: 2,
};

export function classifyMultiStopPricingScope(
  pickup: Address,
  destinations: readonly Address[],
): PricingScope {
  let scope: PricingScope = 'grahovo';
  let origin = pickup;
  for (const destination of destinations) {
    const segmentScope = classifyPricingScope(origin, destination);
    if (pricingScopeRank[segmentScope] > pricingScopeRank[scope]) scope = segmentScope;
    origin = destination;
  }
  return scope;
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

// Old API/cache responses only have the single rate. Do not substitute today's
// defaults for a previously configured rate while clients are being updated.
export function intercityTimeRates(rules: PricingRules) {
  return {
    intercityPerKilometer07To22Minor: rules.intercityPerKilometer07To22Minor ?? rules.intercityPerKilometerMinor,
    intercityPerKilometer22To02Minor: rules.intercityPerKilometer22To02Minor ?? rules.intercityPerKilometerMinor,
    intercityPerKilometer02To07Minor: rules.intercityPerKilometer02To07Minor ?? rules.intercityPerKilometerMinor,
  };
}

function intercityPerKilometerMinorAt(rules: PricingRules, date: Date): number {
  const rates = intercityTimeRates(rules);
  const period = farePeriodAt(date);
  if (period === '07-22') return rates.intercityPerKilometer07To22Minor;
  if (period === '22-02') return rates.intercityPerKilometer22To02Minor;
  return rates.intercityPerKilometer02To07Minor;
}

export type FareRoundingMode = 'nearest' | 'up';
export const fareRoundingMinor = 1_000;
export const fareRoundingMode: FareRoundingMode = 'nearest';

export function roundFareMinor(
  minor: number,
  roundingMinor = fareRoundingMinor,
  mode: FareRoundingMode = fareRoundingMode,
): number {
  const round = mode === 'nearest' ? Math.round : Math.ceil;
  return round(minor / roundingMinor) * roundingMinor;
}

export function calculateFareMinor(
  distanceMeters: number,
  tariff: TariffCode,
  scope: PricingScope,
  rules = defaultPricingRules,
  date = new Date(),
  endpoints?: readonly [Address, Address],
): number {
  const routePrice = scope === 'grahovo'
    ? grahovoFareMinorAt(rules, date)
    : roundFareMinor(
        (distanceMeters / 1_000) *
          (scope === 'district'
            ? districtPerKilometerMinorAt(rules, date)
            : intercityPerKilometerMinorAt(rules, date)),
      );
  const fixedFare = endpoints && fixedGrahovoFareMinor(endpoints[0], endpoints[1], date);
  return roundFareMinor((fixedFare ?? routePrice) +
    (tariff === 'child' ? rules.childSurchargeMinor : 0));
}

export type PricedRouteSegment = {
  distanceMeters: number;
  scope: PricingScope;
  origin?: Address;
  destination?: Address;
};

function isKotlovkaFareAddress(address: Address): boolean {
  const named = /котловк[а-яё]*|баб[а-яё]*[\s-]*яг[а-яё]*|^яг[аи](?:[\s,]|$)/iu.test(addressContext(address));
  return named && Math.abs(address.coordinates.latitude - 56.1180852) <= 0.025 &&
    Math.abs(address.coordinates.longitude - 52.0150708) <= 0.04;
}

function isYagiKaksiFareAddress(address: Address): boolean {
  const named = /(?:^|[\s.,])яги(?:[\s-]+какси)?(?:[\s,]|$)/iu.test(addressContext(address));
  return named && Math.abs(address.coordinates.latitude - 56.0906036) <= 0.02 &&
    Math.abs(address.coordinates.longitude - 51.9506647) <= 0.025;
}

function fixedGrahovoFareMinor(origin: Address, destination: Address, date: Date): number | undefined {
  let remote: Address;
  if (isGrahovoAddress(origin)) remote = destination;
  else if (isGrahovoAddress(destination)) remote = origin;
  else return undefined;
  const period = farePeriodAt(date);
  if (isKotlovkaFareAddress(remote)) return { '07-22': 85_000, '22-02': 125_000, '02-07': 195_000 }[period];
  if (isYagiKaksiFareAddress(remote)) return { '07-22': 50_000, '22-02': 60_000, '02-07': 80_000 }[period];
  return undefined;
}

/**
 * Prices an ordered route. When every point is inside Grahovo, each extra stop
 * adds the configured share of the current fixed Grahovo fare. As soon as a
 * route leaves Grahovo, every leg is added using its normal district/intercity
 * tariff. The child-seat surcharge is charged once per order.
 */
export function calculateMultiStopFareMinor(
  segments: readonly PricedRouteSegment[],
  tariff: TariffCode,
  allPointsInGrahovo: boolean,
  rules = defaultPricingRules,
  date = new Date(),
): number {
  if (!segments.length) return 0;

  const childSurcharge = tariff === 'child' ? rules.childSurchargeMinor : 0;
  if (allPointsInGrahovo) {
    const baseFare = grahovoFareMinorAt(rules, date);
    const extraStopFare = Math.round(
      (baseFare * rules.additionalStopGrahovoSurchargeBps) / 10_000,
    );
    return roundFareMinor(baseFare + extraStopFare * Math.max(0, segments.length - 1) + childSurcharge);
  }

  const routeFare = segments.reduce((total, segment) => total + calculateFareMinor(
    segment.distanceMeters, 'economy', segment.scope, rules, date,
    segment.origin && segment.destination ? [segment.origin, segment.destination] : undefined,
  ), 0);
  return roundFareMinor(routeFare + childSurcharge);
}

export function calculateWaitingChargeMinor(
  totalWaitingSeconds: number,
  freeMinutes = defaultPricingRules.waitingFreeMinutes,
  perMinuteMinor = defaultPricingRules.waitingPerMinuteMinor,
  roundingStepMinor = 1,
  roundingMode: FareRoundingMode = 'up',
): number {
  const billableSeconds = Math.max(0, Math.floor(totalWaitingSeconds) - freeMinutes * 60);
  const billableMinutes = Math.ceil(billableSeconds / 60);
  return roundFareMinor(billableMinutes * perMinuteMinor, roundingStepMinor, roundingMode);
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
  endpoints?: readonly [Address, Address],
): Tariff[] {
  return [
    {
      code: 'economy',
      title: 'Эконом',
      description: 'Обычная поездка',
      childSeatIncluded: false,
      etaMinutes: 4,
      priceMinor: calculateFareMinor(distanceMeters, 'economy', scope, rules, date, endpoints),
    },
    {
      code: 'child',
      title: 'Детский',
      description: 'Приедет машина с подходящим креслом',
      childSeatIncluded: true,
      etaMinutes: 7,
      priceMinor: calculateFareMinor(distanceMeters, 'child', scope, rules, date, endpoints),
    },
  ];
}
