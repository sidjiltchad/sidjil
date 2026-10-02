-- ============================================================
-- SIDJIL — الترحيل 0008: مجلس سِجِل (النقاشات العلمية) + توثيق الباحثين
-- ============================================================
-- الأدوار: زائر (بلا حساب — يتفاعل فقط) | باحث (حساب غير موثّق — لا ينشر)
-- | باحث موثّق (is_verified=1 — يخوض النقاش) | الإدارة (توثّق الباحثين)

-- 1) توثيق الباحثين + الملف التعريفي
ALTER TABLE admin_users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN display_name TEXT;
ALTER TABLE admin_users ADD COLUMN affiliation TEXT;
ALTER TABLE admin_users ADD COLUMN bio TEXT;

-- الباحثون المنشأون يدويًا من الإدارة سابقًا يُعتبرون موثّقين ضمنيًا
UPDATE admin_users SET is_verified = 1 WHERE role = 'researcher';

-- 2) النقاشات
-- kind: comment=تعليق | review=مراجعة | critique=نقد | idea=نقد فكرة | text=نقد نص
CREATE TABLE IF NOT EXISTS discussions (
  id          INTEGER PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,  -- NULL = نقاش عام
  author_id   INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'comment',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  quote_text  TEXT,     -- النص المنتقد بعينه (لنقد نصٍّ)
  page_no     TEXT,     -- رقم الصفحة إن وُجد
  status      TEXT NOT NULL DEFAULT 'published',  -- published | hidden
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discussions_material ON discussions(material_id, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_discussions_author ON discussions(author_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_discussions_status ON discussions(status, id DESC);

-- 3) الردود (متداخلة بمستوى واحد عبر parent_id)
CREATE TABLE IF NOT EXISTS discussion_replies (
  id            INTEGER PRIMARY KEY,
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES discussion_replies(id) ON DELETE CASCADE,
  author_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'published',  -- published | hidden
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_discussion ON discussion_replies(discussion_id, status, id);

-- 4) التفاعلات (للزوار بلا حساب عبر ip_hash، وللباحثين عبر user_id)
-- kind: like=إعجاب | support=دعم | useful=مفيد | oppose=أعارض
-- تفاعل واحد لكل فاعل على كل هدف (يمكن تغيير نوعه)
CREATE TABLE IF NOT EXISTS discussion_reactions (
  id            INTEGER PRIMARY KEY,
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  reply_id      INTEGER REFERENCES discussion_replies(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
  ip_hash       TEXT,
  actor_key     TEXT NOT NULL,   -- 'u:<id>' أو 'ip:<hash>'
  kind          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- ملاحظة: reply_id قد تكون NULL لذا نستخدم COALESCE في الفهرس الفريد
CREATE UNIQUE INDEX IF NOT EXISTS uq_reaction_actor
  ON discussion_reactions(discussion_id, COALESCE(reply_id, 0), actor_key);
CREATE INDEX IF NOT EXISTS idx_reactions_discussion ON discussion_reactions(discussion_id, reply_id);
