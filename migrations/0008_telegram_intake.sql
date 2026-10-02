-- 0008: استقبال مواد سِجِل عبر Telegram مع مراجعة إدارية قبل النشر

ALTER TABLE materials ADD COLUMN created_via TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE materials ADD COLUMN telegram_submission_id INTEGER;
ALTER TABLE materials ADD COLUMN source_attribution TEXT;
ALTER TABLE materials ADD COLUMN rights_status TEXT;

CREATE INDEX IF NOT EXISTS idx_materials_telegram_submission
  ON materials(telegram_submission_id);

-- سجل التحديثات لمنع إعادة تنفيذ webhook عند إعادة المحاولة من Telegram.
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id    INTEGER PRIMARY KEY,
  chat_id      TEXT,
  user_id      TEXT,
  received_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- حالة المحادثة لكل مستخدم/محادثة.
CREATE TABLE IF NOT EXISTS telegram_sessions (
  chat_id       TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'idle',
  payload_json  TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_updated
  ON telegram_sessions(updated_at);

-- الإرسال النهائي: مادة واحدة قد تحتوي عدة ملفات.
CREATE TABLE IF NOT EXISTS telegram_submissions (
  id                 INTEGER PRIMARY KEY,
  chat_id            TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  username           TEXT,
  first_name         TEXT,
  update_id          INTEGER,
  material_id        INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'receiving',
                         -- receiving|processing|in_review|published|changes_requested|rejected|failed
  expected_files      INTEGER NOT NULL DEFAULT 0,
  uploaded_files      INTEGER NOT NULL DEFAULT 0,
  caption             TEXT,
  review_message_id   TEXT,
  reviewed_by         TEXT,
  review_note         TEXT,
  error_message       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_submissions_status
  ON telegram_submissions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_submissions_chat
  ON telegram_submissions(chat_id, created_at DESC);

-- ملفات Telegram التي تنتظر التنزيل إلى R2 أو تم تنزيلها.
CREATE TABLE IF NOT EXISTS telegram_submission_files (
  id                 INTEGER PRIMARY KEY,
  submission_id      INTEGER NOT NULL REFERENCES telegram_submissions(id) ON DELETE CASCADE,
  telegram_file_id   TEXT NOT NULL,
  telegram_unique_id TEXT,
  filename           TEXT NOT NULL,
  mime               TEXT,
  size               INTEGER,
  status             TEXT NOT NULL DEFAULT 'queued',
                         -- queued|stored|failed
  file_id            INTEGER REFERENCES files(id) ON DELETE SET NULL,
  error_message      TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(submission_id, telegram_file_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_submission_files_status
  ON telegram_submission_files(status, submission_id);
