import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('../src/storage/offline-storage', () => ({ readOfflineData: storage.read, writeOfflineData: storage.write }));

beforeEach(()=>{
  storage.read.mockReset().mockResolvedValue(null);
  storage.write.mockReset().mockResolvedValue(undefined);
  vi.stubEnv('EXPO_PUBLIC_API_URL','https://taxi.test');
  vi.stubEnv('EXPO_PUBLIC_MAX_RELAY_ENABLED','0');
  vi.stubEnv('EXPO_PUBLIC_VK_RELAY_ENABLED','0');
});
afterEach(()=>{vi.resetModules();vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe('offline reads never authorize ride mutations',()=>{
  it('returns the server response while a slow disk save continues in the background', async () => {
    let finishWrite!: () => void;
    storage.write.mockImplementation(() => new Promise<void>(resolve => { finishWrite = resolve; }));
    const fetcher = vi.fn().mockImplementation(async () => new Response('{"data":{"id":"r1","status":"accepted"}}'));
    vi.stubGlobal('fetch', fetcher);
    const { apiRequest, setApiCacheSession } = await import('../src/api/client');
    setApiCacheSession('session', 'passenger');
    let result: unknown;
    const response = apiRequest('/v1/orders/r1', { token: 'session' }).then(value => { result = value; });
    try {
      await vi.waitFor(() => expect(storage.write).toHaveBeenCalledOnce());
      expect(result).toMatchObject({ id: 'r1', status: 'accepted' });
      fetcher.mockRejectedValue(new TypeError('No network'));
      await expect(apiRequest('/v1/orders/r1', { token: 'session', offlineFallback: true })).resolves.toMatchObject({ id: 'r1' });
    } finally {
      finishWrite();
      await response;
    }
  });
  it('only returns a stored order when offline reading is explicitly requested',async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response('{"data":{"id":"r1","status":"accepted"}}'));
    vi.stubGlobal('fetch',fetch);
    const {apiRequest,setApiCacheSession}=await import('../src/api/client');
    setApiCacheSession('session','passenger');
    await apiRequest('/v1/orders/r1',{token:'session'});
    fetch.mockRejectedValue(new TypeError('No network'));
    await expect(apiRequest('/v1/orders/r1',{token:'session'})).rejects.toMatchObject({code:'NETWORK_ERROR'});
    await expect(apiRequest('/v1/orders/r1',{token:'session',offlineFallback:true})).resolves.toMatchObject({id:'r1',status:'accepted'});
    await expect(apiRequest('/v1/orders/r1/accept',{token:'session',method:'POST',offlineFallback:true})).rejects.toMatchObject({code:'NETWORK_ERROR'});
    expect((await import('../src/offline/connectivity')).isServerReachable()).toBe(false);
  });
  it('does not reuse snapshots after a permission rejection or for another account',async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response('{"data":{"id":"r1","status":"accepted"}}'));
    vi.stubGlobal('fetch',fetch);
    const {apiRequest,setApiCacheSession}=await import('../src/api/client');
    setApiCacheSession('session','passenger'); await apiRequest('/v1/orders/r1',{token:'session'});
    fetch.mockImplementation(async()=>new Response('{"error":{"message":"Denied"}}',{status:403}));
    await expect(apiRequest('/v1/orders/r1',{token:'session',offlineFallback:true})).rejects.toMatchObject({status:403});
    setApiCacheSession('other-session','other-passenger'); fetch.mockRejectedValue(new TypeError('No network'));
    await expect(apiRequest('/v1/orders/r1',{token:'other-session',offlineFallback:true})).rejects.toMatchObject({code:'NETWORK_ERROR'});
  });
  it('does not contact any transport when the device has no network',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    (await import('../src/offline/connectivity')).setPhysicalConnectivity(false);
    const {apiRequest}=await import('../src/api/client');
    await expect(apiRequest('/v1/orders',{method:'POST',body:'{}'})).rejects.toMatchObject({code:'NETWORK_ERROR'});
    expect(fetch).not.toHaveBeenCalled();
  });
});
