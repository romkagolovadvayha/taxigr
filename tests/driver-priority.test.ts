import { describe, expect, it } from 'vitest';

import { canDriverReceivePriorityOrder } from '../src/domain/driver-priority';

describe('driver priority order release', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');

  it('allows priority drivers immediately', () => {
    expect(
      canDriverReceivePriorityOrder('2026-08-26T12:01:00.000Z', true, now),
    ).toBe(true);
  });

  it('holds an order from regular drivers until the configured release time', () => {
    expect(
      canDriverReceivePriorityOrder('2026-08-26T12:01:00.000Z', false, now),
    ).toBe(false);
    expect(
      canDriverReceivePriorityOrder('2026-08-26T12:01:00.000Z', false, new Date('2026-08-26T12:01:00.000Z')),
    ).toBe(true);
  });

  it('keeps legacy orders available', () => {
    expect(canDriverReceivePriorityOrder(null, false, now)).toBe(true);
  });
});
