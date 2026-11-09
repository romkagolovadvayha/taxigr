import type { RideOrder } from './models';

export const preorderMinLeadMinutes = 30;
export const preorderMaxLeadDays = 30;
export const preorderDepartureMinutes = 15;

export function formatPickupDate(date: string): string {
  return date.split('-').reverse().join('.');
}

export function preorderBounds(now: number) {
  return {
    min: Math.ceil((now + preorderMinLeadMinutes * 60_000) / 60_000) * 60_000,
    max: Math.floor((now + preorderMaxLeadDays * 86_400_000) / 60_000) * 60_000,
  };
}

const pickupTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Samara', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const compactPickupTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Samara', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function formatScheduledPickup(value: string, compact = false): string {
  const date = new Date(value);
  return compact ? compactPickupTimeFormatter.format(date) : `${pickupTimeFormatter.format(date)} (Грахово)`;
}

export function isReservedRide(ride: Pick<RideOrder, 'scheduledAt' | 'status' | 'driverQueuePosition'>): boolean {
  return Boolean(ride.scheduledAt && ride.status === 'accepted' && ride.driverQueuePosition === undefined);
}
