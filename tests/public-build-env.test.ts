import { describe, expect, it } from 'vitest';
import { publicBuildEnvironment } from '../scripts/public-build-env.mjs';

describe('public release build environment', () => {
  it('keeps reserve settings from the production file when dotenv is disabled for Metro', () => {
    expect(publicBuildEnvironment({ EXPO_PUBLIC_FALLBACK_API_URL: 'https://proxy.test/taxigr', JWT_SECRET: 'private', MAX_RELAY_SECRET_KEY: 'private' }, {}))
      .toEqual({ EXPO_PUBLIC_FALLBACK_API_URL: 'https://proxy.test/taxigr' });
  });
  it('preserves an explicit empty override that disables the HTTP fallback', () => {
    expect(publicBuildEnvironment({ EXPO_PUBLIC_FALLBACK_API_URL: 'https://proxy.test' }, { EXPO_PUBLIC_FALLBACK_API_URL: '' }))
      .toEqual({ EXPO_PUBLIC_FALLBACK_API_URL: '' });
  });
  it('rejects an enabled messenger with missing build settings', () => {
    expect(() => publicBuildEnvironment({ EXPO_PUBLIC_MAX_RELAY_ENABLED: '1' }, {})).toThrow('EXPO_PUBLIC_MAX_RELAY_CHANNEL');
  });
  it('allows reserve-disabled builds used by older deployments', () => {
    expect(publicBuildEnvironment({}, {})).toEqual({});
  });
});
