CREATE TABLE IF NOT EXISTS query_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  stale_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_query_cache_stale_at ON query_cache(stale_at);
