-- 0011: روابط فيسبوك وإحصاءات الزوار المجمّعة
ALTER TABLE admin_users ADD COLUMN facebook_url TEXT;

UPDATE admin_users
SET facebook_url = website
WHERE website IS NOT NULL AND lower(website) LIKE '%facebook.com%';

CREATE TABLE IF NOT EXISTS visitor_daily (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  views INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_visitor_daily_day ON visitor_daily(day);

CREATE TABLE IF NOT EXISTS visitor_presence (
  visitor_hash TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_visitor_presence_seen ON visitor_presence(last_seen_at);
