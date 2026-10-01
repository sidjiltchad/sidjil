-- ============================================================
-- Archifouna — أرشيفنا : مخطط قاعدة البيانات (Cloudflare D1)
-- D1 = SQLite، هذا الملف يُطبَّق عبر: wrangler d1 migrations apply
-- ============================================================

-- عدّادات الترقيم الأرشيفي: ARC-TD-{CODE}-NNNNNN
CREATE TABLE IF NOT EXISTS counters (
  type_code TEXT PRIMARY KEY,          -- DOC, BOK, MSS, IMG, MAP, PRS, COR, EXC
  next_num  INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO counters (type_code, next_num) VALUES
  ('DOC',1),('BOK',1),('MSS',1),('IMG',1),('MAP',1),('PRS',1),('COR',1),('EXC',1);

-- المؤسسات المصدرية (ANOM، Gallica، ECPAD...)
CREATE TABLE IF NOT EXISTS sources (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,             -- الاسم الأصلي: Archives nationales d'outre-mer
  name_ar   TEXT,                      -- الاسم بالعربية
  kind      TEXT,                      -- archive | library | museum | private | web | press
  website   TEXT,
  notes     TEXT
);

-- الشخصيات
CREATE TABLE IF NOT EXISTS people (
  id                  INTEGER PRIMARY KEY,
  name_ar             TEXT NOT NULL,
  name_orig           TEXT,
  bio                 TEXT,
  birth_year          INTEGER,
  death_year          INTEGER,
  identity_confidence TEXT NOT NULL DEFAULT 'unknown',  -- confirmed | probable | unknown
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الأماكن
CREATE TABLE IF NOT EXISTS places (
  id               INTEGER PRIMARY KEY,
  name_ar          TEXT NOT NULL,
  name_orig        TEXT,
  region           TEXT,               -- وداي، كانم، باقرمي...
  kind             TEXT,               -- city | region | country | site
  lat              REAL,
  lng              REAL,
  place_confidence TEXT NOT NULL DEFAULT 'unknown',     -- confirmed | probable | unknown
  notes            TEXT
);

-- الكلمات المفتاحية
CREATE TABLE IF NOT EXISTS tags (
  id        INTEGER PRIMARY KEY,
  name_ar   TEXT NOT NULL UNIQUE,
  name_orig TEXT
);

-- السجل الأساسي لكل مادة
CREATE TABLE IF NOT EXISTS materials (
  id                   INTEGER PRIMARY KEY,
  ark                  TEXT NOT NULL UNIQUE,   -- ARC-TD-DOC-000001 (ثابت دائمًا)
  type                 TEXT NOT NULL,          -- document|book|manuscript|image|map|press|correspondence|excerpt
  title_ar             TEXT NOT NULL,
  title_orig           TEXT,
  description          TEXT,
  language             TEXT,                   -- fr | ar | ...
  year                 INTEGER,
  date_text            TEXT,                   -- عرض حر: «6 ديسمبر 1951»
  date_confidence      TEXT NOT NULL DEFAULT 'unknown', -- confirmed|approximate|probable|unknown
  author               TEXT,
  photographer         TEXT,
  place_id             INTEGER REFERENCES places(id),
  place_confidence     TEXT NOT NULL DEFAULT 'unknown',
  source_id            INTEGER REFERENCES sources(id),
  archive_ref          TEXT,                   -- المرجع الأرشيفي: 5D 269
  source_url           TEXT,
  rights               TEXT,
  full_text            TEXT NOT NULL DEFAULT '', -- نص مفرّغ/منظّم للعرض والبحث
  transcription_status TEXT NOT NULL DEFAULT 'none',     -- none|auto|corrected
  translation_status   TEXT NOT NULL DEFAULT 'none',     -- none|machine|in_review|reviewed|approved
  publish_status       TEXT NOT NULL DEFAULT 'draft',    -- draft|published|hidden
  views                INTEGER NOT NULL DEFAULT 0,
  search_blob          TEXT NOT NULL DEFAULT '',  -- نص مطبّع للفهرسة (يُبنى برمجيًا)
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materials_ark    ON materials(ark);
CREATE INDEX IF NOT EXISTS idx_materials_type   ON materials(type);
CREATE INDEX IF NOT EXISTS idx_materials_year   ON materials(year);
CREATE INDEX IF NOT EXISTS idx_materials_pub    ON materials(publish_status);
CREATE INDEX IF NOT EXISTS idx_materials_updated ON materials(updated_at DESC);

-- فهرس البحث النصي الكامل (يُدار من طبقة التطبيق عبر rebuildSearchBlob)
CREATE VIRTUAL TABLE IF NOT EXISTS materials_fts USING fts5(
  ark UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);

-- الملفات (الأصلية والمرفقات والمصغرات) — المحتوى في R2، البيانات هنا
CREATE TABLE IF NOT EXISTS files (
  id          INTEGER PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'original',  -- original | attachment | thumbnail
  filename    TEXT NOT NULL,
  mime        TEXT,
  size        INTEGER,
  sha256      TEXT,                              -- البصمة الرقمية (§15)
  r2_key      TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_material ON files(material_id);

-- نسخ الصور: الأصل والمشتقات (ترميم/تحسين/تلوين/تعليق/قص)
CREATE TABLE IF NOT EXISTS image_versions (
  id           INTEGER PRIMARY KEY,
  material_id  INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  version_type TEXT NOT NULL,   -- original|restored|enhanced|colorized|annotated|cropped
  file_id      INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  process_note TEXT,            -- بيان المعالجة الظاهر للزائر (§14)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_imgver_material ON image_versions(material_id);

-- طبقات التفريغ النصي: الآلي والمصحح يدويًا (لا يستبدل أحدهما الآخر §12)
CREATE TABLE IF NOT EXISTS transcriptions (
  id          INTEGER PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  layer       TEXT NOT NULL,    -- auto | manual
  lang        TEXT,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الترجمات مع حالة سير العمل (§10)
CREATE TABLE IF NOT EXISTS translations (
  id          INTEGER PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL DEFAULT 'ar',
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'machine',  -- machine|in_review|reviewed|approved
  translator  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- قاموس الترجمة المتخصص (§11): Ouaddaï ←→ وداي...
CREATE TABLE IF NOT EXISTS glossary (
  id        INTEGER PRIMARY KEY,
  term_orig TEXT NOT NULL,
  term_ar   TEXT NOT NULL,
  domain    TEXT,
  notes     TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(term_orig, term_ar)
);

-- المجموعات الموضوعية المختارة
CREATE TABLE IF NOT EXISTS collections (
  id                INTEGER PRIMARY KEY,
  title_ar          TEXT NOT NULL,
  title_fr          TEXT,
  description       TEXT,
  cover_material_id INTEGER REFERENCES materials(id),
  sort_order        INTEGER NOT NULL DEFAULT 0
);

-- جداول الربط
CREATE TABLE IF NOT EXISTS material_people (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role        TEXT,
  PRIMARY KEY (material_id, person_id)
);
CREATE TABLE IF NOT EXISTS material_places (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  place_id    INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  relation    TEXT,
  PRIMARY KEY (material_id, place_id)
);
CREATE TABLE IF NOT EXISTS material_tags (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (material_id, tag_id)
);
CREATE TABLE IF NOT EXISTS material_collections (
  material_id   INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (material_id, collection_id)
);
-- علاقات مادة↔مادة (وثيقة ترد على وثيقة، صورة لنفس المشهد...)
CREATE TABLE IF NOT EXISTS material_relations (
  id         INTEGER PRIMARY KEY,
  material_a INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  material_b INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  relation   TEXT,
  note       TEXT,
  UNIQUE(material_a, material_b)
);

-- الإدارة والأمن
CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- pbkdf2$iter$salt$hash (base64)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER,
  action     TEXT NOT NULL,      -- material.create, file.upload, ...
  target     TEXT,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
