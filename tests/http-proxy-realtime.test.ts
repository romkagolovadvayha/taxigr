import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({api:vi.fn(),sockets:[] as any[]}));
vi.mock('../src/api/client',()=>({apiRequest:state.api}));
vi.mock('../src/api/reserve-config',()=>({reserveChannelsEnabled:()=>false}));
vi.mock('socket.io-client',()=>({io:(url:string,options:{path:string})=>{
 const listeners=new Map<string,Function[]>();let any:Function=()=>{};
 const socket={url,path:options.path,connected:false,disconnect:vi.fn(),on:(name:string,fn:Function)=>{listeners.set(name,[...(listeners.get(name)??[]),fn]);},onAny:(fn:Function)=>{any=fn;},receive:(name:string,...args:unknown[])=>{for(const fn of listeners.get(name)??[])fn(...args);if(!['connect','disconnect','connect_error'].includes(name))any(name,...args);}};
 state.sockets.push(socket);return socket;
}}));
beforeEach(()=>{vi.useFakeTimers();vi.stubEnv('EXPO_PUBLIC_API_URL','https://api.test');vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL','https://proxy.test/taxigr');state.sockets.length=0;state.api.mockReset().mockResolvedValue({cursor:'test:0',reset:false,events:[]});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.resetModules();});
it('moves the shared ride/chat connection through the proxy and back, ignoring old socket events',async()=>{
 const {createAppSocket}=await import('../src/api/realtime');const {setApiChannel}=await import('../src/api/api-channel');
 const ride=createAppSocket('https://api.test','same-session'),chat=createAppSocket('https://api.test','same-session');const order=vi.fn();chat.on('order:updated',order);
 expect(state.sockets).toHaveLength(1);setApiChannel('proxy');expect(state.sockets).toHaveLength(2);expect(state.sockets[0].disconnect).toHaveBeenCalledOnce();expect(state.sockets[1]).toMatchObject({url:'https://proxy.test',path:'/taxigr/socket.io'});
 state.sockets[0].receive('order:updated',{id:'stale'});expect(order).not.toHaveBeenCalled();state.sockets[1].connected=true;state.sockets[1].receive('connect');state.sockets[1].receive('order:updated',{id:'current'});expect(order).toHaveBeenCalledExactlyOnceWith({id:'current'});
 ride.disconnect();expect(state.sockets[1].disconnect).not.toHaveBeenCalled();setApiChannel('primary');expect(state.sockets).toHaveLength(3);expect(state.sockets[2]).toMatchObject({url:'https://api.test',path:'/socket.io'});chat.disconnect();expect(state.sockets[2].disconnect).toHaveBeenCalledOnce();
});
it('keeps event delivery available with HTTP fallback even when both messenger channels are disabled',async()=>{
 const {createAppSocket}=await import('../src/api/realtime');const socket=createAppSocket('https://api.test','proxy-only');await vi.advanceTimersByTimeAsync(1000);expect(state.api).toHaveBeenCalledOnce();expect(socket.connected).toBe(true);socket.disconnect();
});
