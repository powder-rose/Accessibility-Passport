export const initialSchema = [
  "CREATE TABLE leads (id TEXT PRIMARY KEY NOT NULL, payload_hash TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new')",
  'CREATE INDEX leads_created_idx ON leads (created_at)',
  'CREATE TABLE rate_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
].join(';');

export const attachmentSchema = [
  'CREATE TABLE lead_attachments (id TEXT PRIMARY KEY NOT NULL, lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE, kind TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, content_type TEXT NOT NULL, sha256 TEXT NOT NULL, bytes BLOB NOT NULL)',
  'CREATE INDEX lead_attachments_lead_idx ON lead_attachments (lead_id)',
  'CREATE TABLE upload_settings (id INTEGER PRIMARY KEY CHECK(id=1), settings TEXT NOT NULL)',
].join(';');
