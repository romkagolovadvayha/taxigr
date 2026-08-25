import { describe, expect, it } from 'vitest';

import { elapsedSecondsSince, formatElapsedClock } from '../src/domain/elapsed-time';

describe('elapsed search time', () => {
  const startedAt = '2026-08-25T10:00:00.000Z';
  const startMs = new Date(startedAt).getTime();

  it('formats elapsed minutes and seconds as a stable clock', () => {
    expect(formatElapsedClock(startedAt, startMs)).toBe('00:00');
    expect(formatElapsedClock(startedAt, startMs + 86_000)).toBe('01:26');
    expect(formatElapsedClock(startedAt, startMs + 3_661_000)).toBe('61:01');
  });

  it('uses completed seconds without rounding up', () => {
    expect(elapsedSecondsSince(startedAt, startMs + 999)).toBe(0);
    expect(elapsedSecondsSince(startedAt, startMs + 1_000)).toBe(1);
  });

  it('clamps future and invalid timestamps to zero', () => {
    expect(formatElapsedClock(startedAt, startMs - 10_000)).toBe('00:00');
    expect(formatElapsedClock('not-a-date', startMs)).toBe('00:00');
  });

  it('keeps counting from creation time after a search price increase', () => {
    const rideBeforeIncrease = { createdAt: startedAt, priceMinor: 15_000 };
    const rideAfterIncrease = {
      ...rideBeforeIncrease,
      priceMinor: 18_000,
      searchPriceIncreaseMinor: 3_000,
      updatedAt: new Date(startMs + 240_000).toISOString(),
    };

    expect(formatElapsedClock(rideAfterIncrease.createdAt, startMs + 241_000)).toBe('04:01');
  });
});
