-- ============================================================
-- سِجِل — الترحيل 0047: منظومة الترجمة الجديدة (نظائر Word)
-- ============================================================
-- 1) إزالة منظومة الترجمة الآلية (Ollama) والترجمات النصية القديمة نهائيًا.
-- 2) تصنيف لغوي مستقل للملفات (متوافق مع قواعد سبق أن أضيف فيها files.lang).
-- 3) جدول نظائر الترجمة: file_translations — كل ملف أصلي قد يكون له
--    نظير Word بلغة أخرى (فرنسي→عربي، عربي→فرنسي، إنجليزي→عربي وفرنسي).
-- 4) جدول طلبات الترجمة من القرّاء: translation_requests.
-- ============================================================

-- لا نضيف عمودًا مباشرة إلى files حتى تكون الهجرة آمنة على قواعد سبق أن طبقتها
-- الهجرة المؤقتة 0035_file_translations. يبقى files.lang إن كان موجودًا،
-- ويُستخدم هذا الجدول كطبقة توافق في القواعد القديمة.
CREATE TABLE IF NOT EXISTS file_languages (
  file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  lang TEXT NOT NULL DEFAULT 'undetermined',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- نظائر الترجمة المرفوعة يدويًا (Word)
CREATE TABLE IF NOT EXISTS file_translations (
  id                INTEGER PRIMARY KEY,
  material_id       INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  source_file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  source_lang       TEXT NOT NULL,              -- ar|fr|en
  target_lang       TEXT NOT NULL,              -- ar|fr
  translation_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'ready',  -- ready
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_file_id, target_lang)
);
CREATE INDEX IF NOT EXISTS idx_file_translations_material
  ON file_translations(material_id);
CREATE INDEX IF NOT EXISTS idx_file_translations_source
  ON file_translations(source_file_id);

-- طلبات الترجمة الواردة من القرّاء والباحثين
CREATE TABLE IF NOT EXISTS translation_requests (
  id             INTEGER PRIMARY KEY,
  material_id    INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  source_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  target_lang    TEXT,
  requester_id   INTEGER,
  requester_ip   TEXT,
  status         TEXT NOT NULL DEFAULT 'new',  -- new|done|dismissed
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_translation_requests_status
  ON translation_requests(status, created_at);

-- لا تُحذف جداول قديمة هنا؛ قد تكون مستخدمة من إصدار سابق. تُزال بياناتها
-- بعد أخذ نسخة احتياطية وبعملية تشغيلية منفصلة.
