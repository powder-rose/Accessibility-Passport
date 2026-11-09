export const authSchema = [
  'CREATE TABLE admin_credentials (id INTEGER PRIMARY KEY CHECK(id=1), source_hash TEXT NOT NULL, password_hash TEXT, generation INTEGER NOT NULL)',
  'CREATE TABLE admin_sessions (id TEXT PRIMARY KEY NOT NULL, verifier_hash TEXT NOT NULL, credential_id INTEGER NOT NULL DEFAULT 1 CHECK(credential_id=1) REFERENCES admin_credentials(id) ON DELETE CASCADE, generation INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at)',
].join(';');
