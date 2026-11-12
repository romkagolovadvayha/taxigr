import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({enabled:true,api:vi.fn(),sockets:[] as {connected:boolean;disconnect:ReturnType<typeof vi.fn>;emit:(event:string)=>void}[]}));
vi.mock('../src/api/client',()=>({apiRequest:mocks.api}));
vi.mock('../src/api/reserve-config',()=>({reserveChannelsEnabled:()=>mocks.enabled}));
vi.mock('socket.io-client',()=>({io:()=>{const events=new Map<string,Set<(...args:unknown[])=>void>>();const socket={connected:false,on:(event:string,fn:(...args:unknown[])=>void)=>{const set=events.get(event)??new Set();set.add(fn);events.set(event,set);},onAny:vi.fn(),disconnect:vi.fn(),emit:(event:string)=>{for(const fn of events.get(event)??[])fn();}};mocks.sockets.push(socket);return socket;}}));

beforeEach(()=>{vi.useFakeTimers();vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL','');mocks.enabled=true;mocks.api.mockReset().mockResolvedValue({cursor:'epoch:1',reset:true,events:[]});mocks.sockets.length=0;});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.resetModules();});
describe('MAX realtime sessions',()=>{
 it('also shares the ordinary web socket with reserve disabled and never polls bots',async()=>{
   mocks.enabled=false;
   const {createAppSocket}=await import('../src/api/realtime');const ride=createAppSocket('https://api.test','normal-web'),chat=createAppSocket('https://api.test','normal-web');
   expect(mocks.sockets).toHaveLength(1);mocks.sockets[0]!.connected=true;mocks.sockets[0]!.emit('connect');
   const ready=vi.fn();chat.on('connect',ready);await vi.advanceTimersByTimeAsync(0);expect(ready).toHaveBeenCalledOnce();
   ride.disconnect();expect(mocks.sockets[0]!.disconnect).not.toHaveBeenCalled();
   mocks.sockets[0]!.connected=false;mocks.sockets[0]!.emit('connect_error');await vi.advanceTimersByTimeAsync(60_000);expect(mocks.api).not.toHaveBeenCalled();
   chat.disconnect();expect(mocks.sockets[0]!.disconnect).toHaveBeenCalledOnce();
 });
 it('does not accelerate polling when repeated socket errors arrive',async()=>{
   const {createAppSocket}=await import('../src/api/realtime');const socket=createAppSocket('https://api.test','bounded-errors');
   await vi.advanceTimersByTimeAsync(1000);expect(mocks.api).toHaveBeenCalledOnce();
   for(let i=0;i<20;i++){mocks.sockets[0]!.emit('connect_error');await vi.advanceTimersByTimeAsync(100);}
   expect(mocks.api).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(4000);expect(mocks.api).toHaveBeenCalledTimes(2);socket.disconnect();
 });
 it('reduces polling attempts while every channel is unavailable',async()=>{
   mocks.api.mockRejectedValue(new Error('offline'));
   const {createAppSocket}=await import('../src/api/realtime');const socket=createAppSocket('https://api.test','offline-backoff');
   await vi.advanceTimersByTimeAsync(60_000);expect(mocks.api.mock.calls.length).toBeLessThanOrEqual(3);socket.disconnect();
 });
 it('shares one connection for a ride and a chat, and connects a late chat subscriber',async()=>{
   const {createAppSocket}=await import('../src/api/realtime');const ride=createAppSocket('https://api.test','one-user');const rideReady=vi.fn();ride.on('connect',rideReady);
   await vi.advanceTimersByTimeAsync(1000);expect(rideReady).toHaveBeenCalledOnce();
   const chat=createAppSocket('https://api.test','one-user');const chatReady=vi.fn();chat.on('connect',chatReady);await vi.advanceTimersByTimeAsync(0);
   expect(mocks.sockets).toHaveLength(1);expect(chat.connected).toBe(true);expect(chatReady).toHaveBeenCalledOnce();
   ride.disconnect();expect(chat.connected).toBe(true);chat.disconnect();const calls=mocks.api.mock.calls.length;await vi.advanceTimersByTimeAsync(20000);expect(mocks.api).toHaveBeenCalledTimes(calls);
 });
 it('separates two taxi sessions and delivers only each session response',async()=>{
   const {createAppSocket}=await import('../src/api/realtime');
   mocks.api.mockImplementation((_path:string,options:{token:string})=>Promise.resolve({cursor:'epoch:1',reset:false,events:[{event:'order:updated',payload:{owner:options.token}}]}));
   const first=createAppSocket('https://api.test','passenger'),second=createAppSocket('https://api.test','driver');const a=vi.fn(),b=vi.fn();first.on('order:updated',a);second.on('order:updated',b);
   await vi.advanceTimersByTimeAsync(1000);expect(a).toHaveBeenCalledWith({owner:'passenger'});expect(b).toHaveBeenCalledWith({owner:'driver'});expect(mocks.sockets).toHaveLength(2);first.disconnect();second.disconnect();
 });
});
