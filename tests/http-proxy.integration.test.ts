import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {currentInitialLegalAcceptance} from '../src/legal/documents';
import type {RideOrder} from '../src/domain/models';
const state=vi.hoisted(()=>({channels:[] as any[]}));
vi.mock('../src/api/reserve-config',()=>({reserveChannelsEnabled:()=>state.channels.length>0,getReserveClients:()=>state.channels}));
const enabled=process.env.RUN_HTTP_PROXY_INTEGRATION==='1';
const primary=process.env.HTTP_RECHECK_PRIMARY_URL??'http://127.0.0.1:4211',proxy=process.env.HTTP_RECHECK_PROXY_URL??'http://127.0.0.1:4215';
const upstream=process.env.HTTP_RECHECK_UPSTREAM_URL??'http://127.0.0.1:4210';
const database=process.env.HTTP_RECHECK_DATABASE??'mysql://root@127.0.0.1:3312/taxi_max_integration';
async function fault(base:string,body:unknown){const value=body&&typeof body==='object'&&'primary' in body?{...body,offline:Boolean(body.primary)}:body;await fetch(base+'/__test/fault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});}
async function stats(base:string){return (await fetch(base+'/__test/stats')).json();}
async function fixtures(){return JSON.parse(await readFile('tmp/max-app-sessions.json','utf8')).sessions as {token:string;name:string;user:{id:string;roles:string[]}}[];}
describe.skipIf(!enabled)('live isolated primary/proxy/bot chain',()=>{
 beforeEach(async()=>{expect(new URL(database).pathname).toMatch(/^\/taxi_(?:qa_|max_integration$)/);for(const url of [primary,proxy,upstream])expect(new URL(url).hostname).toBe('127.0.0.1');vi.stubEnv('EXPO_OS','web');vi.stubEnv('EXPO_PUBLIC_API_URL',primary);vi.stubEnv('EXPO_PUBLIC_FALLBACK_API_URL',proxy+'/taxigr');state.channels=[];await fault(primary,{primary:false,dropNextResponse:false});await fault(proxy,{offline:false,dropNextResponse:false});});
 afterEach(async()=>{await fault(primary,{primary:false,dropNextResponse:false});await fault(proxy,{offline:false,dropNextResponse:false});vi.restoreAllMocks();vi.unstubAllEnvs();vi.resetModules();});
 it('keeps ordinary traffic on the primary without touching the proxy',async()=>{
  const before=await stats(proxy),{apiRequest}=await import('../src/api/client');await apiRequest('/v1/booking-availability');const after=await stats(proxy);expect(after.stats.requests).toBe(before.stats.requests);
 });
 it('loads passenger, driver and superadmin through the fixed proxy with the same roles',async()=>{
  await fault(primary,{primary:true});const {apiRequest}=await import('../src/api/client');
  for(const session of await fixtures()){const result=await apiRequest<{id:string;roles:string[]}>('/v1/me',{token:session.token,cache:'no-store'});expect(result.id).toBe(session.user.id);expect(result.roles).toEqual(session.user.roles);const bootstrap=await apiRequest<{driverQueue:unknown}>('/v1/bootstrap',{token:session.token,cache:'no-store'});expect(bootstrap.driverQueue).toBeDefined();}
  expect((await import('../src/api/api-channel')).getApiChannel()).toBe('proxy');
 });
 it('returns to primary after its recovery interval without probing bots',async()=>{
  let now=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>now);await fault(primary,{primary:true});const {apiRequest}=await import('../src/api/client');await apiRequest('/v1/booking-availability');await fault(primary,{primary:false});now+=15001;await apiRequest('/v1/booking-availability');expect((await import('../src/api/api-channel')).getApiChannel()).toBe('primary');
 });
 it('does not duplicate an order when its successful primary response is lost',async()=>{
  const session=(await fixtures())[0]!,{apiRequest}=await import('../src/api/client');
  const pickup={id:'proxy-test-a',label:'с. Грахово, ул. Ачинцева, 5',coordinates:{latitude:56.0477,longitude:51.9586}},destination={id:'proxy-test-b',label:'с. Грахово, ул. Колпакова, 1Б',coordinates:{latitude:56.04576,longitude:51.96165}};
  const quote=await apiRequest<{quoteToken:string}>('/v1/quotes',{method:'POST',token:session.token,body:JSON.stringify({pickup,destination})});
  const key='proxy-review-'+randomUUID(),ids:string[]=[],original=globalThis.fetch;let order:RideOrder|undefined;
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{if(String(url).endsWith('/v1/orders')&&options?.method==='POST')ids.push(new Headers(options.headers).get('X-Taxi-Request-Id')??'');return original(url,options);});
  await fault(primary,{dropNextResponse:true});
  try{
   order=await apiRequest<RideOrder>('/v1/orders',{method:'POST',token:session.token,body:JSON.stringify({pickup,destination,tariff:'economy',quoteToken:quote.quoteToken,paymentMethod:'cash',idempotencyKey:key,deviceId:'proxy-review-device-001',legalAcceptance:currentInitialLegalAcceptance()})});
   expect(ids).toHaveLength(2);expect(ids[0]).toBeTruthy();expect(ids[1]).toBe(ids[0]);
   const db=await mysql.createConnection(database);
   try{
    const [rows]=await db.query<any[]>('SELECT COUNT(*) AS total FROM orders WHERE idempotency_key = ?',[key]);expect(Number(rows[0].total)).toBe(1);
    const requestKey=createHash('sha256').update('Bearer '+session.token+'\n'+ids[0]).digest('hex');const [ledger]=await db.query<any[]>('SELECT status_code,response_body FROM transport_request_replays WHERE request_key = ?',[requestKey]);expect(Number(ledger[0].status_code)).toBe(201);expect(JSON.parse(ledger[0].response_body).data.id).toBe(order.id);
   }finally{await db.end();}
  }finally{if(order){const db=await mysql.createConnection(database);try{await db.execute('DELETE FROM orders WHERE id=? AND passenger_id=? AND idempotency_key=?',[order.id,session.user.id,key]);}finally{await db.end();}}}
 });
 it.each(['vk','max'] as const)('uses the real %s service dialog only after both HTTP routes fail',async name=>{
  const {startBotApiRelay}=await import('../server/bot-api-relay'),{VkBotTransport}=await import('../src/api/vk-bot-transport'),{VkRelayClient}=await import('../src/api/vk-relay-client'),{MaxBotTransport}=await import('../src/api/max-bot-transport'),{MaxRelayClient}=await import('../src/api/max-relay-client');
  const env:Record<string,string>={};for(const file of ['.env','.env.local'])Object.assign(env,dotenv.parse(await readFile(file)));
  const runtime=JSON.parse(await readFile('tmp/max-app-runtime.json','utf8')),service=JSON.parse(await readFile('tmp/vk-relay-service-account.json','utf8'));expect(service.userId).toBe('33610634');expect(env.VK_COMMUNITY_ID).toBe('193790756');
  const common={channel:runtime.channel,publicKey:runtime.publicKey},max={botToken:runtime.botToken,chatId:runtime.chatId,serviceUserId:runtime.serviceUserId},vk={botToken:env.VK_BOT_TOKEN!,groupId:env.VK_COMMUNITY_ID!,serviceUserId:service.userId};
  const api=name==='vk'?new VkBotTransport({token:vk.botToken,groupId:vk.groupId,serviceUserId:vk.serviceUserId}):new MaxBotTransport({token:max.botToken,chatId:max.chatId,serviceUserId:max.serviceUserId});
  const client=name==='vk'?new VkRelayClient({...common,...vk}):new MaxRelayClient({...common,...max});state.channels=[{name,client}];
  const app={hasRoute:()=>true,log:{warn:()=>{}},inject:async(options:any)=>{const r=await fetch(upstream+options.url,{method:options.method,headers:options.headers,body:options.payload});return {statusCode:r.status,body:await r.text()};}} as unknown as FastifyInstance;
  const stop=await startBotApiRelay(app,{api,label:name==='vk'?'VK':'MAX',recipientId:name==='vk'?vk.serviceUserId:max.chatId,channel:runtime.channel,secretKey:runtime.secretKey});
  try{await fault(primary,{primary:true});await fault(proxy,{offline:true});const {apiRequest}=await import('../src/api/client');expect(await apiRequest('/v1/booking-availability',{token:(await fixtures())[0]!.token,cache:'no-store'})).toEqual({enabled:true});expect((await import('../src/api/api-channel')).getApiChannel()).toBe(name);}
  finally{await stop();}
 },30000);
});
