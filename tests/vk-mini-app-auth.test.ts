import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  verifyVkMiniAppLaunchParams,
  verifyVkMiniAppPhone,
} from '../server/vk-mini-app-auth';

const appId = '54699999';
const secret = 'protected-mini-app-secret';
const nowSeconds = 1_800_000_000;

function launchParams(overrides: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    vk_app_id: appId,
    vk_user_id: '1234567',
    vk_is_app_user: '1',
    vk_are_notifications_enabled: '0',
    vk_language: 'ru',
    vk_ref: 'other',
    vk_access_token_settings: '',
    vk_platform: 'mobile_android',
    vk_is_favorite: '0',
    vk_ts: String(nowSeconds),
    ...overrides,
  };
  const signed = Object.entries(values)
    .filter(([key]) => key.startsWith('vk_'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const sign = createHmac('sha256', secret).update(signed).digest('base64url');
  return `${signed}&sign=${sign}`;
}

describe('VK Mini Apps authentication', () => {
  it('validates signed launch parameters for the configured app', () => {
    expect(verifyVkMiniAppLaunchParams({
      launchParams: launchParams(),
      appId,
      secret,
      nowSeconds,
    })).toEqual({ appId, userId: '1234567', timestamp: nowSeconds });
  });

  it('rejects tampered and expired launch parameters', () => {
    const tampered = launchParams().replace('vk_user_id=1234567', 'vk_user_id=7654321');
    expect(() => verifyVkMiniAppLaunchParams({
      launchParams: tampered,
      appId,
      secret,
      nowSeconds,
    })).toThrow('Подпись запуска VK недействительна');

    expect(() => verifyVkMiniAppLaunchParams({
      launchParams: launchParams({ vk_ts: String(nowSeconds - 901) }),
      appId,
      secret,
      nowSeconds,
      maxAgeSeconds: 900,
    })).toThrow('Сессия VK устарела');
  });

  it('rejects parameters for another app, duplicated fields, and future timestamps', () => {
    expect(() => verifyVkMiniAppLaunchParams({
      launchParams: launchParams(),
      appId: '11111111',
      secret,
      nowSeconds,
    })).toThrow('Приложение или пользователь VK не совпадает');

    expect(() => verifyVkMiniAppLaunchParams({
      launchParams: `${launchParams()}&vk_user_id=1234567`,
      appId,
      secret,
      nowSeconds,
    })).toThrow('Параметры запуска VK неоднозначны');

    expect(() => verifyVkMiniAppLaunchParams({
      launchParams: launchParams({ vk_ts: String(nowSeconds + 61) }),
      appId,
      secret,
      nowSeconds,
    })).toThrow('Сессия VK устарела');
  });

  it('validates the VK-signed phone for the same app and user', () => {
    const phoneNumber = '79998887766';
    const sign = createHash('sha256')
      .update(`${appId}${secret}1234567phone_number${phoneNumber}`)
      .digest('hex');
    expect(verifyVkMiniAppPhone({
      appId,
      secret,
      userId: '1234567',
      phoneNumber,
      sign,
    })).toBe(true);
    expect(verifyVkMiniAppPhone({
      appId,
      secret,
      userId: '1234567',
      phoneNumber: '79990000000',
      sign,
    })).toBe(false);
  });
});
