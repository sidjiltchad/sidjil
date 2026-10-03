-- 0030: مسرد مصطلحات الترجمة (تثبيت أسماء تشاد والمصطلحات قبل الترجمة الآلية)
CREATE TABLE IF NOT EXISTS glossary (
  id INTEGER PRIMARY KEY,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_term TEXT NOT NULL,
  target_term TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_lang, target_lang, source_term)
);
CREATE INDEX IF NOT EXISTS idx_glossary_pair ON glossary(source_lang, target_lang);
