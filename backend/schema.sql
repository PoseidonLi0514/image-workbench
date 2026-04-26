CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  status_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  output_text TEXT NOT NULL DEFAULT '',
  response_json TEXT,
  error TEXT NOT NULL DEFAULT '',
  events_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_updated_at ON jobs(status, updated_at DESC);
