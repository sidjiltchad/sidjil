# التثبيت

طبّق migrations ثم انشر Worker. شغّل `translation-service/docker-compose.yml`، واضبط في ملف الخدمة `SIDJIL_WORKER_URL` والرمز نفسه في `TRANSLATION_SERVICE_TOKEN`، و`OLLAMA_BASE_URL=http://host.docker.internal:11434` و`OLLAMA_MODEL=qwen3:8b`. بعد نشر الخدمة على عنوان HTTPS اضبط أسرار Worker: `TRANSLATION_SERVICE_URL` و`TRANSLATION_SERVICE_TOKEN`. لا تُعرض Ollama عبر النفق؛ النفق يمرر FastAPI فقط. لا تُحفظ مفاتيح R2 في الخدمة؛ Worker ينقل الإدخال والإخراج عبر مسارات داخلية محمية.
