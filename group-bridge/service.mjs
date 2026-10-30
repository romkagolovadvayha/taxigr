import http from 'node:http';
import https from 'node:https';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { networkInterfaces } from 'node:os';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, normalizeMessageContent } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { TARGETS, selectGroup, makeEvent, phoneUriFromJid } from './core.mjs';
import { EventQueue } from './queue.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const home = process.env.TAXIGR_BRIDGE_HOME;
if (!home || !existsSync(home)) throw new Error('Run install.ps1 first to create private storage');
const configPath = join(home, 'config.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : { groups: {}, since: Date.now() };
const save = () => { writeFileSync(configPath + '.tmp', JSON.stringify(config), { mode: 0o600 }); renameSync(configPath + '.tmp', configPath); };
save();
const secret = randomBytes(32).toString('hex');
const port = 17843;
const origin = `http://127.0.0.1:${port}`;
const setupUrl = `${origin}/#${secret}`;
writeFileSync(join(home, 'setup.url'), `[InternetShortcut]\r\nURL=${setupUrl}\r\n`, { mode: 0o600 });
const queue = new EventQueue(join(home, 'queue.sqlite'));
const status = { whatsapp: { state: 'connecting' }, max: { state: 'connecting' }, delivery: 'not_paired', lastDelivery: null, received: 0 };
let stopping = false, socket, maxProcess, draining = false;
const logger = pino({ level: 'silent' });

function localAddress() {
  if (config.networkInterface) return networkInterfaces()[config.networkInterface]?.find(item => item.family === 'IPv4' && !item.internal)?.address;
  const requested = config.localAddress;
  return requested && Object.values(networkInterfaces()).flat().some(item => item?.address === requested) ? requested : undefined;
}
export function api(path, body, token = config.token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const request = https.request({ hostname: 'api.taxigr.ru', path: `/v1/group-alerts/${path}`, method: data ? 'POST' : 'GET',
      localAddress: localAddress(), family: 4, timeout: 15_000,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, response => {
      let result = '';
      response.on('data', chunk => { result += chunk; if (result.length > 100_000) response.destroy(); });
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('API_RESPONSE_INTERRUPTED')));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(new Error('API_ERROR'), { status: response.statusCode }));
        try { resolve(JSON.parse(result).data); } catch { reject(new Error('INVALID_API_RESPONSE')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('API_TIMEOUT')));
    request.on('error', reject);
    request.end(data);
  });
}

function selected(provider, group) {
  config.groups[provider] = group;
  save();
  status[provider] = { state: 'connected', group: group.title };
}
function receive(provider, message) {
  const event = makeEvent(message, config.groups[provider], config.since);
  if (!event) return;
  try { if (queue.add(event)) status.received++; }
  catch { status.delivery = 'queue_full'; }
  void drain();
}
async function drain() {
  if (draining || !config.token) return;
  draining = true;
  try {
    for (const row of queue.pending()) {
      await api('events', JSON.parse(row.payload));
      queue.done(row.id);
      status.lastDelivery = new Date().toISOString();
    }
    status.delivery = 'connected';
  } catch (error) {
    status.delivery = error.status === 401 ? 'pair_again' : error.status === 403 ? 'group_not_allowed' : 'retrying';
  } finally { draining = false; }
}
async function probe() {
  try { await api('device'); status.delivery = 'connected'; }
  catch (error) {
    status.delivery = error.status === 404 ? 'server_update_required' : error.status === 401 ? (config.token ? 'pair_again' : 'not_paired') : 'retrying';
  }
}
async function connectWhatsApp() {
  if (stopping) return;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(join(home, 'whatsapp'));
    socket = makeWASocket({ auth: state, logger, browser: ['Taxigr alerts', 'Chrome', '1.0.0'],
      syncFullHistory: false, shouldSyncHistoryMessage: () => false, markOnlineOnConnect: false,
      getMessage: async () => undefined });
    let credentialWrite = Promise.resolve();
    socket.ev.on('creds.update', () => { credentialWrite = credentialWrite.then(saveCreds).catch(() => { status.whatsapp = { state: 'storage_error' }; }); });
    socket.ev.on('connection.update', async update => {
      if (update.qr) status.whatsapp = { state: 'scan_qr', qr: await QRCode.toDataURL(update.qr, { width: 320, margin: 2 }) };
      if (update.connection === 'open') {
        try {
          const groups = Object.values(await socket.groupFetchAllParticipating()).map(group => ({ provider: 'whatsapp', id: group.id, title: group.subject }));
          const group = selectGroup(groups, TARGETS[0].title, config.groups.whatsapp?.id);
          if (group) selected('whatsapp', group); else status.whatsapp = { state: 'group_missing' };
        } catch { status.whatsapp = { state: 'group_lookup_error' }; }
      }
      if (update.connection === 'close' && !stopping) {
        const loggedOut = update.lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
        status.whatsapp = { state: loggedOut ? 'logged_out' : 'reconnecting' };
        if (!loggedOut) setTimeout(connectWhatsApp, 5000);
      }
    });
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return; // No bulk history or old sync notifications.
      for (const item of messages) {
        if (item.key.remoteJid !== config.groups.whatsapp?.id || item.key.fromMe) continue;
        const message = normalizeMessageContent(item.message);
        const text = message?.conversation ?? message?.extendedTextMessage?.text ?? '';
        const jid = [item.key.participantAlt, item.key.participant].find(value => phoneUriFromJid(value));
        receive('whatsapp', { id: item.key.id, groupId: item.key.remoteJid, fromMe: item.key.fromMe,
          text, sentAt: Number(item.messageTimestamp) * 1000, senderName: item.pushName, senderJid: jid });
      }
    });
  } catch { status.whatsapp = { state: 'reconnecting' }; if (!stopping) setTimeout(connectWhatsApp, 15_000); }
}
function connectMax() {
  if (stopping) return;
  maxProcess = spawn(join(home, 'venv', 'Scripts', 'python.exe'), ['-u', join(here, 'max_worker.py')], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  createInterface({ input: maxProcess.stdout }).on('line', async line => {
    try {
      const event = JSON.parse(line);
      if (event.kind === 'qr') status.max = { state: 'scan_qr', qr: await QRCode.toDataURL(event.value, { width: 320, margin: 2 }) };
      if (event.kind === 'ready') selected('max', event.group);
      if (event.kind === 'status') status.max = { state: event.value, ...(event.error ? { error: event.error } : {}) };
      if (event.kind === 'message') receive('max', event.message);
    } catch { /* Never print private IPC or library payloads. */ }
  });
  maxProcess.stderr.on('data', () => {});
  maxProcess.on('error', () => { status.max = { state: 'start_error' }; });
  maxProcess.on('exit', () => { status.max = { state: 'reconnecting' }; if (!stopping) setTimeout(connectMax, 15_000); });
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'");
  if (request.headers.host !== `127.0.0.1:${port}` || (request.headers.origin && request.headers.origin !== origin)) { response.writeHead(403).end(); return; }
  const staticFiles = { '/': ['setup.html', 'text/html; charset=utf-8'], '/setup.js': ['setup.js', 'text/javascript'], '/setup.css': ['setup.css', 'text/css'] };
  const file = staticFiles[request.url];
  if (file && request.method === 'GET') { response.setHeader('Content-Type', file[1]); response.end(readFileSync(join(here, file[0]))); return; }
  const key = Buffer.from(String(request.headers['x-setup-key'] || ''));
  if (key.length !== secret.length || !timingSafeEqual(key, Buffer.from(secret))) { response.writeHead(401).end(); return; }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.url === '/status' && request.method === 'GET') {
    response.end(JSON.stringify({ ...status, paired: !!config.token, groups: Object.values(config.groups), pending: queue.pendingCount() })); return;
  }
  try {
    if (request.method !== 'POST') { response.writeHead(404).end(); return; }
    let raw = '';
    for await (const chunk of request) { raw += chunk; if (raw.length > 4096) { response.writeHead(413).end(); return; } }
    const body = JSON.parse(raw);
    if (request.url === '/pair') {
      if (!/^[a-fA-F0-9]{12}$/u.test(body.code || '')) throw new Error('INVALID_CODE');
      if (!config.groups.max || !config.groups.whatsapp) throw new Error('CONNECT_ACCOUNTS_FIRST');
      const result = await api('pair', { code: body.code }, undefined);
      // Save the one-use token before binding, so a transient network failure cannot lose it.
      config.token = result.token; save();
      await api('groups/bind', { groups: Object.values(config.groups) });
      status.delivery = 'connected';
      await drain();
    } else if (request.url === '/max-password') {
      if (status.max.state !== 'password_required' || typeof body.password !== 'string' || body.password.length > 256) throw new Error('INVALID_PASSWORD');
      maxProcess.stdin.write(JSON.stringify({ password: body.password }) + '\n');
    } else if (request.url === '/retry') {
      await probe();
      if (config.token && config.groups.max && config.groups.whatsapp) await api('groups/bind', { groups: Object.values(config.groups) });
      await drain();
    } else { response.writeHead(404).end(); return; }
    response.end(JSON.stringify({ ok: true }));
  } catch (error) { response.writeHead(400).end(JSON.stringify({ error: error.status ? `API_${error.status}` : ['INVALID_CODE', 'CONNECT_ACCOUNTS_FIRST'].includes(error.message) ? error.message : 'CONNECTION_FAILED' })); }
});
server.on('error', () => { console.error('Local bridge port unavailable'); process.exit(1); });
server.listen(port, '127.0.0.1', () => {
  console.log('Taxigr bridge started on loopback; open the private setup shortcut.');
  void connectWhatsApp(); connectMax(); void probe();
});
const timer = setInterval(() => { queue.prune(); void drain(); }, 15_000);
const healthTimer = setInterval(() => void probe(), 60_000);
function stop() { stopping = true; clearInterval(timer); clearInterval(healthTimer); maxProcess?.kill(); socket?.end(new Error('shutdown')); server.close(); queue.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
