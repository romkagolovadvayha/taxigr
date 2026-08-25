export function elapsedSecondsSince(startedAt: string | Date, now = Date.now()): number {
  const startedAtMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor((now - startedAtMs) / 1_000));
}

export function formatElapsedClock(startedAt: string | Date, now = Date.now()): string {
  const elapsedSeconds = elapsedSecondsSince(startedAt, now);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
