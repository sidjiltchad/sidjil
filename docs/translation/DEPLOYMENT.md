# النشر

خدمة المعالجة داخل شبكة خاصة أو خلف Cloudflare Access. لا تفتح `/jobs` للعامة. ضع حدود CPU والذاكرة والصفحات والحجم كما في Docker Compose. غيّر `engine_version` عند ترقية محرك تغيّر نتيجته، فتتولد بصمة جديدة ولا تختلط النتائج القديمة.

حالة هذا المشروع: Worker منشور مع مسارات الإدخال والإخراج الداخلية، و`TRANSLATION_SERVICE_TOKEN` و`TRANSLATION_SERVICE_URL` مضبوطان في Cloudflare. منفذ الخدمة المحلي هو `127.0.0.1:18080` ويحوّل إلى FastAPI الداخلي `8080`. تم إنشاء Tunnel مُسمّى وربطه بـ`translate-api.sidjil.org`، وهو يوجه إلى `http://127.0.0.1:18080`. ملف بيانات اعتماد Tunnel محفوظ خارج المستودع داخل مجلد Cloudflare المحلي.

يُضبط داخل `translation-service/.env`:

```dotenv
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_TEMPERATURE=0.1
OLLAMA_KEEP_ALIVE=10m
OLLAMA_NUM_CTX=8192
MAX_AI_TRANSLATION_JOBS=1
```

تبقى بيانات خدمة النماذج القديمة محفوظة ولا تُزال تلقائيًا. لا تستخدم أوامر تنظيف Docker العامة، ولا تفتح منفذ Ollama (`11434`) في Cloudflare Tunnel.
