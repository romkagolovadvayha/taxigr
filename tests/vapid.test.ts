import { describe, expect, it } from 'vitest';
import webpush from 'web-push';

import { getVapidConfig } from '../server/vapid';

describe('Web Push VAPID configuration', () => {
  it('provides a stable valid key pair', () => {
    const first = getVapidConfig();
    const second = getVapidConfig();

    expect(second).toEqual(first);
    expect(first.publicKey.length).toBeGreaterThan(80);
    expect(first.privateKey.length).toBeGreaterThan(40);
    expect(() =>
      webpush.setVapidDetails(first.subject, first.publicKey, first.privateKey),
    ).not.toThrow();
  });
});
