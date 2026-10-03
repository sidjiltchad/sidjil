# استكشاف الأخطاء

- `TRANSLATION_UNAVAILABLE`: تحقق من `TRANSLATION_SERVICE_URL` و`TRANSLATION_SERVICE_TOKEN` وحالة `/health`، ثم تحقق من `OLLAMA_BASE_URL` ووجود نموذج `qwen3:8b` عبر `/engine` داخل خدمة FastAPI.
- `SERVICE_NOT_CONFIGURED`: لم تضبط عنوان خدمة المعالجة في Worker بعد.
- `PDF_TOO_LARGE` أو `PDF_TOO_MANY_PAGES`: عدّل إعدادات D1 بعد تقييم موارد الخدمة.
- `FAILED`: راجع `translation_events` و`error_code` دون تسجيل محتوى المستند.
- إذا نجحت صفحات قليلة ثم فشلت الوظيفة، راجع `current_stage` و`error_code`. يعيد محرك Ollama المحاولة تلقائيًا حتى `OLLAMA_MAX_RETRIES` مرة، والمهلة لكل طلب `OLLAMA_REQUEST_TIMEOUT`. إعادة فتح العارض تستأنف مراقبة وظيفة الكتاب نفسها بدل إرسال طلب جديد.
