import type { DatabaseSync } from 'node:sqlite';

// The callback must be synchronous and leave transaction control to this helper.
export function inImmediateTransaction<T>(
  db: DatabaseSync,
  operation: () => T,
): T {
  // A failed BEGIN must not roll back a transaction owned by another caller.
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      if (db.isTransaction) db.exec('ROLLBACK');
    } catch {
      // Preserve the original operation/commit error if rollback also fails.
    }
    throw error;
  }
}
