-- ============================================================
-- Archifouna — الترحيل 0002: مقاطع الترجمة + تتبع المعالجة + CSRF
-- ============================================================

-- مقاطع الترجمة: تقسيم النص إلى وحدات مرتبة قابلة للمراجعة المستقلة
CREATE TABLE IF NOT EXISTS translation_segments (
  id                 INTEGER PRIMARY KEY,
  translation_id     INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  sequence_number    INTEGER NOT NULL,
  page_number        INTEGER,
  source_text        TEXT NOT NULL,
  machine_translation TEXT,
  reviewed_translation TEXT,
  status             TEXT NOT NULL DEFAULT 'machine',  -- machine | reviewed
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_segments_translation
  ON translation_segments(translation_id, sequence_number);

-- تتبع عمليات المعالجة (OCR والترجمة وغيرها)
CREATE TABLE IF NOT EXISTS processing_jobs (
  id            INTEGER PRIMARY KEY,
  material_id   INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  file_id       INTEGER REFERENCES files(id) ON DELETE SET NULL,
  job_type      TEXT NOT NULL CHECK (job_type IN ('ocr', 'translation', 'thumbnail', 'preview')),
  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  provider      TEXT,
  error_message TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  started_at    TEXT,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_material ON processing_jobs(material_id, created_at DESC);

-- رمز CSRF لكل جلسة إدارية
ALTER TABLE sessions ADD COLUMN csrf_token TEXT;
