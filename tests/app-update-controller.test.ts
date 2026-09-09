import { describe, expect, it, vi } from 'vitest';
import { AppUpdateController } from '../src/updates/update-controller';
import type { InstalledApplication } from '../src/domain/app-updates';

function setup() {
  const storage = new Map<string, string>();
  let now = Date.parse('2026-09-09T00:00:00Z');
  let installed: InstalledApplication | null = { platform: 'android', store: 'rustore', version: '1.0.10', build: '29' };
  let manifest: unknown = { schemaVersion: 1, releases: { rustore: { version: '1.0.11', build: '31', publishedAt: '2026-09-01T00:00:00Z' } } };
  const dependencies = {
    getInstallation: vi.fn(async () => installed),
    fetchManifest: vi.fn(async () => manifest),
    readSeen: vi.fn(async (key: string) => storage.get(key) === '1'),
    writeSeen: vi.fn(async (key: string) => { storage.set(key, '1'); }),
    clearSeen: vi.fn(async (key: string) => { storage.delete(key); }),
    readCached: vi.fn(async (store: string) => JSON.parse(storage.get(store) ?? 'null') as unknown),
    writeCached: vi.fn(async (store: string, value: unknown) => { storage.set(store, JSON.stringify(value)); }),
    openStore: vi.fn(async () => undefined),
    now: () => now,
  };
  const controller = new AppUpdateController(dependencies);
  return {
    controller, dependencies, restart: () => new AppUpdateController(dependencies),
    advance: (ms: number) => { now += ms; },
    setInstalled: (value: InstalledApplication | null) => { installed = value; },
    setManifest: (value: unknown) => { manifest = value; },
  };
}

describe('app update lifecycle', () => {
  it('shows once across repeated events and restarts, but retains the profile update action', async () => {
    const { controller, restart, dependencies } = setup();
    await controller.check();
    await Promise.all([controller.presentPrompt(() => true), controller.presentPrompt(() => true)]);
    expect(dependencies.writeSeen).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().promptVisible).toBe(true);
    controller.dismissPrompt();
    await controller.check(true);
    await controller.presentPrompt(() => true);
    expect(controller.getSnapshot()).toMatchObject({ promptVisible: false, canPrompt: false, available: { version: '1.0.11' } });
    const reopened = restart();
    await reopened.check();
    await reopened.presentPrompt(() => true);
    expect(reopened.getSnapshot()).toMatchObject({ promptVisible: false, canPrompt: false, available: { version: '1.0.11' } });
  });

  it('announces the next published build even if the previous update was dismissed', async () => {
    const { controller, setManifest } = setup();
    await controller.check();
    await controller.presentPrompt(() => true);
    controller.dismissPrompt();
    setManifest({ schemaVersion: 1, releases: { rustore: { version: '1.0.12', build: '32', publishedAt: '2026-09-08T00:00:00Z' } } });
    await controller.check(true);
    await controller.presentPrompt(() => true);
    expect(controller.getSnapshot()).toMatchObject({ promptVisible: true, available: { version: '1.0.12' } });
  });

  it('does not consume the popup while a ride or another modal is active', async () => {
    const { controller, dependencies } = setup();
    await controller.check();
    await controller.presentPrompt(() => false);
    expect(dependencies.writeSeen).not.toHaveBeenCalled();
    await controller.presentPrompt(() => true);
    expect(controller.getSnapshot().promptVisible).toBe(true);
  });

  it('defers safely if a driver offer arrives during the storage write', async () => {
    const { controller, dependencies } = setup();
    await controller.check();
    let eligible = true;
    dependencies.writeSeen.mockImplementationOnce(async () => { eligible = false; });
    await controller.presentPrompt(() => eligible);
    expect(controller.getSnapshot().promptVisible).toBe(false);
    expect(dependencies.clearSeen).toHaveBeenCalledTimes(1);
    eligible = true;
    await controller.presentPrompt(() => eligible);
    expect(controller.getSnapshot().promptVisible).toBe(true);
  });

  it('keeps the action after opening the store; clears it only for an installed update', async () => {
    const { controller, dependencies, setInstalled } = setup();
    await controller.check();
    await controller.presentPrompt(() => true);
    await controller.openStore();
    expect(dependencies.openStore).toHaveBeenCalledWith(expect.objectContaining({ store: 'rustore' }));
    expect(controller.getSnapshot()).toMatchObject({ promptVisible: false, available: { version: '1.0.11' } });
    setInstalled({ platform: 'android', store: 'rustore', version: '1.0.11', build: '31' });
    await controller.check(true);
    expect(controller.getSnapshot().available).toBeNull();
  });

  it('retains the last verified profile reminder offline without a new popup', async () => {
    const { controller, restart, dependencies } = setup();
    await controller.check();
    dependencies.fetchManifest.mockRejectedValue(new Error('offline'));
    const reopened = restart();
    await reopened.check();
    expect(reopened.getSnapshot()).toMatchObject({ promptVisible: false, canPrompt: false, error: null, available: { version: '1.0.11' } });
  });

  it('silently tolerates missing server and disabled native updates', async () => {
    const { controller, dependencies, setInstalled } = setup();
    dependencies.fetchManifest.mockRejectedValue(new Error('404'));
    await controller.check();
    expect(controller.getSnapshot().available).toBeNull();
    setInstalled(null);
    await controller.check(true);
    expect(dependencies.fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('does not prompt when persistent storage fails', async () => {
    const { controller, dependencies } = setup();
    dependencies.writeSeen.mockRejectedValue(new Error('storage'));
    await controller.check();
    await controller.presentPrompt(() => true);
    expect(controller.getSnapshot()).toMatchObject({ promptVisible: false, canPrompt: false, available: { version: '1.0.11' } });
  });

  it('coalesces simultaneous requests and throttles foreground checks', async () => {
    const { controller, dependencies, advance } = setup();
    await Promise.all([controller.check(), controller.check()]);
    await controller.check();
    expect(dependencies.fetchManifest).toHaveBeenCalledTimes(1);
    advance(30 * 60_000);
    await controller.check();
    expect(dependencies.fetchManifest).toHaveBeenCalledTimes(2);
  });

  it('offers a retry if opening the store failed', async () => {
    const { controller, dependencies } = setup();
    await controller.check();
    dependencies.openStore.mockRejectedValueOnce(new Error('no handler'));
    await controller.openStore();
    expect(controller.getSnapshot()).toMatchObject({ opening: false, error: expect.any(String), available: { version: '1.0.11' } });
    await controller.openStore();
    expect(controller.getSnapshot().error).toBeNull();
  });

  it('removes an update withdrawn from the published registry', async () => {
    const { controller, setManifest } = setup();
    await controller.check();
    await controller.presentPrompt(() => true);
    setManifest({ schemaVersion: 1, releases: { rustore: null } });
    await controller.check(true);
    expect(controller.getSnapshot()).toMatchObject({ available: null, promptVisible: false, canPrompt: false });
  });
});
