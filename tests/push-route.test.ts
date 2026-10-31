import { describe, expect, it } from 'vitest';
import { pushRoute } from '../src/notifications/push-route';

describe('push destinations', () => {
  it('opens unassigned driver offers without requesting private trip details', () => {
    expect(pushRoute({ orderId: 'available-order', role: 'driver' })).toBe('/driver');
  });
  it('opens the passenger order', () => {
    expect(pushRoute({ orderId: 'assigned-order' })).toBe('/orders/assigned-order');
  });
  it.each(['passenger', 'driver'])('preserves the ride chat for %s', (role) => {
    expect(pushRoute({ orderId: 'assigned-order', role, chat: 'true' })).toBe('/chat/assigned-order');
  });
  it('encodes an order id as one path segment', () => {
    expect(pushRoute({ orderId: 'a/b?c=d' })).toBe('/orders/a%2Fb%3Fc%3Dd');
  });
  it('handles generic and malformed notification data', () => {
    expect(pushRoute()).toBe('/');
    expect(pushRoute({ orderId: {} })).toBe('/');
    expect(pushRoute({ role: 'driver' })).toBe('/driver');
  });
});
