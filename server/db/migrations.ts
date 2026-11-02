export const initialSchema = [
  "CREATE TABLE leads (id TEXT PRIMARY KEY NOT NULL, payload_hash TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new')",
  'CREATE INDEX leads_created_idx ON leads (created_at)',
  'CREATE TABLE rate_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
].join(';');
