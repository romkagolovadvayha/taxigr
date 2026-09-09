import { describe, expect, it } from 'vitest';

import { createVkMiniAppSessionHandoff } from '../src/vk-mini-app/session-handoff';

describe('VK Mini App session handoff', () => {
  it('recognizes the signed launch once after a successful login remount', () => {
    const handoff = createVkMiniAppSessionHandoff();

    handoff.remember('vk_user_id=1&sign=valid');

    expect(handoff.consume('vk_user_id=1&sign=valid')).toBe(true);
    expect(handoff.consume('vk_user_id=1&sign=valid')).toBe(false);
  });

  it('does not trust a different launch and invalidates the pending handoff', () => {
    const handoff = createVkMiniAppSessionHandoff();

    handoff.remember('vk_user_id=1&sign=valid');

    expect(handoff.consume('vk_user_id=2&sign=valid')).toBe(false);
    expect(handoff.consume('vk_user_id=1&sign=valid')).toBe(false);
  });

  it('can be explicitly cleared after a failed login or logout', () => {
    const handoff = createVkMiniAppSessionHandoff();

    handoff.remember('vk_user_id=1&sign=valid');
    handoff.clear();

    expect(handoff.consume('vk_user_id=1&sign=valid')).toBe(false);
  });
});
