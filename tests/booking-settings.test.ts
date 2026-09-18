import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertBookingEnabled, readBookingSettings, saveBookingSettings } from '../server/booking-settings';
import { db, withTransaction } from '../server/db';

vi.mock('../server/db', () => ({ db: { query: vi.fn() }, withTransaction: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('booking gate and persistence', () => {
  it('rejects creation while recruitment is active', async () => {
    vi.mocked(db.query).mockResolvedValue([[{ enabled: 0 }], []] as never);
    await expect(assertBookingEnabled()).rejects.toMatchObject({ statusCode: 409, code: 'BOOKING_DISABLED' });
  });
  it('allows creation after enabling', async () => {
    vi.mocked(db.query).mockResolvedValue([[{ enabled: 1 }], []] as never);
    await expect(assertBookingEnabled()).resolves.toBeUndefined();
  });
  it('fails closed if settings cannot be read', async () => {
    vi.mocked(db.query).mockResolvedValue([[], []] as never);
    await expect(readBookingSettings()).rejects.toThrow();
    vi.mocked(db.query).mockRejectedValue(new Error('Offline'));
    await expect(assertBookingEnabled()).rejects.toThrow('Offline');
  });
  it('locks the flag until the order transaction completes', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[{ enabled: 0 }], []]) };
    await expect(assertBookingEnabled(connection as never)).rejects.toMatchObject({ code: 'BOOKING_DISABLED' });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('LOCK IN SHARE MODE'));
    expect(db.query).not.toHaveBeenCalled();
  });
  it('saves and audits the setting in one transaction', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[{ enabled: 1 }], []]), execute: vi.fn() };
    vi.mocked(withTransaction).mockImplementation(async (callback) => callback(connection as never));
    expect(await saveBookingSettings({ enabled: false }, 'admin', '127.0.0.1')).toEqual({ enabled: false });
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'));
    expect(connection.execute).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE booking_settings'), [false, 'admin']);
    expect(connection.execute).toHaveBeenNthCalledWith(2, expect.stringContaining('audit_logs'), ['admin', '{"enabled":true}', '{"enabled":false}', '127.0.0.1']);
  });
});
