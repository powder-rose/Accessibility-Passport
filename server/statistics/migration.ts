export const statisticsSchema = [
  'CREATE TABLE analytics_visits (id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL, started_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, source TEXT NOT NULL)',
  'CREATE INDEX analytics_visits_token_idx ON analytics_visits (token_hash, last_seen)',
  'CREATE INDEX analytics_visits_started_idx ON analytics_visits (started_at)',
  'CREATE INDEX analytics_visits_seen_idx ON analytics_visits (last_seen)',
  'CREATE TABLE analytics_pageviews (id TEXT PRIMARY KEY NOT NULL, visit_id TEXT NOT NULL REFERENCES analytics_visits(id) ON DELETE CASCADE, path TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX analytics_pageviews_created_idx ON analytics_pageviews (created_at)',
  'CREATE INDEX analytics_pageviews_visit_idx ON analytics_pageviews (visit_id)',
].join(';');
