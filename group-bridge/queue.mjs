import { DatabaseSync } from 'node:sqlite';

export class EventQueue {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT, created INTEGER NOT NULL, delivered INTEGER);`);
  }
  add(event) {
    this.prune();
    if (this.pendingCount() >= 1000) throw new Error('QUEUE_FULL');
    return this.db.prepare('INSERT OR IGNORE INTO events(id,payload,created) VALUES(?,?,?)').run(event.eventId, JSON.stringify(event), event.sentAt).changes > 0;
  }
  prune(now = Date.now()) {
    this.db.prepare('DELETE FROM events WHERE created < ?').run(now - 7 * 86_400_000);
    // Backend accepts messages up to one hour old. Keep only the dedupe key afterwards.
    this.db.prepare('UPDATE events SET payload = NULL WHERE delivered IS NULL AND created < ?').run(now - 3_600_000);
  }
  pendingCount() { return this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE payload IS NOT NULL AND delivered IS NULL').get().n; }
  pending() { this.prune(); return this.db.prepare('SELECT id,payload FROM events WHERE payload IS NOT NULL AND delivered IS NULL ORDER BY created LIMIT 20').all(); }
  done(id) { this.db.prepare('UPDATE events SET delivered = ?, payload = NULL WHERE id = ?').run(Date.now(), id); }
  close() { this.db.close(); }
}
