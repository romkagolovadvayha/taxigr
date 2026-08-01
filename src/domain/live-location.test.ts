import { describe, expect, it } from 'vitest';

import {
  LIVE_LOCATION_UPDATE_INTERVAL_MS,
  liveLocationUpdateDelay,
} from './live-location';

describe('live location throttling', () => {
  it('accepts the first position immediately', () => {
    expect(liveLocationUpdateDelay(0, 1_000)).toBe(0);
  });

  it('keeps updates at least seven seconds apart', () => {
    expect(liveLocationUpdateDelay(10_000, 12_000)).toBe(5_000);
    expect(liveLocationUpdateDelay(10_000, 17_000)).toBe(0);
    expect(LIVE_LOCATION_UPDATE_INTERVAL_MS).toBe(7_000);
  });
});
