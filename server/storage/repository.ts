import type { DatabaseSync } from 'node:sqlite';
import { inImmediateTransaction } from '../db/transaction';
import {
  cleanupBatchSize,
  imageGraceDays,
  storageLimits,
  type CleanupImage,
  type CleanupPreview,
  type StorageReport,
} from '../../src/lib/storage';

const eligible = `NOT EXISTS (SELECT 1 FROM article_image_refs r WHERE r.image_id=i.id)
  AND julianday(i.created_at) <= julianday(?)`;
const cutoff = (now: number) =>
  new Date(now - imageGraceDays * 86400000).toISOString();
export class StorageConflict extends Error {}

export class StorageRepository {
  constructor(private readonly db: DatabaseSync) {}
  report(): StorageReport {
    const count = (table: string) =>
      this.db
        .prepare(
          `SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS bytes FROM ${table}`,
        )
        .get() as { count: number; bytes: number };
    return {
      attachments: {
        ...count('lead_attachments'),
        limit: storageLimits.attachments,
      },
      images: { ...count('article_images'), limit: storageLimits.images },
    };
  }
  preview(now = Date.now()): CleanupPreview {
    const before = cutoff(now);
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(size),0) AS bytes FROM article_images i WHERE ${eligible}`,
      )
      .get(before) as { total: number; bytes: number };
    const images = this.db
      .prepare(
        `SELECT i.id,i.sha256,i.size,i.width,i.height,i.created_at AS createdAt
       FROM article_images i WHERE ${eligible} ORDER BY i.created_at,i.id LIMIT ?`,
      )
      .all(before, cleanupBatchSize) as CleanupPreview['images'];
    return { ...totals, images };
  }
  cleanup(images: CleanupImage[], now = Date.now()) {
    if (
      !images.length ||
      images.length > cleanupBatchSize ||
      new Set(images.map((image) => image.id)).size !== images.length
    )
      throw new StorageConflict('Выберите от 1 до 100 разных изображений.');
    return inImmediateTransaction(this.db, () => {
      const query = this.db.prepare(
        `SELECT i.size FROM article_images i WHERE i.id=? AND i.sha256=? AND ${eligible}`,
      );
      let bytes = 0;
      for (const image of images) {
        const row = query.get(image.id, image.sha256, cutoff(now)) as
          { size: number } | undefined;
        if (!row)
          throw new StorageConflict(
            'Список изменился: изображение уже удалено, изменено или используется. Обновите предпросмотр.',
          );
        bytes += row.size;
      }
      const remove = this.db.prepare('DELETE FROM article_images WHERE id=?');
      for (const image of images) remove.run(image.id);
      return { count: images.length, bytes };
    });
  }
}
