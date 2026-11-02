import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialSchema } from './migrations';

export class Store {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) throw new Error('Unsupported database schema version.');
    if (version.user_version === 0) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(initialSchema);
        this.db.exec('PRAGMA user_version=1; COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }
  findLeadHash(id: string) {
    const row = this.db.prepare('SELECT payload_hash FROM leads WHERE id=?').get(id) as
      | { payload_hash: string }
      | undefined;
    return row?.payload_hash;
  }
  insertLead(id: string, hash: string, payload: unknown, createdAt: string, source: string) {
    this.db
      .prepare(
        "INSERT INTO leads (id,payload_hash,payload,created_at,source,status) VALUES (?,?,?,?,?,'new') ON CONFLICT(id) DO NOTHING",
      )
      .run(id, hash, JSON.stringify(payload), createdAt, source);
  }
  listLeads() {
    const rows = this.db
      .prepare('SELECT id,payload,created_at,status FROM leads ORDER BY created_at DESC LIMIT 100')
      .all() as { id: string; payload: string; created_at: string; status: string }[];
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      status: row.status,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    }));
  }
  consumeRateLimit(key: string, limit: number, expiresAt: number, now: number) {
    const row = this.db
      .prepare(
        'INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
      )
      .get(key, expiresAt) as { count: number };
    this.db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').run(now);
    return row.count <= limit;
  }
  close() {
    this.db.close();
  }
}
