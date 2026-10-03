-- Google OAuth identities for researcher accounts.
ALTER TABLE admin_users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_google_sub
  ON admin_users(google_sub) WHERE google_sub IS NOT NULL AND google_sub <> '';
