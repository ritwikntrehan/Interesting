CREATE TABLE IF NOT EXISTS ai_interpretation_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_interpretation_cache_expires_at ON ai_interpretation_cache(expires_at);

CREATE TABLE IF NOT EXISTS ai_usage (
  request_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  actual_microusd INTEGER NOT NULL,
  reserved_microusd INTEGER NOT NULL,
  state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);
