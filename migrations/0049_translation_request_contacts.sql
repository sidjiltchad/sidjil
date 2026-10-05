-- بيانات التواصل لطلبات الترجمة العامة.
-- طلبات الباحثين الموثقين تُملأ تلقائيًا من حساب الباحث، بينما يكتب
-- زائر الموقع العام اسمه وبريده قبل الإرسال.
ALTER TABLE translation_requests ADD COLUMN requester_name TEXT;
ALTER TABLE translation_requests ADD COLUMN requester_email TEXT;
CREATE INDEX IF NOT EXISTS idx_translation_requests_contact
  ON translation_requests(requester_email, created_at);
