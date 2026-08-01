import { describe, expect, it } from 'vitest';

import { formatEstimatedArrivalTime, formatRetryAfter } from '../src/utils/format';

describe('formatRetryAfter', () => {
  it.each([
    [1, '1 секунду'],
    [2, '2 секунды'],
    [50, '50 секунд'],
    [60, '1 минуту'],
    [1_800, '30 минут'],
    [3_601, '2 часа'],
    [44_123, '13 часов'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatRetryAfter(seconds)).toBe(expected);
  });
});

describe('formatEstimatedArrivalTime', () => {
  it('adds the car arrival ETA and trip duration', () => {
    const now = new Date(2026, 6, 30, 11, 36, 0);

    expect(formatEstimatedArrivalTime(now, 4, 30 * 60)).toBe('12:10');
  });

  it('rolls over to the next day', () => {
    const now = new Date(2026, 6, 30, 23, 58, 0);

    expect(formatEstimatedArrivalTime(now, 4, 10 * 60)).toBe('00:12');
  });
});
