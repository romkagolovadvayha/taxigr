import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { db, firstRow } from '../server/db';
import { signSession } from '../server/security';
import { VkApiError } from '../server/vk-bot';
import { registerVkBroadcastRoutes } from '../server/vk-broadcasts';
import { processVkBroadcasts } from '../server/vk-broadcast-worker';

const vk = vi.hoisted(() => vi.fn());
vi.mock('../server/vk-bot', async original => ({ ...await original<typeof import('../server/vk-bot')>(), callVkApi: vk }));
vi.mock('node:timers/promises', () => ({ setTimeout: async () => undefined }));
vi.mock('../server/config', async original => {
  const actual = await original<typeof import('../server/config')>();
  return { ...actual, config: { ...actual.config, VK_BOT_TOKEN: 'test-taxi-token', VK_COMMUNITY_ID: '100',
    VK_AFISHA_BOT_TOKEN: 'test-afisha-token', VK_AFISHA_COMMUNITY_ID: '200' } };
});

describe.skipIf(process.env.RUN_BROADCAST_INTEGRATION !== '1')('VK broadcasts with isolated MySQL and a stub VK API', () => {
  const app = Fastify(), owner = randomUUID(), admin2 = randomUUID(), passenger = randomUUID();
  let token: string, passengerToken: string;
  const base = '/v1/admin/broadcasts/taxi';
  const send = (path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: Record<string, unknown>, auth = token) => app.inject({ url: path,
    method, headers: { authorization: `Bearer ${auth}` }, ...(body === undefined ? {} : { payload: body }) });
  const draft = async (overrides = {}, community = 'taxi') => {
    const id = randomUUID();
    const response = await send(`/v1/admin/broadcasts/${community}/campaigns/${id}`, 'PUT', { title: 'Новости', text: 'Заказать такси', image: null, ...overrides });
    expect(response.statusCode, response.body).toBe(200); return { id, revision: response.json().data.revision as number };
  };
  const startTest = async (campaign: { id: string; revision: number }, overrides = {}, community = 'taxi') => {
    const response = await send(`/v1/admin/broadcasts/${community}/campaigns/${campaign.id}/runs`, 'POST', { id: randomUUID(), revision: campaign.revision, mode: 'test', ...overrides });
    expect(response.statusCode, response.body).toBe(200); return response.json().data.id as string;
  };
  const defaultVk = async (method: string, params: Record<string, string>) => {
    if (method === 'messages.isMessagesFromGroupAllowed') return { is_allowed: params.user_id === '33' ? 0 : 1 };
    if (method === 'messages.send') return 700 + Number(params.random_id);
    if (method === 'groups.getMembers') return { count: 3, items: [11, 22, 33] };
    if (method === 'messages.getConversations') return { count: 2, items: [
      { conversation: { peer: { id: 11, type: 'user' } } }, { conversation: { peer: { id: 2000000001, type: 'chat' } } },
    ] };
    if (method === 'execute') return [...params.code!.matchAll(/"user_id":"(\d+)"/gu)].map(m => ({ is_allowed: m[1] === '33' ? 0 : 1 }));
    if (method === 'photos.getMessagesUploadServer') return { upload_url: 'https://upload.userapi.com/photo' };
    if (method === 'photos.saveMessagesPhoto') return [{ owner_id: -100, id: 77, access_key: 'test-key' }];
    throw new Error(`Unexpected method: ${method}`);
  };
  beforeAll(async () => {
    const url = new URL(config.MYSQL_URL);
    if (!['127.0.0.1','localhost'].includes(url.hostname) || !url.pathname.startsWith('/taxi_test_')) throw new Error('An isolated local test database is required');
    registerVkBroadcastRoutes(app);
    for (const [id, vkId, role] of [[owner,'11','admin'],[admin2,'22','admin'],[passenger,'33','passenger']] as const) {
      await db.execute('INSERT INTO users (id, vk_id, name) VALUES (?, ?, ?)', [id, randomUUID(), 'Broadcast test']);
      await db.execute('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [id, role]);
      await db.execute(`INSERT INTO user_messenger_accounts (user_id, provider, external_user_id, chat_id, active) VALUES (?, 'vk', ?, ?, TRUE)`, [id, vkId, vkId]);
    }
    token = await signSession({ id: owner, roles: ['admin'] });
    passengerToken = await signSession({ id: passenger, roles: ['admin'] });
    await app.ready();
  });
  beforeEach(async () => {
    for (const table of ['vk_broadcast_deliveries','vk_broadcast_runs','vk_broadcast_campaigns','vk_broadcast_audience']) await db.query(`DELETE FROM ${table}`);
    await db.query("UPDATE vk_broadcast_sync SET status = 'idle', started_at = NULL, finished_at = NULL, next_attempt_at = NULL, attempts = 0, last_error = NULL");
    await db.execute("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')", [admin2]);
    vk.mockReset().mockImplementation(defaultVk); vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await app.close();
    for (const table of ['vk_broadcast_deliveries','vk_broadcast_runs','vk_broadcast_campaigns','vk_broadcast_audience']) await db.query(`DELETE FROM ${table}`);
    await db.execute('DELETE FROM users WHERE id IN (?, ?, ?)', [owner,admin2,passenger]); await db.end(); vi.unstubAllGlobals();
  });
  it('requires authentication and a live administrator role, even if a token claims admin', async () => {
    expect((await app.inject(base)).statusCode).toBe(401);
    expect((await send(base,'GET',undefined,passengerToken)).statusCode).toBe(403);
    expect((await send(base)).statusCode).toBe(200);
    expect((await send('/v1/admin/broadcasts/unknown')).statusCode).toBe(404);
  });
  it('keeps communities separate and never exposes tokens or overwrites another community draft', async () => {
    const c = await draft();
    const other = base.replace('taxi','afisha');
    expect((await send(`${other}/campaigns/${c.id}`)).statusCode).toBe(404);
    expect((await send(`${other}/campaigns/${c.id}`,'PUT',{title:'Changed',text:'Wrong',image:null})).statusCode).toBe(404);
    expect((await send(`${base}/campaigns/${c.id}`)).json().data.text).toBe('Заказать такси');
    const state = await send(other); expect(state.json().data.campaigns).toEqual([]); expect(state.body).not.toContain('test-taxi-token');
  });
  it('validates text, image content, and optimistic draft revisions', async () => {
    const id = randomUUID();
    expect((await send(`${base}/campaigns/${id}`,'PUT',{title:'x',text:' ',image:null})).statusCode).toBe(400);
    expect((await send(`${base}/campaigns/${id}`,'PUT',{title:'x',text:'ok',image:{mimeType:'image/png',base64:Buffer.from('<script>bad image</script>').toString('base64')}})).statusCode).toBe(400);
    const c = await draft();
    expect((await send(`${base}/campaigns/${c.id}`,'PUT',{title:'x',text:'different',image:null,revision:10})).statusCode).toBe(409);
  });
  it('server-selects only administrators, rejects custom recipients, and deduplicates concurrent launches', async () => {
    const c = await draft(); const body = { id:randomUUID(),mode:'test',revision:c.revision };
    expect((await send(`${base}/campaigns/${c.id}/runs`,'POST',{...body,recipients:['33']})).statusCode).toBe(400);
    const responses = await Promise.all([send(`${base}/campaigns/${c.id}/runs`,'POST',body),send(`${base}/campaigns/${c.id}/runs`,'POST',body)]);
    expect(responses.map(r=>r.statusCode)).toEqual([200,200]);
    const [rows] = await db.query<RowDataPacket[]>('SELECT peer_id FROM vk_broadcast_deliveries ORDER BY peer_id'); expect(rows.map(r=>Number(r.peer_id))).toEqual([11,22]);
    for(let i=0;i<3;i++) await processVkBroadcasts();
    expect(vk.mock.calls.filter(c=>c[0]==='messages.send')).toHaveLength(2);
    expect(vk.mock.calls.filter(c=>c[0]==='messages.send').every(c=>c[1].message.startsWith('Тестовая рассылка'))).toBe(true);
    const state=(await send(base)).json().data; expect(state.runs[0]).toMatchObject({status:'completed',sent:2,total:2});
    expect((await send(`${base}/campaigns/${c.id}/runs`,'POST',{...body,id:randomUUID()})).statusCode).toBe(429);
  });
  it('rechecks administrator roles and message permission immediately before delivery', async () => {
    const c = await draft(); await startTest(c);
    await db.execute("DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'",[admin2]);
    vk.mockImplementation(async (m,p)=>m==='messages.isMessagesFromGroupAllowed'?{is_allowed:0}:defaultVk(m,p));
    for(let i=0;i<3;i++) await processVkBroadcasts();
    expect(vk.mock.calls.some(c=>c[0]==='messages.send')).toBe(false);
    expect((await send(base)).json().data.runs[0]).toMatchObject({status:'completed',skipped:2});
  });
  it('collects community members, direct conversations and account permissions with deduplication', async () => {
    expect((await send(base+'/audience/sync','POST',{})).statusCode).toBe(200);
    for(let i=0;i<6;i++) await processVkBroadcasts();
    const state=(await send(base)).json().data;
    expect(state.sync.status).toBe('ready'); expect(state.audience).toEqual({total:3,allowed:2,checked:3});
    expect(vk.mock.calls.filter(c=>c[0]==='execute')).toHaveLength(1);
    expect(vk.mock.calls.some(c=>c[0]==='messages.send')).toBe(false);
    vk.mockClear(); await processVkBroadcasts(); await send(base); expect(vk).not.toHaveBeenCalled();
  });
  it('requires a fresh audience and matching count for a mass send; locks content after launch', async () => {
    const c=await draft(), payload={id:randomUUID(),mode:'all',revision:c.revision,expectedCount:2};
    expect((await send(`${base}/campaigns/${c.id}/runs`,'POST',payload)).statusCode).toBe(409);
    await send(base+'/audience/sync','POST',{}); for(let i=0;i<6;i++)await processVkBroadcasts();
    const generation=(await send(base)).json().data.sync.generation;
    expect((await send(`${base}/campaigns/${c.id}/runs`,'POST',{...payload,audienceGeneration:generation,expectedCount:3})).statusCode).toBe(409);
    const body={...payload,audienceGeneration:generation};
    expect((await send(`${base}/campaigns/${c.id}/runs`,'POST',body)).statusCode).toBe(200);
    expect((await send(`${base}/campaigns/${c.id}/runs`,'POST',body)).statusCode).toBe(200);
    expect((await send(`${base}/campaigns/${c.id}`,'PUT',{title:'x',text:'y',image:null,revision:c.revision})).statusCode).toBe(409);
    expect(await firstRow<RowDataPacket>("SELECT COUNT(*) AS n FROM vk_broadcast_deliveries WHERE peer_id=33")).toMatchObject({n:0});
  });
  it('continues after the archive filter is unavailable to a community token', async () => {
    vk.mockImplementation(async (m,p) => {
      if(m === 'messages.getConversations' && p.filter === 'archive') throw new VkApiError(15,'Access denied');
      return defaultVk(m,p);
    });
    await send(base+'/audience/sync','POST',{});
    for(let i=0;i<6;i++) await processVkBroadcasts();
    const state=(await send(base)).json().data;
    expect(state.sync.status).toBe('ready'); expect(state.audience).toEqual({total:3,allowed:2,checked:3});
  });
  it('does not ignore access errors on ordinary conversations or expired archive credentials', async () => {
    for(const [filter,code] of [['all',15],['archive',5]] as const) {
      vk.mockImplementation(async (m,p) => {
        if(m === 'messages.getConversations' && p.filter === filter) throw new VkApiError(code,'Access denied');
        return defaultVk(m,p);
      });
      await db.query("UPDATE vk_broadcast_sync SET status='idle', started_at=NULL, next_attempt_at=NULL");
      expect((await send(base+'/audience/sync','POST',{})).statusCode).toBe(200);
      for(let i=0;i<4;i++) await processVkBroadcasts();
      expect((await send(base)).json().data.sync.status).toBe('failed');
    }
  });
  it('does not turn partial VK execute failures into denied permissions and backs off', async () => {
    await send(base+'/audience/sync','POST',{}); for(let i=0;i<4;i++)await processVkBroadcasts();
    vk.mockImplementation(async(m,p)=>m==='execute'?[false,false,false]:defaultVk(m,p));
    await processVkBroadcasts(); const calls=vk.mock.calls.length; await processVkBroadcasts(); expect(vk.mock.calls.length).toBe(calls);
    expect((await send(base)).json().data.sync).toMatchObject({status:'syncing'});
    expect(await firstRow<RowDataPacket>('SELECT COUNT(*) AS n FROM vk_broadcast_audience WHERE checked_at IS NOT NULL')).toMatchObject({n:0});
  });
  it('preserves random_id on ambiguous delivery failures and backs off the whole run', async () => {
    await startTest(await draft()); let first=true;
    vk.mockImplementation(async(m,p)=>{if(m==='messages.send'&&first){first=false;throw new Error('response lost after accepted send');}return defaultVk(m,p);});
    await processVkBroadcasts(); const calls=vk.mock.calls.length; await processVkBroadcasts(); expect(vk.mock.calls.length).toBe(calls);
    await db.query('UPDATE vk_broadcast_runs SET next_attempt_at = NULL'); await db.query('UPDATE vk_broadcast_deliveries SET next_attempt_at = NULL');
    await processVkBroadcasts();
    const sends=vk.mock.calls.filter(c=>c[0]==='messages.send'); expect(sends).toHaveLength(2); expect(sends[0]![1].random_id).toBe(sends[1]![1].random_id); expect(sends[0]![1].random_id).not.toBe('0');
  });
  it('uses a cross-process database lock and cancellation prevents remaining deliveries', async () => {
    const run=await startTest(await draft());
    vk.mockImplementation(async(m,p)=>{await new Promise(resolve=>setTimeout(resolve,15));return defaultVk(m,p);});
    await Promise.all([processVkBroadcasts(),processVkBroadcasts()]);
    expect(vk.mock.calls.filter(c=>c[0]==='messages.send')).toHaveLength(1);
    await send(`${base}/runs/${run}/cancel`,'POST',{}); await processVkBroadcasts();
    expect(vk.mock.calls.filter(c=>c[0]==='messages.send')).toHaveLength(1);
    expect((await send(base)).json().data.runs[0]).toMatchObject({status:'cancelled',sent:1,pending:1});
  });
  it('uploads and reuses one image attachment, with the token of the selected community', async () => {
    const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
    const c=await draft({image:{mimeType:'image/png',base64:png}},'afisha'); await startTest(c,{},'afisha');
    const upload=vi.fn().mockResolvedValue(new Response(JSON.stringify({photo:'[{"id":77}]',server:1,hash:'hash'})));vi.stubGlobal('fetch',upload);
    for(let i=0;i<3;i++)await processVkBroadcasts();
    expect(upload).toHaveBeenCalledTimes(1);
    const sends=vk.mock.calls.filter(c=>c[0]==='messages.send'); expect(sends).toHaveLength(2);
    expect(sends.every(c=>c[2]==='test-afisha-token'&&c[1].attachment==='photo-100_77_test-key')).toBe(true);
    expect((await send(base)).json().data.runs).toEqual([]);
  });
  it('stops a campaign on VK flood restrictions without retrying every recipient', async () => {
    await startTest(await draft());
    vk.mockImplementation(async(m,p)=>{if(m==='messages.send')throw new VkApiError(9,'Flood control');return defaultVk(m,p);});
    await processVkBroadcasts(); await processVkBroadcasts();
    expect(vk.mock.calls.filter(c=>c[0]==='messages.send')).toHaveLength(1);
    expect((await send(base)).json().data.runs[0].status).toBe('failed');
  });
  it('backs off and retries an incomplete VK photo upload before sending any message', async () => {
    const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
    await startTest(await draft({image:{mimeType:'image/png',base64:png}}));
    const upload=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({photo:'[]',server:1,hash:'hash'})))
      .mockResolvedValue(new Response(JSON.stringify({photo:'[{"id":77}]',server:1,hash:'hash'})));
    vi.stubGlobal('fetch',upload);
    await processVkBroadcasts(); await processVkBroadcasts();
    expect(upload).toHaveBeenCalledTimes(1); expect(vk.mock.calls.some(c=>c[0]==='messages.send')).toBe(false);
    await db.query('UPDATE vk_broadcast_runs SET next_attempt_at=NULL'); await db.query('UPDATE vk_broadcast_deliveries SET next_attempt_at=NULL');
    for(let i=0;i<3;i++) await processVkBroadcasts();
    expect(upload).toHaveBeenCalledTimes(2);
    expect((await send(base)).json().data.runs[0]).toMatchObject({status:'completed',sent:2});
  });
});
