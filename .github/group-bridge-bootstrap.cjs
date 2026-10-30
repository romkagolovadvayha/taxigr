// Operator-only, one-time setup. Runs on the production server; no sessions/JWTs are issued.
const fs = require('node:fs');
const mysql = require(process.cwd() + '/server/node_modules/mysql2/promise');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!/^\+[1-9]\d{7,14}$/.test(payload.ownerPhone) || !/^[a-f0-9-]{36}$/.test(payload.deviceId)
    || !/^[a-f0-9]{64}$/.test(payload.pairingHash) || !/^[a-f0-9]{64}$/.test(payload.testEventId)) throw Error('Invalid setup payload');
  const normalized = value => value.replace(/[^\d]/g, '').replace(/^8(?=\d{10}$)/, '7');
  const configured = (process.env.SUPERADMIN_PHONES || '').split(/[,;\s]+/).map(normalized);
  if (!configured.includes(normalized(payload.ownerPhone))) throw Error('Connected account is not the configured service owner');
  if (!Array.isArray(payload.groups) || payload.groups.length !== 2 || new Set(payload.groups.map(g => g.provider)).size !== 2
    || payload.groups.some(g => !['max','whatsapp'].includes(g.provider) || typeof g.id !== 'string' || !g.id || g.id.length > 200 || typeof g.title !== 'string' || !g.title || g.title.length > 200)) throw Error('Both pinned groups are required');
  const db = await mysql.createConnection(process.env.MYSQL_URL);
  try {
    const [owners] = await db.execute(`SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='admin'
      WHERE u.phone=? AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL AND u.blocked_at IS NULL LIMIT 2`, [payload.ownerPhone]);
    if (owners.length !== 1) throw Error('Expected exactly one verified active administrator');
    const owner = owners[0].id;
    const [channels] = await db.execute(`SELECT provider FROM user_messenger_accounts
      WHERE user_id=? AND active=TRUE AND bot_contact_available=TRUE AND notifications_enabled=TRUE`, [owner]);
    if (!channels.length) throw Error('Administrator has no enabled bot notification channel');
    if (process.argv[2] === 'verify') {
      for (let attempt=0; attempt<36; attempt++) {
        const [rows] = await db.execute(`SELECT q.delivered_at, a.provider, a.user_id=? AS correct_owner
          FROM group_alert_events e JOIN group_alert_deliveries q ON q.event_id=e.id
          JOIN user_messenger_accounts a ON a.id=q.account_id
          WHERE e.device_id=? AND e.event_key=?`, [owner, payload.deviceId, payload.testEventId]);
        if (rows.some(row => !row.correct_owner)) throw Error('Unexpected recipient');
        if (rows.length >= channels.length && rows.every(row => row.delivered_at)) {
          console.log(JSON.stringify({deviceId:payload.deviceId,delivered:true,channels:rows.map(row=>row.provider),adminOnly:true})); return;
        }
        await pause(5000);
      }
      throw Error('Test alert delivery was not confirmed before timeout');
    }
    await db.beginTransaction();
    const [existing] = await db.execute('SELECT owner_id, pairing_hash, token_hash FROM group_alert_devices WHERE id=? FOR UPDATE', [payload.deviceId]);
    if (existing.length) {
      if (existing[0].owner_id !== owner || (existing[0].pairing_hash && existing[0].pairing_hash !== payload.pairingHash)) throw Error('Existing collector belongs to another setup');
    } else {
      await db.execute(`INSERT INTO group_alert_devices (id,owner_id,name,groups_json,pairing_hash,pairing_expires_at)
        VALUES (?,?,'Личные аккаунты: WhatsApp и MAX',?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))`,
        [payload.deviceId,owner,JSON.stringify(payload.groups),payload.pairingHash]);
    }
    await db.commit();
    console.log(JSON.stringify({deviceId:payload.deviceId,ownerVerified:true,channels:channels.map(row=>row.provider),ready:true}));
  } catch(error) { await db.rollback().catch(()=>{}); throw error; }
  finally { await db.end(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
