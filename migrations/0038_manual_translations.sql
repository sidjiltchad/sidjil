CREATE TABLE IF NOT EXISTS manual_translations (
  id TEXT PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  docx_key TEXT NOT NULL,
  pdf_key TEXT NOT NULL,
  docx_filename TEXT NOT NULL,
  pdf_filename TEXT NOT NULL,
  docx_size INTEGER NOT NULL,
  pdf_size INTEGER NOT NULL,
  note TEXT,
  uploaded_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_manual_translations_material
  ON manual_translations(material_id, source_language, target_language, created_at DESC);
