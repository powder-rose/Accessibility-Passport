import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialSchema, attachmentSchema } from './migrations';
import {
  defaultAttachmentLimits,
  type AttachmentLimits,
} from '../../src/lib/attachments';
import type { StoredAttachment } from '../uploads/validate';
import { UploadError } from '../uploads/errors';
import { articleSchema } from '../articles/migration';
import { ArticleRepository } from '../articles/repository';
import type { LeadPage, LeadRecord } from '../../src/lib/leads';
import { encodeLeadCursor, type LeadQuery } from './lead-pagination';
import { authSchema } from '../auth/migration';
import { AdminRepository } from '../auth/repository';
import { StorageRepository } from '../storage/repository';
import { storageLimits } from '../../src/lib/storage';
import { inImmediateTransaction } from './transaction';
import { statisticsSchema } from '../statistics/migration';
import { StatisticsQueries } from '../statistics/queries';
import { TrafficRepository } from '../statistics/traffic';
import {
  aiMaterialsSchema,
  AiMaterialsRepository,
} from '../ai/materials-repository';

export class Store {
  private readonly db: DatabaseSync;
  readonly articles: ArticleRepository;
  readonly auth: AdminRepository;
  readonly storage: StorageRepository;
  readonly statistics: StatisticsQueries;
  readonly traffic: TrafficRepository;
  readonly aiMaterials: AiMaterialsRepository;
  constructor(filename: string) {
    if (filename !== ':memory:')
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    const version = this.db.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    if (version.user_version > 6)
      throw new Error('Unsupported database schema version.');
    if (version.user_version === 0) {
      inImmediateTransaction(this.db, () => {
        this.db.exec(initialSchema);
        this.db.exec('PRAGMA user_version=1');
      });
    }
    if (version.user_version < 2) {
      inImmediateTransaction(this.db, () => {
        this.db.exec(attachmentSchema);
        this.db.exec('PRAGMA user_version=2');
      });
    }
    if (version.user_version < 3) {
      inImmediateTransaction(this.db, () => {
        this.db.exec(articleSchema);
        this.db.exec('PRAGMA user_version=3');
      });
    }
    if (version.user_version < 4) {
      inImmediateTransaction(this.db, () => {
        this.db.exec(authSchema);
        this.db.exec('PRAGMA user_version=4');
      });
    }
    if (version.user_version < 5) {
      inImmediateTransaction(this.db, () => {
        this.db.exec(statisticsSchema);
        this.db.exec('PRAGMA user_version=5');
      });
    }
    if (version.user_version < 6) {
      inImmediateTransaction(this.db, () => {
        this.db.exec(aiMaterialsSchema);
        this.db.exec('PRAGMA user_version=6');
      });
    }
    this.articles = new ArticleRepository(this.db);
    this.auth = new AdminRepository(this.db);
    this.storage = new StorageRepository(this.db);
    this.statistics = new StatisticsQueries(this.db);
    this.traffic = new TrafficRepository(this.db);
    this.aiMaterials = new AiMaterialsRepository(this.db);
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
    inImmediateTransaction(this.db, () => {
      if (this.findLeadHash(id)) return;
      const usage = this.db
        .prepare('SELECT COALESCE(SUM(size),0) AS size FROM lead_attachments')
        .get() as { size: number };
      if (
        usage.size + attachments.reduce((sum, file) => sum + file.size, 0) >
        storageLimits.attachments
      )
        throw new UploadError(
          'Хранилище вложений временно недоступно. Позвоните нам или повторите отправку позже.',
          503,
          'ATTACHMENT_QUOTA',
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
    });
  }
  getAttachmentLimits(): AttachmentLimits {
    return { ...defaultAttachmentLimits };
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
    return this.listLeadPage({ limit: 100 }).leads;
  }
  listLeadPage({ limit, cursor }: LeadQuery): LeadPage {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Invalid lead page size.');
    const condition = cursor
      ? 'WHERE created_at < ? OR (created_at = ? AND id < ?)'
      : '';
    const parameters = cursor
      ? [cursor.createdAt, cursor.createdAt, cursor.id, limit + 1]
      : [limit + 1];
    const rows = this.db
      .prepare(
        `SELECT id,payload,created_at,status FROM leads ${condition} ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(...parameters) as {
      id: string;
      payload: string;
      created_at: string;
      status: string;
    }[];
    const leads: LeadRecord[] = rows.slice(0, limit).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      status: row.status,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    }));
    const last = leads.at(-1);
    const { total } = this.db
      .prepare('SELECT COUNT(*) AS total FROM leads')
      .get() as { total: number };
    return {
      leads,
      total,
      nextCursor:
        rows.length > limit && last
          ? encodeLeadCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
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
  isAvailable(): boolean {
    try {
      if (this.db.prepare('PRAGMA user_version').get()?.user_version !== 6)
        return false;
      for (const table of [
        'leads',
        'lead_attachments',
        'upload_settings',
        'rate_limits',
        'articles',
        'article_slugs',
        'article_images',
        'article_image_refs',
        'admin_credentials',
        'admin_sessions',
        'analytics_visits',
        'analytics_pageviews',
        'ai_materials',
      ]) {
        // Read a bounded amount of real data, without copying BLOBs or writing.
        this.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
      }
      return true;
    } catch {
      return false;
    }
  }
  close() {
    this.db.close();
  }
}
