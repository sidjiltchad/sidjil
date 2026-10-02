-- 0013: استيراد أرشيف Google Drive مع تتبع المصدر والدفعات

CREATE TABLE IF NOT EXISTS drive_import_batches (
  id              INTEGER PRIMARY KEY,
  source_folder_id   TEXT NOT NULL,
  source_folder_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'inventory',
  total_files     INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  imported_files  INTEGER NOT NULL DEFAULT 0,
  duplicate_files INTEGER NOT NULL DEFAULT 0,
  failed_files    INTEGER NOT NULL DEFAULT 0,
  created_by      INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drive_import_batches_status
  ON drive_import_batches(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS drive_import_items (
  id              INTEGER PRIMARY KEY,
  batch_id        INTEGER NOT NULL REFERENCES drive_import_batches(id) ON DELETE CASCADE,
  drive_file_id   TEXT NOT NULL,
  drive_name      TEXT NOT NULL,
  drive_path      TEXT NOT NULL,
  drive_url       TEXT,
  mime            TEXT,
  size            INTEGER,
  classification  TEXT NOT NULL DEFAULT 'document',
  status          TEXT NOT NULL DEFAULT 'pending',
  material_id     INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  sha256          TEXT,
  r2_key          TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(batch_id, drive_file_id)
);

CREATE INDEX IF NOT EXISTS idx_drive_import_items_batch
  ON drive_import_items(batch_id, status, id);

CREATE INDEX IF NOT EXISTS idx_drive_import_items_drive_id
  ON drive_import_items(drive_file_id);

CREATE INDEX IF NOT EXISTS idx_drive_import_items_sha256
  ON drive_import_items(sha256);
