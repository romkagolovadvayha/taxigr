import { describe, expect, it, vi } from 'vitest';
import { safeRemoteAvatarUrl } from '../server/social-avatar';

vi.mock('../server/db', () => ({
  db: { execute: vi.fn() },
  firstRow: vi.fn(),
}));

describe('social profile avatars', () => {
  it('accepts only public HTTPS image locations', () => {
    expect(safeRemoteAvatarUrl('https://cdn.example/avatar.jpg'))
      .toBe('https://cdn.example/avatar.jpg');
    expect(safeRemoteAvatarUrl('http://cdn.example/avatar.jpg')).toBeNull();
    expect(safeRemoteAvatarUrl('https://127.0.0.1/avatar.jpg')).toBeNull();
    expect(safeRemoteAvatarUrl('https://localhost/avatar.jpg')).toBeNull();
    expect(safeRemoteAvatarUrl('not a url')).toBeNull();
  });
});
