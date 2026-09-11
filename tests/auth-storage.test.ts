import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import type { SessionUser } from '../src/domain/models';
import { clearSessionToken, readSessionToken, readStoredSession, writeSessionToken, writeStoredSession } from '../src/storage/auth-storage';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { storage.delete(key); }),
}));

const session = { token: 'test-session', user: {
  id: 'passenger-test', name: 'Пассажир', phone: '+70000000000',
  roles: ['passenger'], profileComplete: true,
} as SessionUser, legalConsentRequired: true };

beforeEach(() => { storage.clear(); vi.stubEnv('EXPO_OS', 'android'); });
afterEach(() => vi.unstubAllEnvs());

describe('saved session for immediate startup', () => {
  it('restores the profile and consent only for its matching token', async () => {
    await writeSessionToken(session.token);
    await writeStoredSession(session);
    expect(await readStoredSession((await readSessionToken())!)).toEqual(session);
    expect(await readStoredSession('another-account')).toBeNull();
  });
  it('supports an existing installation with only a token', async () => {
    await writeSessionToken(session.token);
    expect(await readStoredSession(session.token)).toBeNull();
    expect(await readSessionToken()).toBe(session.token);
  });
  it('removes both credentials and cached identity on logout or rejection', async () => {
    await writeSessionToken(session.token);
    await writeStoredSession(session);
    await clearSessionToken();
    expect(await readSessionToken()).toBeNull();
    expect(await readStoredSession(session.token)).toBeNull();
  });
  it('ignores a damaged snapshot without losing the stored login', async () => {
    await writeSessionToken(session.token);
    storage.set('taxi_grahovo_session_snapshot', '{');
    expect(await readStoredSession(session.token)).toBeNull();
    storage.set('taxi_grahovo_session_snapshot', JSON.stringify({ token: session.token, user: {} }));
    expect(await readStoredSession(session.token)).toBeNull();
    expect(await readSessionToken()).toBe(session.token);
  });
  it('does not resurrect a session when a slow secure-store write finishes after logout starts', async () => {
    let finish!: () => void;
    vi.mocked(SecureStore.setItemAsync).mockImplementationOnce((key, value) => new Promise<void>(resolve => {
      finish = () => { storage.set(key, value); resolve(); };
    }));
    const saving = writeSessionToken(session.token);
    await Promise.resolve();
    const snapshot = writeStoredSession(session);
    const logout = clearSessionToken();
    finish();
    await Promise.all([saving, snapshot, logout]);
    expect(await readSessionToken()).toBeNull();
    expect(await readStoredSession(session.token)).toBeNull();
  });
});
