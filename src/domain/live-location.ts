export const LIVE_LOCATION_UPDATE_INTERVAL_MS = 7_000;

export function liveLocationUpdateDelay(
  lastUpdateAt: number,
  now: number,
  intervalMs = LIVE_LOCATION_UPDATE_INTERVAL_MS,
): number {
  if (lastUpdateAt <= 0) return 0;
  return Math.max(0, lastUpdateAt + intervalMs - now);
}
