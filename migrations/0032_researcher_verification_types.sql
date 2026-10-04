-- Categorize researcher verification while preserving existing verified access.
ALTER TABLE admin_users
  ADD COLUMN verification_type TEXT NOT NULL DEFAULT 'none'
  CHECK (verification_type IN ('none', 'research', 'administrative', 'participation'));

UPDATE admin_users
SET verification_type = 'research'
WHERE role = 'researcher' AND is_verified = 1;
