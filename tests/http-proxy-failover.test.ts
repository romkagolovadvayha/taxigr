import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const bot=vi.hoisted(()=>({enabled:true,request:vi.fn()}));
vi.mock('../src/api/reserve-config',()=>({reserveChannelsEnabled:()=>bot.enabled}));
vi.mock('../src/api/reserve-request',()=>({requestThroughReserve:bot.request}));
const ok=(value:string)=>new Response(JSON.stringify({data:{value}}));
beforeEach(()=>{
 vi.stubEnv('EXPO_PUBLIC_API_URL','https://taxi.test');vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL','https://proxy.test/taxigr');
 bot.enabled=true;bot.request.mockReset().mockResolvedValue({status:200,body:'{"data":{"value":"bot"}}'});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
describe('primary -> HTTP proxy -> messengers',()=>{
 it('defaults canonical production builds to Prostoj and supports explicit disabling',async()=>{
  vi.stubEnv('EXPO_PUBLIC_API_URL','https://api.taxigr.ru');vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL',undefined);
  const {readHttpProxyConfig}=await import('../src/api/http-proxy-config');expect(readHttpProxyConfig()?.apiUrl).toBe('https://hooks.prostoj.store/taxigr');
  vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL','');expect(readHttpProxyConfig()).toBeNull();
 });
 it('keeps a healthy primary and sends nothing to either fallback',async()=>{
  const fetcher=vi.fn().mockResolvedValue(ok('primary'));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');expect(await apiRequest('/v1/test')).toEqual({value:'primary'});
  expect(fetcher).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0]![0]).toBe('https://taxi.test/v1/test');expect(bot.request).not.toHaveBeenCalled();
 });
 it('uses the HTTP proxy before a bot and keeps one operation ID and body',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(ok('proxy'));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');expect(await apiRequest('/v1/orders',{method:'POST',token:'test',body:'{"draft":1}'})).toEqual({value:'proxy'});
  const first=fetcher.mock.calls[0]![1],second=fetcher.mock.calls[1]![1];expect(fetcher.mock.calls[1]![0]).toBe('https://proxy.test/taxigr/v1/orders');
  expect(second.body).toBe(first.body);expect(second.headers['X-Taxi-Request-Id']).toBe(first.headers['X-Taxi-Request-Id']);expect(second.headers.Authorization).toBe('Bearer test');expect(bot.request).not.toHaveBeenCalled();
  expect((await import('../src/api/api-channel')).getApiChannel()).toBe('proxy');
 });
 it('continues to messengers only when both HTTP routes fail, retaining the ID',async()=>{
  const fetcher=vi.fn().mockRejectedValue(new TypeError('offline'));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');expect(await apiRequest('/v1/orders',{method:'POST',body:'{}',token:'test'})).toEqual({value:'bot'});
  expect(fetcher.mock.calls.map(v=>v[0])).toEqual(['https://taxi.test/v1/orders','https://proxy.test/taxigr/v1/orders']);
  expect(bot.request.mock.calls[0]![0]).toMatchObject({body:'{}',requestId:fetcher.mock.calls[0]![1].headers['X-Taxi-Request-Id']});
 });
 it.each([401,403,409,429,500,502,503,504])('does not bypass a structured application rejection (%s)',async status=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(new Response('{"error":{"code":"BUSINESS_REJECTION"}}',{status}));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');await expect(apiRequest('/v1/action',{method:'POST'})).rejects.toMatchObject({status,code:'BUSINESS_REJECTION'});expect(fetcher).toHaveBeenCalledTimes(2);expect(bot.request).not.toHaveBeenCalled();
 });
 it('falls through a proxy upstream error but not its application error',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(new Response('{"error":{"code":"PROXY_UNAVAILABLE"}}',{status:502})));
  const {apiRequest}=await import('../src/api/client');expect(await apiRequest('/v1/test')).toEqual({value:'bot'});
 });
 it('supports the web proxy when bot channels are disabled and returns to the primary',async()=>{
  vi.useFakeTimers();bot.enabled=false;const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok('proxy')).mockImplementation(async(url:string)=>ok(url.startsWith('https://taxi.test')?'primary':'proxy'));vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');expect(await apiRequest('/v1/test')).toEqual({value:'proxy'});
  await vi.advanceTimersByTimeAsync(10_000);expect(await apiRequest('/v1/test')).toEqual({value:'proxy'});
  await vi.advanceTimersByTimeAsync(5_001);expect(await apiRequest('/v1/test')).toEqual({value:'primary'});expect(bot.request).not.toHaveBeenCalled();
 });
 it('does not hammer either dead HTTP route during the cooldown',async()=>{
  const fetcher=vi.fn().mockRejectedValue(new TypeError('offline'));vi.stubGlobal('fetch',fetcher);const {apiRequest}=await import('../src/api/client');
  await apiRequest('/v1/first');await Promise.all(Array.from({length:10},(_,i)=>apiRequest(`/v1/read/${i}`)));expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('does not turn a user cancellation into a fallback',async()=>{
  const controller=new AbortController();const fetcher=vi.fn().mockImplementation(async()=>{controller.abort();throw new DOMException('Aborted','AbortError');});vi.stubGlobal('fetch',fetcher);
  const {apiRequest}=await import('../src/api/client');await expect(apiRequest('/v1/action',{signal:controller.signal})).rejects.toMatchObject({code:'REQUEST_ABORTED'});expect(fetcher).toHaveBeenCalledOnce();expect(bot.request).not.toHaveBeenCalled();
 });
 it('treats a broken successful JSON response as an unavailable route',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('<html>gateway</html>')).mockResolvedValue(ok('proxy')));
  const {apiRequest}=await import('../src/api/client');expect(await apiRequest('/v1/bootstrap')).toEqual({value:'proxy'});
 });
 it('routes own image links via the selected proxy and preserves outside images',async()=>{
  const {setApiChannel}=await import('../src/api/api-channel');setApiChannel('proxy');const {resolveApiUrl}=await import('../src/api/client');
  expect(resolveApiUrl('/uploads/photo.jpg')).toBe('https://proxy.test/taxigr/uploads/photo.jpg');expect(resolveApiUrl('https://taxi.test/v1/photo?signature=example')).toBe('https://proxy.test/taxigr/v1/photo?signature=example');expect(resolveApiUrl('https://images.test/a.jpg')).toBe('https://images.test/a.jpg');
 });
 it('rejects insecure, credential-bearing and native loopback proxy configurations',async()=>{
  const {readHttpProxyConfig}=await import('../src/api/http-proxy-config');
  for(const value of ['http://proxy.test','https://user:pass@proxy.test','https://proxy.test/?token=private','https://proxy.test/#fragment']){vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL',value);expect(readHttpProxyConfig()).toBeNull();}
  vi.stubEnv('EXPO_PUBLIC_API_URL','http://127.0.0.1:4211');vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL','http://127.0.0.1:4215/taxigr');vi.stubEnv('EXPO_OS','android');expect(readHttpProxyConfig()).toBeNull();vi.stubEnv('EXPO_OS','web');expect(readHttpProxyConfig()?.socketPath).toBe('/taxigr/socket.io');
 });
});
