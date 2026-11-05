import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialSchema, attachmentSchema } from './migrations';
import {
  attachmentLimitsSchema,
  defaultAttachmentLimits,
  type AttachmentLimits,
} from '../../src/lib/attachments';
import type { StoredAttachment } from '../uploads/validate';
import { UploadError } from '../uploads/errors';
import { articleSchema } from '../articles/migration';
import { ArticleRepository } from '../articles/repository';

export class Store {
  private readonly db: DatabaseSync;
  readonly articles: ArticleRepository;
  constructor(filename: string) {
    if (filename !== ':memory:')
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    const version = this.db.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    if (version.user_version > 3)
      throw new Error('Unsupported database schema version.');
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
    if (version.user_version < 2) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(attachmentSchema);
        this.db.exec('PRAGMA user_version=2; COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    if (version.user_version < 3) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(articleSchema);
        this.db.exec('PRAGMA user_version=3; COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    this.articles = new ArticleRepository(this.db);
  }
  findLeadHash(id: string) {
    const row = this.db
      .prepare('SELECT payload_hash FROM leads WHERE id=?')
      .get(id) as { payload_hash: string } | undefined;
    return row?.payload_hash;
  }
  insertLead(
    id: string,
    hash: string,
    payload: unknown,
    createdAt: string,
    source: string,
    attachments: StoredAttachment[] = [],
  ) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.findLeadHash(id)) {
        this.db.exec('COMMIT');
        return;
      }
      const usage = this.db
        .prepare('SELECT COALESCE(SUM(size),0) AS size FROM lead_attachments')
        .get() as { size: number };
      if (
        usage.size + attachments.reduce((sum, file) => sum + file.size, 0) >
        512 * 1024 * 1024
      )
        throw new UploadError(
          'Хранилище вложений временно недоступно. Позвоните нам или повторите отправку позже.',
          503,
        );
      this.db
        .prepare(
          "INSERT INTO leads (id,payload_hash,payload,created_at,source,status) VALUES (?,?,?,?,?,'new') ON CONFLICT(id) DO NOTHING",
        )
        .run(id, hash, JSON.stringify(payload), createdAt, source);
      const insert = this.db.prepare(
        'INSERT INTO lead_attachments (id,lead_id,kind,name,size,content_type,sha256,bytes) VALUES (?,?,?,?,?,?,?,?)',
      );
      for (const file of attachments)
        insert.run(
          file.id,
          id,
          file.kind,
          file.name,
          file.size,
          file.contentType,
          file.sha256,
          file.bytes,
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  getAttachmentLimits(): AttachmentLimits {
    const row = this.db
      .prepare('SELECT settings FROM upload_settings WHERE id=1')
      .get() as { settings: string } | undefined;
    return row
      ? attachmentLimitsSchema.parse(JSON.parse(row.settings))
      : { ...defaultAttachmentLimits };
  }
  setAttachmentLimits(limits: AttachmentLimits) {
    const valid = attachmentLimitsSchema.parse(limits);
    this.db
      .prepare(
        'INSERT INTO upload_settings (id,settings) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings',
      )
      .run(JSON.stringify(valid));
    return valid;
  }
  getAttachment(id: string) {
    return this.db
      .prepare(
        'SELECT name,content_type AS contentType,bytes FROM lead_attachments WHERE id=?',
      )
      .get(id) as
      { name: string; contentType: string; bytes: Uint8Array } | undefined;
  }
  listLeads() {
    const rows = this.db
      .prepare(
        'SELECT id,payload,created_at,status FROM leads ORDER BY created_at DESC LIMIT 100',
      )
      .all() as {
      id: string;
      payload: string;
      created_at: string;
      status: string;
    }[];
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
