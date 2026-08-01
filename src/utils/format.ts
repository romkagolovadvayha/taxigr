export function formatMoney(minor: number): string {
  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(Math.round(minor / 100))} ₽`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function russianCount(
  value: number,
  forms: readonly [singular: string, few: string, many: string],
): string {
  const lastTwo = value % 100;
  const last = value % 10;
  const form =
    lastTwo >= 11 && lastTwo <= 14
      ? forms[2]
      : last === 1
        ? forms[0]
        : last >= 2 && last <= 4
          ? forms[1]
          : forms[2];
  return `${value} ${form}`;
}

export function formatRetryAfter(seconds: number): string {
  const safeSeconds = Math.max(1, Math.ceil(seconds));
  if (safeSeconds < 60) {
    return russianCount(safeSeconds, ['секунду', 'секунды', 'секунд']);
  }
  if (safeSeconds < 3_600) {
    return russianCount(Math.ceil(safeSeconds / 60), ['минуту', 'минуты', 'минут']);
  }
  return russianCount(Math.ceil(safeSeconds / 3_600), ['час', 'часа', 'часов']);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatEstimatedArrivalTime(
  now: Date,
  pickupEtaMinutes: number,
  routeDurationSeconds: number,
): string {
  const arrival = new Date(
    now.getTime() + Math.max(0, pickupEtaMinutes) * 60_000 + Math.max(0, routeDurationSeconds) * 1_000,
  );
  const hours = String(arrival.getHours()).padStart(2, '0');
  const minutes = String(arrival.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
