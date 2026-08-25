import { describe, expect, it } from 'vitest';

import { isNavItemActive } from '../src/domain/role-navigation';

describe('role navigation active item', () => {
  it('does not keep the role root active on nested routes', () => {
    expect(isNavItemActive('/driver/trips', '/driver')).toBe(false);
    expect(isNavItemActive('/admin/orders', '/admin')).toBe(false);
  });

  it('keeps a section active on its detail routes', () => {
    expect(isNavItemActive('/driver/trips/ride-1', '/driver/trips')).toBe(true);
    expect(isNavItemActive('/admin/passengers/user-1', '/admin/passengers')).toBe(true);
    expect(isNavItemActive('/admin/drivers/driver-1', '/admin/drivers')).toBe(true);
  });

  it('matches exact role roots', () => {
    expect(isNavItemActive('/driver', '/driver')).toBe(true);
    expect(isNavItemActive('/admin', '/admin')).toBe(true);
  });
});
