import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const bot=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../src/api/reserve-config',()=>({reserveChannelsEnabled:()=>true}));
vi.mock('../src/api/reserve-request',()=>({requestThroughReserve:bot.request}));
const ok=(value:string)=>new Response(JSON.stringify({data:{value}}));
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
beforeEach(()=>{vi.stubEnv('EXPO_PUBLIC_API_URL','https://taxi.test');vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL','https://proxy.test/taxigr');bot.request.mockReset();});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();vi.resetModules();});
describe('HTTP fallback cancellation and concurrent recovery',()=>{
 it.each(['headers','tuples'])('preserves %s custom headers on both HTTP paths',async kind=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(ok('proxy'));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');const headers:HeadersInit=kind==='headers'?new Headers({'X-Request-Context':'test-context'}):[['X-Request-Context','test-context']];
  await apiRequest('/v1/action',{method:'POST',token:'test-session',body:'{}',headers});
  for(const [,options] of fetcher.mock.calls){expect(new Headers(options.headers).get('X-Request-Context')).toBe('test-context');expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-session');}
 });
 it('keeps a cancellation during response-body reading classified as cancellation',async()=>{
  const external=new AbortController();const body=deferred<unknown>();
  const fetcher=vi.fn().mockImplementation(async(_url,options)=>({ok:true,status:200,json:()=>new Promise((_resolve,reject)=>{body.resolve(null);options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});})}));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');const rejected=expect(apiRequest('/v1/slow-body',{method:'POST',body:'{}',signal:external.signal})).rejects.toMatchObject({code:'REQUEST_ABORTED'});await body.promise;external.abort();await rejected;expect(fetcher).toHaveBeenCalledOnce();expect(bot.request).not.toHaveBeenCalled();
 });
 it('does not call the network at all for a request cancelled before it starts',async()=>{
  const external=new AbortController();external.abort();const fetcher=vi.fn().mockResolvedValue(ok('unexpected'));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');await expect(apiRequest('/v1/action',{method:'POST',signal:external.signal})).rejects.toMatchObject({code:'REQUEST_ABORTED'});expect(fetcher).not.toHaveBeenCalled();expect(bot.request).not.toHaveBeenCalled();
 });
 it('does not let a late proxy response replace a newly recovered primary',async()=>{
  vi.useFakeTimers();const main=deferred<Response>(),proxy=deferred<Response>();let recovering=false;
  const fetcher=vi.fn(async(url:string)=>{if(!recovering){if(url.startsWith('https://taxi.test'))throw new TypeError('offline');return ok('proxy');}return url.startsWith('https://taxi.test')?main.promise:proxy.promise;});vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client'),{getApiChannel}=await import('../src/api/api-channel');await apiRequest('/v1/start');await vi.advanceTimersByTimeAsync(15001);recovering=true;
  const first=apiRequest('/v1/a'),second=apiRequest('/v1/b');await vi.advanceTimersByTimeAsync(0);main.resolve(ok('primary'));await first;expect(getApiChannel()).toBe('primary');proxy.resolve(ok('late-proxy'));await second;expect(getApiChannel()).toBe('primary');
 });
 it('leaves an external avatar URL usable even if no API URL is configured',async()=>{
  vi.stubEnv('EXPO_PUBLIC_API_URL',undefined);vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL','');const {resolveApiUrl}=await import('../src/api/client');expect(resolveApiUrl('https://images.test/avatar.jpg')).toBe('https://images.test/avatar.jpg');
 });
});
