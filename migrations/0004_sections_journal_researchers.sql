-- ============================================================
-- SIDJIL — الترحيل 0004: أقسام سجل + المجلة + الباحثون + الإعلانات
-- (خطة 2026-10-01: المراحل 1–4)
-- ملاحظة: لا يوجد أي CHECK على publish_status في الهجرات السابقة،
-- لذا تُضاف حالة in_review برمجيًا دون تغيير DDL.
-- ============================================================

-- 1) تمييز الأقسام (sections) عن المجموعات الموضوعية (collections)
ALTER TABLE collections ADD COLUMN kind TEXT NOT NULL DEFAULT 'collection';

-- 2) أدوار المستخدمين: admin | researcher + إمكانية الإيقاف
ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE admin_users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- 3) تتبّع منشئ المادة + ملاحظة المراجعة (دورة الباحثين)
ALTER TABLE materials ADD COLUMN created_by INTEGER REFERENCES admin_users(id);
ALTER TABLE materials ADD COLUMN review_note TEXT;

-- 4) عدّادات الأرقام الأرشيفية للأنواع الجديدة: JRN (مجلة) / ART (مقال)
INSERT OR IGNORE INTO counters (type_code, next_num) VALUES ('JRN', 1), ('ART', 1);

-- 5) الإعلانات الإدارية (تظهر في الصفحة الرئيسية للزوار)
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY,
  title_ar   TEXT NOT NULL,
  title_fr   TEXT,
  body_ar    TEXT,
  body_fr    TEXT,
  link_url   TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at  TEXT,                       -- صيغة «YYYY-MM-DD HH:MM:SS»
  ends_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON announcements(active, sort_order, id);

-- 6) الأقسام السبعة (تُدخَل مرة واحدة فقط — حماية من التكرار)
INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'سجل تاريخي', 'Histoire',
  'الوثائق والمصادر المتعلقة بتاريخ تشاد: وثائق أرشيفية، كتب ودراسات، صور تاريخية، خرائط، مذكرات وشهادات.',
  'section', 1
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 1);

INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'سجل أدبي', 'Littérature',
  'التراث الأدبي التشادي بالعربية والفرنسية: مخطوطات ومطبوعات ودراسات أدبية.',
  'section', 2
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 2);

INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'سجل شعري', 'Poésie',
  'الشعر التشادي: دواوين وقصائد ومختارات شعرية.',
  'section', 3
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 3);

INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'سجل سياسي', 'Politique',
  'مصادر الحياة السياسية التشادية ووثائقها ودراساتها.',
  'section', 4
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 4);

INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'سجل لغوي', 'Linguistique',
  'مصادر اللغات في تشاد ودراساتها اللغوية.',
  'section', 5
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 5);

INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'سجل معاصر', 'Contemporain',
  'قضايا تشاد المعاصرة: وثائق وشهادات ودراسات.',
  'section', 6
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 6);

INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'سجل ديني', 'Religion',
  'التراث الديني في تشاد: علوم شرعية وتصوف وتاريخ التديّن.',
  'section', 7
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 7);
