-- 0041: أسس استكمال الأداء والترجمة الصفحية وجودة المحتوى.
-- Migration additive: لا تحذف بيانات قديمة ولا تغيّر جداول المشروع الأساسية.

-- فهرس ملف العرض الأساسي لكل مادة. يمنع تنفيذ استعلامات فرعية متعددة لكل بطاقة.
CREATE TABLE IF NOT EXISTS material_assets_index (
  material_id INTEGER PRIMARY KEY REFERENCES materials(id) ON DELETE CASCADE,
  cover_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  pdf_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  image_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  text_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  integrity_status TEXT NOT NULL DEFAULT 'unknown',
  checked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_material_assets_cover ON material_assets_index(cover_file_id);
CREATE INDEX IF NOT EXISTS idx_material_assets_pdf ON material_assets_index(pdf_file_id);
CREATE INDEX IF NOT EXISTS idx_material_assets_status ON material_assets_index(integrity_status, checked_at);

-- تعبئة أولية آمنة من الملفات الحالية.
INSERT OR IGNORE INTO material_assets_index
  (material_id, cover_file_id, pdf_file_id, image_file_id, text_file_id, updated_at)
SELECT
  m.id,
  (SELECT f.id FROM files f
   WHERE f.material_id = m.id
     AND (f.kind = 'cover' OR f.mime LIKE 'image/%')
   ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 ELSE 2 END, f.id LIMIT 1),
  (SELECT f.id FROM files f
   WHERE f.material_id = m.id
     AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf')
   ORDER BY f.id LIMIT 1),
  (SELECT f.id FROM files f
   WHERE f.material_id = m.id AND f.mime LIKE 'image/%'
   ORDER BY CASE WHEN f.kind = 'content-image' THEN 0 WHEN f.kind = 'original' THEN 1 ELSE 2 END, f.id LIMIT 1),
  (SELECT f.id FROM files f
   WHERE f.material_id = m.id
     AND (lower(f.filename) LIKE '%.txt' OR lower(f.filename) LIKE '%.doc' OR lower(f.filename) LIKE '%.docx')
   ORDER BY f.id LIMIT 1),
  datetime('now')
FROM materials m;

-- تحديث الفهرس تلقائيًا عند إضافة أو تغيير أو حذف ملف.
CREATE TRIGGER IF NOT EXISTS trg_material_assets_file_insert
AFTER INSERT ON files
BEGIN
  INSERT OR IGNORE INTO material_assets_index (material_id) VALUES (NEW.material_id);
  UPDATE material_assets_index
  SET cover_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND (f.kind = 'cover' OR f.mime LIKE 'image/%') ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 ELSE 2 END, f.id LIMIT 1),
      pdf_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf') ORDER BY f.id LIMIT 1),
      image_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND f.mime LIKE 'image/%' ORDER BY CASE WHEN f.kind = 'content-image' THEN 0 WHEN f.kind = 'original' THEN 1 ELSE 2 END, f.id LIMIT 1),
      text_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND (lower(f.filename) LIKE '%.txt' OR lower(f.filename) LIKE '%.doc' OR lower(f.filename) LIKE '%.docx') ORDER BY f.id LIMIT 1),
      updated_at = datetime('now'), checked_at = NULL, integrity_status = 'unknown'
  WHERE material_id = NEW.material_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_material_assets_file_update
AFTER UPDATE OF material_id, kind, filename, mime ON files
BEGIN
  INSERT OR IGNORE INTO material_assets_index (material_id) VALUES (NEW.material_id);
  UPDATE material_assets_index
  SET cover_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND (f.kind = 'cover' OR f.mime LIKE 'image/%') ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 ELSE 2 END, f.id LIMIT 1),
      pdf_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf') ORDER BY f.id LIMIT 1),
      image_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND f.mime LIKE 'image/%' ORDER BY CASE WHEN f.kind = 'content-image' THEN 0 WHEN f.kind = 'original' THEN 1 ELSE 2 END, f.id LIMIT 1),
      text_file_id = (SELECT f.id FROM files f WHERE f.material_id = NEW.material_id AND (lower(f.filename) LIKE '%.txt' OR lower(f.filename) LIKE '%.doc' OR lower(f.filename) LIKE '%.docx') ORDER BY f.id LIMIT 1),
      updated_at = datetime('now'), checked_at = NULL, integrity_status = 'unknown'
  WHERE material_id = NEW.material_id;
  UPDATE material_assets_index SET cover_file_id = NULL, pdf_file_id = NULL, image_file_id = NULL, text_file_id = NULL, updated_at = datetime('now'), checked_at = NULL, integrity_status = 'unknown' WHERE material_id = OLD.material_id AND OLD.material_id <> NEW.material_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_material_assets_file_delete
AFTER DELETE ON files
BEGIN
  UPDATE material_assets_index
  SET cover_file_id = (SELECT f.id FROM files f WHERE f.material_id = OLD.material_id AND (f.kind = 'cover' OR f.mime LIKE 'image/%') ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 ELSE 2 END, f.id LIMIT 1),
      pdf_file_id = (SELECT f.id FROM files f WHERE f.material_id = OLD.material_id AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf') ORDER BY f.id LIMIT 1),
      image_file_id = (SELECT f.id FROM files f WHERE f.material_id = OLD.material_id AND f.mime LIKE 'image/%' ORDER BY CASE WHEN f.kind = 'content-image' THEN 0 WHEN f.kind = 'original' THEN 1 ELSE 2 END, f.id LIMIT 1),
      text_file_id = (SELECT f.id FROM files f WHERE f.material_id = OLD.material_id AND (lower(f.filename) LIKE '%.txt' OR lower(f.filename) LIKE '%.doc' OR lower(f.filename) LIKE '%.docx') ORDER BY f.id LIMIT 1),
      updated_at = datetime('now'), checked_at = NULL, integrity_status = 'unknown'
  WHERE material_id = OLD.material_id;
END;

-- كيان ترجمة مستقل للكتاب، مع حالة كل صفحة وقاطع النص للحفاظ على ترتيب المصدر.
CREATE TABLE IF NOT EXISTS translation_documents (
  id TEXT PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  source_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  source_language TEXT NOT NULL DEFAULT 'auto',
  target_language TEXT NOT NULL,
  output_mode TEXT NOT NULL DEFAULT 'translated',
  status TEXT NOT NULL DEFAULT 'QUEUED',
  page_count INTEGER,
  completed_pages INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(material_id, source_file_id, source_language, target_language, output_mode)
);
CREATE INDEX IF NOT EXISTS idx_translation_documents_material ON translation_documents(material_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_documents_status ON translation_documents(status, updated_at ASC);

CREATE TABLE IF NOT EXISTS translation_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES translation_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  source_text TEXT,
  translated_text TEXT,
  direction TEXT NOT NULL DEFAULT 'auto',
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  source_key TEXT,
  output_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(document_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_translation_pages_document ON translation_pages(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_translation_pages_status ON translation_pages(status, updated_at ASC);

CREATE TABLE IF NOT EXISTS translation_page_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES translation_pages(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'paragraph',
  source_style TEXT,
  direction TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(page_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_translation_page_segments_page ON translation_page_segments(page_id, sequence_number);

-- قياس الاستعلامات على مستوى التطبيق، دون حفظ SQL قد يحتوي بيانات حساسة.
CREATE TABLE IF NOT EXISTS query_metrics_daily (
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  query_key TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  max_duration_ms INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, route, query_key)
);
CREATE INDEX IF NOT EXISTS idx_query_metrics_day_duration ON query_metrics_daily(day, total_duration_ms DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_day_rows ON query_metrics_daily(day, total_rows DESC);
