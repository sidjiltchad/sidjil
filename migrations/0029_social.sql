-- 0029: الشبكة الاجتماعية لمساحة الباحث — المتابعة والتنبيهات
CREATE TABLE IF NOT EXISTS researcher_follows (
  id INTEGER PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  followed_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON researcher_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON researcher_follows(followed_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, id DESC);
