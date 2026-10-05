-- 0045: استئناف آمن للترجمات وتتبّع محاولات المعالجة.
-- لا نحذف أي صفحة مكتملة؛ نضيف بيانات تساعد على استرداد الوظائف المتوقفة.

ALTER TABLE translation_documents ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE translation_documents ADD COLUMN heartbeat_at TEXT;
ALTER TABLE translation_documents ADD COLUMN last_error_at TEXT;

CREATE INDEX IF NOT EXISTS idx_translation_documents_heartbeat
  ON translation_documents(status, heartbeat_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_translation_pages_retry
  ON translation_pages(document_id, status, attempts, updated_at);

