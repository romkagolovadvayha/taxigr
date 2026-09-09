import {
  findAvailableAppUpdate, updatePromptStorageKey,
  type AppStore, type AvailableAppUpdate, type InstalledApplication,
} from '../domain/app-updates';

type UpdateDependencies = {
  getInstallation: () => Promise<InstalledApplication | null>;
  fetchManifest: () => Promise<unknown>;
  readSeen: (key: string) => Promise<boolean>;
  writeSeen: (key: string) => Promise<void>;
  clearSeen: (key: string) => Promise<void>;
  readCached: (store: AppStore) => Promise<unknown>;
  writeCached: (store: AppStore, manifest: unknown) => Promise<void>;
  openStore: (update: AvailableAppUpdate) => Promise<void>;
  now?: () => number;
};

export type AppUpdateState = {
  available: AvailableAppUpdate | null;
  promptVisible: boolean;
  canPrompt: boolean;
  opening: boolean;
  error: string | null;
};

/** One controller per app installation session, independent of login/logout. */
export class AppUpdateController {
  private state: AppUpdateState = { available: null, promptVisible: false, canPrompt: false, opening: false, error: null };
  private listeners = new Set<() => void>();
  private seen = new Set<string>();
  private checkPromise: Promise<void> | null = null;
  private presenting = false;
  private initializedCache = false;
  private nextCheckAt = 0;

  constructor(private dependencies: UpdateDependencies) {}

  getSnapshot = (): AppUpdateState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private setState(change: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }
  private now(): number { return this.dependencies.now?.() ?? Date.now(); }

  check = (force = false): Promise<void> => {
    if (this.checkPromise) return this.checkPromise;
    if (!force && this.now() < this.nextCheckAt) return Promise.resolve();
    this.nextCheckAt = this.now() + 60_000;
    this.checkPromise = this.refresh().finally(() => { this.checkPromise = null; });
    return this.checkPromise;
  };

  private async refresh(): Promise<void> {
    try {
      const installed = await this.dependencies.getInstallation();
      if (!installed) {
        this.setState({ available: null, promptVisible: false, canPrompt: false });
        return;
      }
      if (!this.initializedCache) {
        this.initializedCache = true;
        try {
          const cached = await this.dependencies.readCached(installed.store);
          this.setState({ available: findAvailableAppUpdate(cached, installed, this.now()) });
        } catch { /* A cache is optional; fetch the live registry below. */ }
      }
      const manifest = await this.dependencies.fetchManifest();
      const available = findAvailableAppUpdate(manifest, installed, this.now());
      let wasSeen = true;
      if (available && !this.seen.has(available.id)) {
        try { wasSeen = await this.dependencies.readSeen(updatePromptStorageKey(available)); } catch { /* Keep only the profile action if storage is unavailable. */ }
      }
      this.setState({
        available, canPrompt: !!available && !wasSeen,
        promptVisible: this.state.promptVisible && available?.id === this.state.available?.id,
        error: null,
      });
      this.nextCheckAt = this.now() + 30 * 60_000;
      // Cache only this store's validated release; it keeps the profile useful offline.
      const cached = { schemaVersion: 1, releases: { [installed.store]: available } };
      await this.dependencies.writeCached(installed.store, cached).catch(() => undefined);
    } catch { /* Update checks must never prevent login or a ride. */ }
  }

  presentPrompt = async (eligible: () => boolean): Promise<void> => {
    const update = this.state.available;
    if (!update || !this.state.canPrompt || this.presenting || this.seen.has(update.id) || !eligible()) return;
    this.presenting = true;
    const key = updatePromptStorageKey(update);
    try {
      // Persist before presenting, so even a process kill cannot repeat the popup.
      await this.dependencies.writeSeen(key);
      if (!eligible() || this.state.available?.id !== update.id) {
        await this.dependencies.clearSeen(key);
        return;
      }
      this.seen.add(update.id);
      this.setState({ promptVisible: true, canPrompt: false });
    } catch {
      this.setState({ canPrompt: false });
    } finally {
      this.presenting = false;
    }
  };

  dismissPrompt = (): void => { this.setState({ promptVisible: false, error: null }); };

  openStore = async (): Promise<void> => {
    const update = this.state.available;
    if (!update || this.state.opening) return;
    this.setState({ opening: true, error: null });
    try {
      await this.dependencies.openStore(update);
      // Keep the profile action until the installed binary is actually updated.
      this.setState({ promptVisible: false });
    } catch {
      this.setState({ error: 'Не удалось открыть магазин. Попробуйте ещё раз.' });
    } finally {
      this.setState({ opening: false });
    }
  };
}
