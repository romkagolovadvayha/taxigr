// Read-only production diagnostic. Outputs only a report encrypted to the operator's local key.
const fs = require('node:fs');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const mysql = require(process.cwd() + '/server/node_modules/mysql2/promise');
const publicKey = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmHwmXreu6HtxMgjGdLgC\nPkHyZA6nMzI9LBZ4of8HhQTKafMxkgHcq9k0VFSCT8ySZb+oBPlw4sxOM1tzHMOX\ns1b07E63pBwEHWUWuZ0DGYL44mcmomNfsqBO9t0yLIlVUrwF1Z464a3E4lbHw71G\noJHSqADZ9GZ8p1I7Qkir8KlREBWMMEQZllb9QxNIRSiN2+Ydfd5k+4NJzZTHkHIH\nra8a+kNbj2Nc43FFVsomXvROM1/Uua/tpKtj4ar3uSlFWqc8tEwNgOo0ceDp+KVb\nTRG4PQezQQmKpI2+DQaKSgTlu9SJi5kzexsJsJ8EbvS8YRQlXHq8HLv+/UUuBfND\n6wIDAQAB\n-----END PUBLIC KEY-----\n";
const since = '2026-10-23T20:00:00.000Z';
const salt = crypto.randomBytes(32);
const fingerprint = value => value ? crypto.createHmac('sha256', salt).update(String(value)).digest('hex').slice(0, 16) : null;
const clean = value => typeof value === 'string' ? value.replace(/Bearer\s+\S+/gi, '[token]').replace(/([?&](?:token|code|state|access_token|exchangeToken)=)[^&\s]+/gi, '$1[redacted]').slice(0, 1800) : value;
const pathInfo = value => {
  try { const u = new URL(value, 'https://api.taxigr.ru'); return { path: u.pathname, queryKeys: [...u.searchParams.keys()].filter(k => !/token|code|state|secret/i.test(k)), searchLength: u.searchParams.get('q')?.length }; }
  catch { return { path: String(value).split('?')[0].slice(0, 250) }; }
};
const report = { since, until: new Date().toISOString(), warnings: [], database: {}, journal: {}, nginx: {} };
async function lines(command, args, onLine) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(command + ' exit ' + code))); });
  for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) onLine(line);
  await done;
}
async function database() {
  const db = await mysql.createConnection({ uri: process.env.MYSQL_URL, timezone: 'Z', dateStrings: true });
  try {
    await db.query('SET SESSION MAX_EXECUTION_TIME=15000');
    await db.query('START TRANSACTION READ ONLY');
    const query = async (name, sql, params = []) => {
      try { const [rows] = await db.query(sql, params); report.database[name] = rows; return rows; }
      catch (error) { report.warnings.push(name + ': ' + error.code); return []; }
    };
    const rows = await query('tables', 'SELECT TABLE_NAME AS name, COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
    const columns = table => rows.filter(r => r.name === table).map(r => r.col);
    const select = (table, requested, alias = '') => requested.filter(col => columns(table).includes(col)).map(col => (alias ? alias + '.' : '') + '`' + col + '`').join(',');
    const start = since.slice(0, 19).replace('T', ' ');
    await query('clock', 'SELECT UTC_TIMESTAMP(3) AS utc, @@session.time_zone AS sessionTimezone');
    const users = await query('users', `SELECT ${select('users', ['id','name','created_at','updated_at','phone_verified_at','profile_completed_at','blocked_at','order_blocked_at','deleted_at'], 'u')},
      RIGHT(u.phone,4) AS phoneLast4, (SELECT GROUP_CONCAT(role ORDER BY role) FROM user_roles r WHERE r.user_id=u.id) AS roles,
      (SELECT COUNT(*) FROM orders o WHERE o.passenger_id=u.id) AS lifetimeOrders,
      (SELECT COUNT(*) FROM orders o WHERE o.passenger_id=u.id AND o.created_at>=?) AS periodOrders
      FROM users u ORDER BY u.created_at DESC LIMIT 5000`, [start]);
    const reviewerSource = fs.existsSync('server/play-review-auth.ts') ? fs.readFileSync('server/play-review-auth.ts','utf8') : '';
    const reviewer = reviewerSource.match(/PLAY_REVIEW_PHONE\s*=\s*['"]([^'"]+)/)?.[1];
    if (reviewer) {
      const [review] = await db.query('SELECT id FROM users WHERE phone=?', [reviewer]);
      users.forEach(u => { u.storeReviewAccount = review.some(r => r.id === u.id); });
    }
    await query('orders', `SELECT ${select('orders', ['id','passenger_id','driver_id','status','created_at','updated_at','completed_at','cancelled_at','price_minor','pricing_mode'])} FROM orders WHERE created_at>=? ORDER BY created_at LIMIT 20000`, [start]);
    await query('orderEvents', `SELECT e.order_id,e.actor_user_id,e.event_type,e.from_status,e.to_status,e.created_at,
      JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.reason')) AS reason FROM order_events e WHERE e.created_at>=? ORDER BY e.created_at LIMIT 30000`, [start]);
    await query('orderDaily', `SELECT DATE(DATE_ADD(created_at,INTERVAL 4 HOUR)) AS day,status,COUNT(*) AS n,COUNT(DISTINCT passenger_id) AS passengers FROM orders WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) GROUP BY day,status`);
    for (const provider of ['phone','max','telegram','vk']) {
      const table = provider + '_auth_challenges';
      const phoneCol = provider === 'phone' ? 'phone' : 'verified_phone';
      const auth = await query(provider+'Auth', `SELECT ${select(table, ['id','created_at','expires_at','verified_at','completed_at','failure_code','attempts','consent_ip','consent_user_agent'], 'c')}, u.id AS user_id,
        RIGHT(c.${phoneCol},4) AS phoneLast4 FROM ${table} c LEFT JOIN users u ON u.phone=c.${phoneCol}
        WHERE c.created_at>=? ORDER BY c.created_at LIMIT 20000`, [start]);
      auth.forEach(r => { r.ipKey = fingerprint(r.consent_ip); delete r.consent_ip; });
    }
    const auth = await query('authAttempts', `SELECT request_id,challenge_id,action,outcome,ip_address,phone_mask,installation_fingerprint,user_agent,created_at,updated_at,
      JSON_UNQUOTE(JSON_EXTRACT(details_json,'$.code')) AS code, JSON_UNQUOTE(JSON_EXTRACT(details_json,'$.reason')) AS reason
      FROM auth_attempt_events WHERE created_at>=? ORDER BY created_at LIMIT 30000`, [start]);
    auth.forEach(r => { r.ipKey = fingerprint(r.ip_address); delete r.ip_address; r.installation_fingerprint = fingerprint(r.installation_fingerprint); });
    const consents = await query('consents', `SELECT user_id,source,ip_address,user_agent,accepted_at FROM user_consents WHERE accepted_at>=? ORDER BY accepted_at LIMIT 20000`, [start]);
    consents.forEach(r => { r.ipKey = fingerprint(r.ip_address); delete r.ip_address; });
    await query('messengerAccounts', `SELECT user_id,provider,active,bot_contact_available,bot_started_at,last_seen_at,created_at FROM user_messenger_accounts WHERE last_seen_at>=? OR created_at>=? ORDER BY last_seen_at`, [start,start]);
    await query('pushRegistrations', `SELECT user_id,platform,updated_at FROM push_tokens WHERE updated_at>=? ORDER BY updated_at`, [start]);
    await query('bookingEvents', `SELECT e.provider,a.user_id,e.event_id,e.created_at,
      JSON_UNQUOTE(JSON_EXTRACT(e.response_json,'$.text')) AS reply
      FROM messenger_booking_events e LEFT JOIN user_messenger_accounts a ON a.provider=e.provider AND a.external_user_id=e.external_user_id
      WHERE e.created_at>=? ORDER BY e.created_at LIMIT 20000`, [start]);
    await query('bookingDrafts', `SELECT d.provider,a.user_id,d.expires_at,JSON_UNQUOTE(JSON_EXTRACT(d.draft_json,'$.stage')) AS stage
      FROM messenger_booking_drafts d LEFT JOIN user_messenger_accounts a ON a.provider=d.provider AND a.external_user_id=d.external_user_id`);
    await query('bookingSettings', 'SELECT enabled,updated_at FROM booking_settings');
    await query('bookingSettingsAudit', `SELECT actor_user_id,action,before_json,after_json,created_at FROM audit_logs WHERE entity_type='booking_settings' AND created_at>=? ORDER BY created_at`,[start]);
    await db.rollback();
  } finally { await db.end(); }
}
async function journal() {
  const requests = new Map(), counts = {}, errors = [];
  let total = 0, first, last;
  await lines('journalctl', ['-u','taxigr-api.service','--since',since.replace('T',' ').replace('.000Z',' UTC'),'--no-pager','-o','json'], line => {
    let entry, msg;
    try { entry = JSON.parse(line); msg = JSON.parse(entry.MESSAGE); } catch { return; }
    const time = msg.time ? new Date(msg.time).toISOString() : new Date(Number(entry.__REALTIME_TIMESTAMP)/1000).toISOString();
    total++; first ||= time; last = time;
    const key = `${entry._BOOT_ID}:${msg.pid || entry._PID}:${msg.reqId}`;
    if (msg.req?.url) {
      const info = pathInfo(msg.req.url);
      const route = `${msg.req.method} ${info.path}`;
      counts[route] = (counts[route] || 0) + 1;
      if (info.path.startsWith('/v1/') && !/^\/v1\/(?:admin|driver|group-alerts|webhooks)\b/.test(info.path) && requests.size < 250000)
        requests.set(key, { time, reqId: msg.reqId, pid: msg.pid, method: msg.req.method, ...info, ipKey: fingerprint(msg.req.remoteAddress), status: null });
    }
    const req = requests.get(key);
    if (msg.res?.statusCode && req) { req.status = msg.res.statusCode; req.ms = msg.responseTime; }
    if (msg.msg === 'request rejected' && req) { req.code = clean(msg.code); req.error = clean(msg.message); }
    if (msg.level >= 40 && errors.length < 20000) {
      const error = { time, reqId: msg.reqId, pid: msg.pid, path: req?.path, message: clean(msg.err?.message || msg.error?.message || msg.message || msg.msg), code: clean(msg.err?.code || msg.error?.code || msg.code) };
      errors.push(error); if (req) req.error = error.message;
    }
  });
  report.journal = { total, first, last, routeCounts: counts, requests: [...requests.values()], errors, capped: requests.size >= 250000 || errors.length >= 20000 };
}
async function nginx() {
  const files = fs.readdirSync('/var/log/nginx').filter(name => /access\.log(?:\.\d+)?(?:\.gz)?$/.test(name)).map(name => ({ name, stat: fs.statSync('/var/log/nginx/'+name) }))
    .filter(({stat}) => stat.mtimeMs >= Date.parse(since)).sort((a,b) => b.stat.mtimeMs-a.stat.mtimeMs).slice(0,20);
  const records = [], counts = {};
  let first, last;
  for (const {name} of files) {
    await lines(name.endsWith('.gz') ? 'gzip' : 'cat', name.endsWith('.gz') ? ['-dc','/var/log/nginx/'+name] : ['/var/log/nginx/'+name], line => {
      const m = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^ ]+) [^"]+" (\d{3}) \S+ "([^"]*)" "([^"]*)"/);
      if (!m) return;
      const time = new Date(m[2].replace(/^(\d+)\/(\w+)\/(\d+):/, '$1 $2 $3 '));
      if (!Number.isFinite(+time) || time < new Date(since)) return;
      const info = pathInfo(m[4]);
      const status = Number(m[5]);
      const relevant = info.path.startsWith('/v1/') || /taxigr\.ru/.test(m[6]) || /^\/(?:$|sign-in|profile|home|address-search|order|_expo\/)/.test(info.path);
      if (!relevant) return;
      const iso = time.toISOString(); if (!first || iso < first) first = iso; if (!last || iso > last) last = iso;
      const key = `${m[3]} ${info.path} ${status}`; counts[key] = (counts[key] || 0)+1;
      if (records.length < 250000 && (!/\.(js|css|png|svg|jpg|webp|woff2?)(?:$|\?)/.test(info.path) || status >= 400))
        records.push({ time: iso, method: m[3], ...info, status, ipKey: fingerprint(m[1]), ua: m[7].slice(0,255), referer: pathInfo(m[6]).path });
    });
  }
  report.nginx = { files: files.map(({name,stat}) => ({name,bytes:stat.size,modified:stat.mtime.toISOString()})), first,last,counts,records,capped:records.length>=250000 };
}
(async () => {
  for (const [name, fn] of [['database',database],['journal',journal],['nginx',nginx]]) {
    try { await fn(); } catch(error) { report.warnings.push(name+': '+clean(error.message)); }
  }
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm',key,iv);
  const ciphertext = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(report)))),cipher.final()]);
  const envelope = Buffer.from(JSON.stringify({ key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64') })).toString('base64');
  for(let i=0;i<envelope.length;i+=10000) console.log('REPORT_CHUNK:'+envelope.slice(i,i+10000));
  console.log('REPORT_COMPLETE:'+JSON.stringify({ bytes:envelope.length,warnings:report.warnings,requests:report.journal.requests?.length,nginx:report.nginx.records?.length }));
})().catch(error => { console.error('Audit failed: '+clean(error.message)); process.exitCode=1; });
