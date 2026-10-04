-- طابور صيانة المحتوى: يسجل النواقص التي تحتاج مصدرًا أو تدخلاً بشريًا.
-- لا ينشئ بيانات تخمينية ولا ينسخ ملفات تلقائيًا.
CREATE TABLE IF NOT EXISTS content_repair_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('cover', 'pdf', 'text', 'asset', 'ocr', 'metadata')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'resolved', 'blocked')),
  source_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  note TEXT,
  requested_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(material_id, issue_type)
);

CREATE INDEX IF NOT EXISTS idx_content_repair_status ON content_repair_queue(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_content_repair_material ON content_repair_queue(material_id, issue_type);

CREATE TRIGGER IF NOT EXISTS trg_content_repair_updated
AFTER UPDATE OF status, source_file_id, note ON content_repair_queue
BEGIN
  UPDATE content_repair_queue SET updated_at = datetime('now') WHERE id = NEW.id;
END;
