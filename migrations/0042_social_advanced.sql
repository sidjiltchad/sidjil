-- 0042: تفاعلات المجتمع والحفظ والوسوم والإشراف.
-- الجداول عامة الهدف حتى تعمل مع المواد والمنشورات والنقاشات والردود.

CREATE TABLE IF NOT EXISTS social_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('material','discussion','reply')),
  target_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'like' CHECK (kind IN ('like','support','useful','oppose')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(actor_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_social_reactions_target ON social_reactions(target_type, target_id, kind);
CREATE INDEX IF NOT EXISTS idx_social_reactions_actor ON social_reactions(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('material','discussion','reply')),
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_social_bookmarks_user ON social_bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_bookmarks_target ON social_bookmarks(target_type, target_id);

CREATE TABLE IF NOT EXISTS social_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS social_post_tags (
  tag_id INTEGER NOT NULL REFERENCES social_tags(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('material','discussion','reply')),
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(tag_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_social_post_tags_target ON social_post_tags(target_type, target_id);

CREATE TABLE IF NOT EXISTS social_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentioned_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('material','discussion','reply')),
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mentioned_user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_social_mentions_user ON social_mentions(mentioned_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_blocks (
  blocker_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(blocker_id, blocked_id),
  CHECK(blocker_id <> blocked_id)
);
CREATE TABLE IF NOT EXISTS social_mutes (
  muter_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  muted_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(muter_id, muted_id),
  CHECK(muter_id <> muted_id)
);
CREATE INDEX IF NOT EXISTS idx_social_blocks_blocked ON social_blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_social_mutes_muted ON social_mutes(muted_id);

CREATE TABLE IF NOT EXISTS social_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('material','discussion','reply','researcher')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  reviewed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(reporter_id, target_type, target_id, status)
);
CREATE INDEX IF NOT EXISTS idx_social_reports_status ON social_reports(status, created_at ASC);

CREATE TABLE IF NOT EXISTS discussion_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  editor_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discussion_versions_discussion ON discussion_versions(discussion_id, created_at DESC);
