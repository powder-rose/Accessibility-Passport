export const articleSchema = [
  "CREATE TABLE articles (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), category TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, deleted_at TEXT)",
  'CREATE INDEX articles_public_idx ON articles(status,deleted_at,published_at)',
  'CREATE TABLE article_slugs (slug TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id))',
  'CREATE TABLE article_images (id TEXT PRIMARY KEY, bytes BLOB NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE article_image_refs (article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE, image_id TEXT NOT NULL REFERENCES article_images(id), PRIMARY KEY(article_id,image_id))',
].join(';');
