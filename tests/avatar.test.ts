import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectAvatarMimeType } from '../src/utils/avatar';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('avatar uploads', () => {
  it('detects the supported image type from the uploaded bytes', () => {
    expect(detectAvatarMimeType('/9j/4AAQSkZJRgABAQ')).toBe('image/jpeg');
    expect(detectAvatarMimeType('iVBORw0KGgoAAAANSUhEUg')).toBe('image/png');
    expect(detectAvatarMimeType('UklGRiIAAABXRUJQVlA4')).toBe('image/webp');
  });

  it('rejects data that is not a supported image', () => {
    expect(detectAvatarMimeType('R0lGODlhAQABAIAAAA')).toBeNull();
  });

  it('resolves stored avatar paths against the API origin', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.example.test/');
    const { resolveApiUrl } = await import('../src/api/client');

    expect(resolveApiUrl('/v1/users/user-id/avatar?v=1')).toBe(
      'https://api.example.test/v1/users/user-id/avatar?v=1',
    );
    expect(resolveApiUrl('https://cdn.example/avatar.png')).toBe(
      'https://cdn.example/avatar.png',
    );
    expect(resolveApiUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });
});
