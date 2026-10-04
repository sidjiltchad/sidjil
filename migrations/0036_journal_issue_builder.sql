-- Journal issue workspace: editable issue metadata and ordered editorial blocks.
CREATE TABLE IF NOT EXISTS journal_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_number TEXT NOT NULL,
  year INTEGER NOT NULL,
  title_ar TEXT NOT NULL DEFAULT 'مجلة سِجِل',
  subtitle_ar TEXT NOT NULL DEFAULT '',
  editorial_ar TEXT NOT NULL DEFAULT '',
  columns_count INTEGER NOT NULL DEFAULT 2 CHECK (columns_count BETWEEN 1 AND 3),
  blocks_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
  created_by INTEGER REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  ready_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_issues_updated
  ON journal_issues(status, updated_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_issues_number_year
  ON journal_issues(year, issue_number);

CREATE TABLE IF NOT EXISTS journal_issue_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
