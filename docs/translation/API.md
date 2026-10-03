# API

- `POST /api/v1/translate/text` — `{text, source, target}`، يعمل للزائر مع حدود الإعدادات.
- `GET /api/v1/documents/:id/translations` — الترجمات الجاهزة للمادة.
- `POST /api/v1/documents/:id/translations` — `{source,target,mode,ocr}`، يعيد `jobId` أو نتيجة معاد استخدامها.
- `GET /api/v1/translate/jobs/:id` — الحالة والتقدم.
- `GET /api/v1/translate/jobs/:id/download` — تنزيل الناتج بعد التحقق من الصلاحية.
- `GET /api/v1/admin/translation-jobs` — قائمة وظائف ترجمة الملفات للمدير مع الحالة والتقدم والمواد المرتبطة.
- `DELETE /api/v1/admin/translation-jobs/:id` — حذف وظيفة وملفها الناتج من R2 وسجل أحداثها.
- `POST /api/v1/admin/translation-jobs/cleanup` — تنظيف الوظائف القديمة والكاش، مع `beforeDays` حدًا زمنيًا.
- `PATCH /api/v1/translate/internal/jobs/:id` — تحديث محمي برمز الخدمة.

اللغات الأولية: `ar`, `fr`, `en` و`auto` للمصدر.

خدمة FastAPI الداخلية تستخدم Ollama المحلي (`qwen3:8b`) عبر `/api/chat`، وتعرض `/health` و`/ready` و`/engine` للتشخيص. لا يُعرّض النفق Ollama؛ عنوانه العام يصل إلى FastAPI فقط.
