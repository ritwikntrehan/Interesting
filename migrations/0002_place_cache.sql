CREATE TABLE IF NOT EXISTS place_cache (
  query_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_place_cache_expires_at ON place_cache(expires_at);
