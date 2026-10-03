-- SIDJIL: integrated content translation cache and asynchronous jobs.
-- Additive migration: existing materials, files and legacy translations remain untouched.
CREATE TABLE IF NOT EXISTS translation_jobs (
  id TEXT PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  content_hash TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'auto',
  target_language TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'libretranslate-argos',
  engine_version TEXT NOT NULL DEFAULT 'v1',
  pdf_engine TEXT NOT NULL DEFAULT 'pdfmathtranslate',
  pdf_engine_version TEXT NOT NULL DEFAULT 'v1',
  output_mode TEXT NOT NULL DEFAULT 'translated',
  ocr_mode TEXT NOT NULL DEFAULT 'auto',
  type TEXT NOT NULL DEFAULT 'document',
  status TEXT NOT NULL DEFAULT 'QUEUED',
  progress INTEGER NOT NULL DEFAULT 0,
  current_stage TEXT,
  page_count INTEGER,
  processed_pages INTEGER NOT NULL DEFAULT 0,
  ocr_used INTEGER NOT NULL DEFAULT 0,
  input_key TEXT,
  extracted_key TEXT,
  output_key TEXT,
  output_mime TEXT,
  output_size INTEGER,
  error_code TEXT,
  error_message TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT,
  completed_at TEXT,
  expires_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_jobs_fingerprint ON translation_jobs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_material ON translation_jobs(material_id, target_language, status);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_hash ON translation_jobs(content_hash, target_language, status);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_status ON translation_jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS translation_text_cache (
  fingerprint TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  engine TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_translation_text_cache_hash ON translation_text_cache(content_hash, target_language);

CREATE TABLE IF NOT EXISTS translation_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  text_enabled INTEGER NOT NULL DEFAULT 1,
  document_enabled INTEGER NOT NULL DEFAULT 1,
  ocr_enabled INTEGER NOT NULL DEFAULT 1,
  guest_enabled INTEGER NOT NULL DEFAULT 1,
  max_text_chars INTEGER NOT NULL DEFAULT 12000,
  max_pdf_bytes INTEGER NOT NULL DEFAULT 52428800,
  max_pdf_pages INTEGER NOT NULL DEFAULT 300,
  max_active_jobs INTEGER NOT NULL DEFAULT 2,
  cache_enabled INTEGER NOT NULL DEFAULT 1,
  cache_retention_policy TEXT NOT NULL DEFAULT 'PERSISTENT',
  reuse_existing INTEGER NOT NULL DEFAULT 1,
  allow_force_retranslate INTEGER NOT NULL DEFAULT 0,
  maintenance_mode INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO translation_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS translation_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT REFERENCES translation_jobs(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  content_hash TEXT,
  fingerprint TEXT,
  user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_translation_usage_event ON translation_usage(event, created_at);
CREATE INDEX IF NOT EXISTS idx_translation_usage_fingerprint ON translation_usage(fingerprint, event);

CREATE TABLE IF NOT EXISTS translation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT REFERENCES translation_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_translation_events_job ON translation_events(job_id, id);
