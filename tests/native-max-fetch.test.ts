import { afterEach, describe, expect, it, vi } from 'vitest';
const native=vi.hoisted(()=>({request:vi.fn(),cancel:vi.fn()}));
vi.mock('expo-modules-core',()=>({requireOptionalNativeModule:()=>native}));
afterEach(()=>{vi.clearAllMocks();});
describe('native MAX HTTPS adapter',()=>{
  it('uses the native transport for MAX with its authorization and body',async()=>{
    native.request.mockResolvedValue({status:200,body:'{"messages":[]}'});
    const {maxTransportFetch}=await import('../src/api/max-transport-fetch.native');
    const response=await maxTransportFetch('https://platform-api2.max.ru/messages',{method:'POST',headers:{Authorization:'fake-token'},body:'{}'});
    expect(await response.json()).toEqual({messages:[]});
    expect(native.request).toHaveBeenCalledWith(expect.any(String),'https://platform-api2.max.ru/messages','POST',{authorization:'fake-token'},'{}');
  });
  it('rejects requests to a proxy, HTTP or any unrelated host',async()=>{
    const {maxTransportFetch}=await import('../src/api/max-transport-fetch.native');
    for (const url of ['http://platform-api2.max.ru/messages','http://127.0.0.1:4212/max','https://api.taxigr.ru/messages']) {
      await expect(maxTransportFetch(url)).rejects.toThrow('MAX_TLS_HOST_DENIED');
    }
    expect(native.request).not.toHaveBeenCalled();
  });
  it('cancels a pending native request and never presents its late reply as a success',async()=>{
    let finish!:(response:{status:number;body:string})=>void;
    native.request.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const {maxTransportFetch}=await import('../src/api/max-transport-fetch.native');
    const controller=new AbortController();
    const pending=expect(maxTransportFetch('https://platform-api2.max.ru/messages',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
    controller.abort();expect(native.cancel).toHaveBeenCalledOnce();
    finish({status:200,body:'{}'});await pending;
  });
});
