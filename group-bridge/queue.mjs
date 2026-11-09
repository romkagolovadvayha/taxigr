import { DatabaseSync } from 'node:sqlite';

export class EventQueue {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT, created INTEGER NOT NULL, delivered INTEGER);
      CREATE TABLE IF NOT EXISTS max_outbound (key TEXT PRIMARY KEY, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS max_watches (account TEXT NOT NULL, sender TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(account,sender));
      CREATE TABLE IF NOT EXISTS whatsapp_outbound (recipient TEXT PRIMARY KEY, created INTEGER NOT NULL);`);
  }
  add(event) {
    this.prune();
    if (this.db.prepare('SELECT 1 FROM events WHERE id = ?').get(event.eventId)) return false;
    if (this.pendingCount() >= 1000) throw new Error('QUEUE_FULL');
    return this.db.prepare('INSERT OR IGNORE INTO events(id,payload,created) VALUES(?,?,?)').run(event.eventId, JSON.stringify(event), event.sentAt).changes > 0;
  }
  prune(now = Date.now()) {
    this.db.prepare('DELETE FROM events WHERE created < ?').run(now - 7 * 86_400_000);
    this.db.prepare('DELETE FROM max_outbound WHERE created < ?').run(now - 7 * 86_400_000);
    this.db.prepare('DELETE FROM whatsapp_outbound WHERE created < ?').run(now - 15 * 60_000);
    this.db.prepare('DELETE FROM max_watches WHERE expires <= ?').run(now);
    // Backend accepts messages up to one hour old. Keep only the dedupe key afterwards.
    this.db.prepare('UPDATE events SET payload = NULL WHERE delivered IS NULL AND created < ?').run(now - 3_600_000);
  }
  pendingCount() { return this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE payload IS NOT NULL AND delivered IS NULL').get().n; }
  pending(includeMaxBooking = true) {
    this.prune();
    return this.db.prepare(`SELECT id,payload FROM events WHERE payload IS NOT NULL AND delivered IS NULL
      AND (? OR json_type(payload,'$.maxBooking') IS NULL) ORDER BY created LIMIT 20`).all(Number(includeMaxBooking));
  }
  done(id) { this.db.prepare('UPDATE events SET delivered = ?, payload = NULL WHERE id = ?').run(Date.now(), id); }
  discard(id) { this.db.prepare('UPDATE events SET payload = NULL WHERE id = ?').run(id); }
  claimMaxReply(key) {
    return this.db.prepare('INSERT OR IGNORE INTO max_outbound VALUES (?,?)').run(key, Date.now()).changes > 0;
  }
  releaseMaxReply(key) { this.db.prepare('DELETE FROM max_outbound WHERE key = ?').run(key); }
  claimWhatsAppReply(recipient, now = Date.now()) {
    return this.db.prepare(`INSERT INTO whatsapp_outbound VALUES (?,?)
      ON CONFLICT(recipient) DO UPDATE SET created = excluded.created
      WHERE whatsapp_outbound.created <= excluded.created - 900000`).run(recipient, now).changes > 0;
  }
  watchMax(account, sender, expires) {
    if (expires) this.db.prepare('INSERT INTO max_watches VALUES (?,?,?) ON CONFLICT(account,sender) DO UPDATE SET expires = excluded.expires').run(account, sender, expires);
    else this.db.prepare('DELETE FROM max_watches WHERE account = ? AND sender = ?').run(account, sender);
  }
  maxWatches(account) {
    return this.db.prepare('SELECT sender, expires FROM max_watches WHERE account = ? AND expires > ?').all(account, Date.now())
      .map(row => [row.sender, row.expires]);
  }
  close() { this.db.close(); }
}
