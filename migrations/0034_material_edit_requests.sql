CREATE TABLE IF NOT EXISTS material_edit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  researcher_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by INTEGER REFERENCES admin_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_edit_requests_pending
  ON material_edit_requests(material_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_material_edit_requests_status_requested
  ON material_edit_requests(status, requested_at);
