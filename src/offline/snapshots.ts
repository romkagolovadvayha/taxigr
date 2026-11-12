import { readOfflineData, writeOfflineData } from '../storage/offline-storage';
import type { Address, PaymentMethod } from '../domain/models';

type Entry = { value: unknown; savedAt: number };
type Data = { version:1; owner:string; entries:Record<string,Entry> };
export type BookingDraft = { pickup:Address|null; destinations:Address[]; paymentMethod:PaymentMethod; scheduledAt?:string; comment:string };
const MAX_AGE_MS = 7 * 86_400_000;
export class OfflineSnapshots {
  private data?: Data;
  private loading?: Promise<void>;
  private revision = 0;
  private owner?: string;
  private writes = Promise.resolve();
  constructor(private read=readOfflineData, private write=writeOfflineData) {}
  private async load(owner:string) {
    if (this.owner !== owner) { this.owner=owner; this.revision++; this.data=undefined; this.loading=undefined; }
    const revision = this.revision;
    this.loading ??= (async () => {
      try {
        const raw = await this.read();
        if (!raw || raw.length > 1_900_000 || revision !== this.revision) return;
        const data = JSON.parse(raw) as Data;
        if (data.version === 1 && data.owner === owner && data.entries && typeof data.entries === 'object') this.data = data;
      } catch { /* Corrupted local data never prevents opening the application. */ }
    })();
    await this.loading;
    if (revision !== this.revision || this.owner !== owner) return false;
    if (this.data?.owner !== owner) this.data = {version:1,owner,entries:{}};
    return true;
  }
  async get<T>(owner:string,key:string): Promise<T|null> {
    if (!await this.load(owner)) return null;
    if (this.owner !== owner) return null;
    const entry = this.data!.entries[key];
    return entry && Number.isFinite(entry.savedAt) && entry.savedAt <= Date.now() && Date.now()-entry.savedAt < MAX_AGE_MS ? entry.value as T : null;
  }
  async set(owner:string,key:string,value:unknown) {
    if (!await this.load(owner)) return;
    if (this.owner !== owner) return;
    this.data!.entries[key] = {value,savedAt:Date.now()};
    const entries = Object.entries(this.data!.entries).sort((a,b)=>b[1].savedAt-a[1].savedAt).slice(0,48);
    this.data!.entries = Object.fromEntries(entries);
    let raw = JSON.stringify(this.data);
    while (raw.length > 900_000 && entries.length > 1) { const [oldest] = entries.pop()!; delete this.data!.entries[oldest]; raw=JSON.stringify(this.data); }
    if (raw.length > 900_000) return;
    const revision = this.revision;
    this.writes = this.writes.then(()=>revision === this.revision ? this.write(raw) : undefined).catch(()=>undefined);
    await this.writes;
  }
  clear() {
    this.revision++; this.owner=undefined; this.data=undefined; this.loading=undefined;
    this.writes=this.writes.then(()=>this.write('')).catch(()=>undefined);
    return this.writes;
  }
}
export const offlineSnapshots = new OfflineSnapshots();
/** Never use old responses as approval to create/accept/cancel a ride. Only these GET views are stored. */
export function offlineReadablePath(path:string): boolean {
  const url = new URL(path,'https://local.invalid');
  return /^\/v1\/(bootstrap|driver\/profile|driver\/earnings|orders|orders\/[^/]+|orders\/[^/]+\/messages|admin\/(settings|tariffs|driver-dispatch-settings))$/.test(url.pathname);
}
