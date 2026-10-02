-- 0010: ملفات الباحثين والمدونين وصور الحساب المخزنة في R2
ALTER TABLE admin_users ADD COLUMN avatar_r2_key TEXT;
ALTER TABLE admin_users ADD COLUMN bio TEXT;
ALTER TABLE admin_users ADD COLUMN specialty TEXT;
ALTER TABLE admin_users ADD COLUMN website TEXT;
ALTER TABLE admin_users ADD COLUMN is_public_profile INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_admin_users_public_researchers
  ON admin_users(role, is_active, is_public_profile);
