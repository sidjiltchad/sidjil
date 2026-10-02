-- 0009: الحساب والأمان والملف الشخصي للمستخدمين الإداريين

ALTER TABLE admin_users ADD COLUMN display_name TEXT;
ALTER TABLE admin_users ADD COLUMN email TEXT;
ALTER TABLE admin_users ADD COLUMN phone TEXT;
ALTER TABLE admin_users ADD COLUMN avatar_url TEXT;
ALTER TABLE admin_users ADD COLUMN last_login_at TEXT;
ALTER TABLE admin_users ADD COLUMN password_changed_at TEXT;
ALTER TABLE admin_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email
  ON admin_users(email) WHERE email IS NOT NULL AND email <> '';

ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at);

-- الحساب الأول المنشأ في النظام هو Super Admin حتى لا تُفقد صلاحية الإدارة العليا.
UPDATE admin_users
SET is_super_admin = 1,
    display_name = COALESCE(NULLIF(display_name, ''), username),
    password_changed_at = COALESCE(password_changed_at, created_at),
    updated_at = datetime('now')
WHERE id = (SELECT MIN(id) FROM admin_users);
