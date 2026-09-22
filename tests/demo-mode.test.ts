import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  [false, 'true', false],
  [false, 'false', false],
  [true, 'false', false],
  [true, 'true', true],
] as const)('allows demo accounts only in opted-in development builds (%s, %s)', async (dev, flag, expected) => {
  vi.stubGlobal('__DEV__', dev);
  vi.stubEnv('EXPO_PUBLIC_DEMO_MODE', flag);
  const { demoEnabled } = await import('../src/auth/demo-mode');
  expect(demoEnabled).toBe(expected);
});
