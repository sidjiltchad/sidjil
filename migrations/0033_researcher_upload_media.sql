CREATE TABLE IF NOT EXISTS discussion_files (
  id            INTEGER PRIMARY KEY,
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  r2_key        TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_discussion_files_discussion
  ON discussion_files(discussion_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_one_material_cover
  ON files(material_id) WHERE kind = 'cover';
