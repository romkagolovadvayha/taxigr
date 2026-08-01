import { describe, expect, it } from 'vitest';

import { canTransitionRide, driverRouteTarget } from '../src/domain/ride-state';

describe('ride state machine', () => {
  it('allows only the ordered driver lifecycle', () => {
    expect(canTransitionRide('searching', 'accepted')).toBe(true);
    expect(canTransitionRide('accepted', 'driver_arriving')).toBe(true);
    expect(canTransitionRide('driver_arriving', 'driver_waiting')).toBe(true);
    expect(canTransitionRide('driver_waiting', 'in_progress')).toBe(true);
    expect(canTransitionRide('in_progress', 'completed')).toBe(true);
  });

  it('rejects status skipping and terminal mutations', () => {
    expect(canTransitionRide('searching', 'in_progress')).toBe(false);
    expect(canTransitionRide('completed', 'cancelled')).toBe(false);
    expect(canTransitionRide('cancelled', 'searching')).toBe(false);
  });

  it('routes the driver to the next operational target', () => {
    expect(driverRouteTarget('accepted')).toBe('pickup');
    expect(driverRouteTarget('driver_arriving')).toBe('pickup');
    expect(driverRouteTarget('driver_waiting')).toBe('destination');
    expect(driverRouteTarget('in_progress')).toBe('destination');
    expect(driverRouteTarget('searching')).toBeNull();
    expect(driverRouteTarget('completed')).toBeNull();
  });
});
