import { describe, expect, it, vi } from 'vitest';
import { OfflineSnapshots, offlineReadablePath } from '../src/offline/snapshots';

describe('account-scoped offline data', () => {
  it('restores a draft and last order after a cold process start', async () => {
    let disk:string|null=null;
    const store=new OfflineSnapshots(async()=>disk,async value=>{disk=value;});
    await store.set('passenger','booking-draft',{comment:'Вход со двора'});
    await store.set('passenger','/v1/bootstrap',{order:{id:'ride-1'}});
    const cold=new OfflineSnapshots(async()=>disk,async()=>{});
    expect(await cold.get('passenger','booking-draft')).toEqual({comment:'Вход со двора'});
    expect(await cold.get('passenger','/v1/bootstrap')).toEqual({order:{id:'ride-1'}});
    expect(await cold.get('other-user','booking-draft')).toBeNull();
  });
  it('clears private snapshots on logout and discards corrupt data', async () => {
    let disk:string|null='broken';
    const store=new OfflineSnapshots(async()=>disk,async value=>{disk=value;});
    expect(await store.get('a','x')).toBeNull();
    await store.set('a','x',{phone:'test'}); await store.clear();
    expect(disk).toBe(''); expect(await store.get('a','x')).toBeNull();
  });
  it('does not restore data older than seven days', async () => {
    const raw=JSON.stringify({version:1,owner:'a',entries:{x:{savedAt:Date.now()-8*86400000,value:'stale'}}});
    expect(await new OfflineSnapshots(async()=>raw,async()=>{}).get('a','x')).toBeNull();
  });
  it('does not resurrect a pending read after clear or account change', async () => {
    let resolve!:(value:string|null)=>void;
    const read=vi.fn(()=>new Promise<string|null>(r=>{resolve=r;}));
    const store=new OfflineSnapshots(read,async()=>{});
    const waiting=store.get('a','x'); await store.clear();
    resolve(JSON.stringify({version:1,owner:'a',entries:{x:{value:'private',savedAt:Date.now()}}}));
    expect(await waiting).toBeNull();
  });
  it('only allows saved GET views, not quotes, auth or mutations', () => {
    expect(offlineReadablePath('/v1/bootstrap')).toBe(true);
    expect(offlineReadablePath('/v1/orders/ride-1/messages')).toBe(true);
    expect(offlineReadablePath('/v1/quotes')).toBe(false);
    expect(offlineReadablePath('/v1/orders/ride-1/accept')).toBe(false);
    expect(offlineReadablePath('/v1/auth/refresh')).toBe(false);
  });
});
