import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  trafficRetentionDays,
  visitLifetime,
  type PageView,
} from '../../src/features/statistics/model';
import { inImmediateTransaction } from '../db/transaction';

export class TrafficRepository {
  constructor(private readonly db: DatabaseSync) {}

  record(view: PageView, source: string, now = Date.now()) {
    return inImmediateTransaction(this.db, () => {
      if (
        this.db
          .prepare('SELECT 1 FROM analytics_pageviews WHERE id=?')
          .get(view.id)
      )
        return false;

      const cutoff = now - trafficRetentionDays * 24 * 60 * 60 * 1000;
      this.db
        .prepare('DELETE FROM analytics_pageviews WHERE created_at < ?')
        .run(cutoff);
      this.db
        .prepare('DELETE FROM analytics_visits WHERE last_seen < ?')
        .run(cutoff);

      const tokenHash = createHash('sha256').update(view.token).digest('hex');
      const existing = this.db
        .prepare(
          'SELECT id FROM analytics_visits WHERE token_hash=? AND last_seen > ? ORDER BY last_seen DESC LIMIT 1',
        )
        .get(tokenHash, now - visitLifetime) as { id: string } | undefined;
      const visitId = existing?.id || randomUUID();
      if (existing)
        this.db
          .prepare(
            'UPDATE analytics_visits SET last_seen=MAX(last_seen,?) WHERE id=?',
          )
          .run(now, visitId);
      else
        this.db
          .prepare('INSERT INTO analytics_visits VALUES (?,?,?,?,?)')
          .run(visitId, tokenHash, now, now, source);

      this.db
        .prepare('INSERT INTO analytics_pageviews VALUES (?,?,?,?)')
        .run(view.id, visitId, view.path, now);
      return true;
    });
  }
}
