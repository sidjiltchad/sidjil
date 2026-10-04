-- Published journal issues uploaded as complete PDF files.
CREATE TABLE IF NOT EXISTS journal_pdf_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_number TEXT NOT NULL,
  year INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(year, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_journal_pdf_issues_year
  ON journal_pdf_issues(year DESC, id DESC);
