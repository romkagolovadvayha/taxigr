import type { PricingScope } from './pricing';

export type DriverPriorityScope = PricingScope;

export type DriverPriorities = Record<DriverPriorityScope, boolean>;

export type DriverDispatchSettings = Record<DriverPriorityScope, number>;

export const driverPriorityScopes: readonly DriverPriorityScope[] = [
  'grahovo',
  'district',
  'intercity',
];

export const defaultDriverPriorities: DriverPriorities = {
  grahovo: false,
  district: false,
  intercity: false,
};

export const defaultDriverDispatchSettings: DriverDispatchSettings = {
  grahovo: 1,
  district: 1,
  intercity: 1,
};

export const driverPriorityScopeLabels: Record<DriverPriorityScope, string> = {
  grahovo: 'Грахово',
  district: 'Граховский район',
  intercity: 'Межгород',
};

export function canDriverReceivePriorityOrder(
  releaseAt: Date | string | null | undefined,
  hasPriority: boolean,
  now = new Date(),
): boolean {
  if (hasPriority || !releaseAt) return true;
  return new Date(releaseAt).getTime() <= now.getTime();
}
