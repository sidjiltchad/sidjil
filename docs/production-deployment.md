# النشر الإنتاجي — سِجِل | SIDJIL

> آخر تحديث: 2026-10-01 — أول نشر إنتاجي تم على العنوان المؤقت.

## الهوية
- الاسم الرسمي: **SIDJIL** — الاسم العربي: **سِجِل**
- الوصف: سِجِل — أرشيف تاريخ تشاد الرقمي / SIDJIL — Archives historiques du Tchad
- الدومين المستهدف: **sidjil.org** (غير مربوط حتى الآن — لا يُربط إلا بإذن صريح بعد نجاح كل الاختبارات)

## موارد الإنتاج
| المورد | القيمة |
|---|---|
| Worker name | `sidjil` |
| Temporary URL | `https://sidjil.sidjil.workers.dev/` |
| workers.dev subdomain | `sidjil` (ثبت في 2026-10-01) |
| D1 database | `sidjil-prod` (`fd170307-68fd-459b-8fd1-80c26396b1e4`) |
| D1 binding | `DB` |
| R2 bucket | `sidjil-assets` (خاص Private — لا يُفتح للعامة أبدًا) |
| R2 binding | `FILES` (اسم الربط الفعلي في الكود — لا يُغيَّر) |
| البيئة | production (منفصلة تمامًا عن التطوير) |
| تاريخ أول نشر | 2026-10-01 |
| Migration version | `0001_init.sql` ← `0002_segments.sql` ← `0003_raw_text.sql` (طبقت بالترتيب) |
| Deployment ID / Version | آخر نشر: 2026-10-01 (مع ربط R2) — يُراجع من لوحة Cloudflare ← Deployments |

## بيانات الإنتاج (2026-10-01)
- 9 مواد منشورة (3 كتب، 3 وثائق، 1 استكشاف/بعثة، 3 صور).
- 4 ملفات أصلية في R2 (3 صور + مشتق محسّن واحد)، كلها SHA-256 مطابق للسجلات.
- أول نسخة احتياطية: `backups/2026-10-01/` (D1 كامل + R2 inventory + manifest).

## المبادئ
- موارد الإنتاج منفصلة تمامًا: لا تُستخدم D1 أو R2 أو Secrets التطوير.
- الأصل Immutable: الملفات الأصلية في R2 لا تُكتب فوقها أبدًا؛ كل مشتق ملف مستقل.
- الأرقام الأرشيفية `ARC-TD-*` ثابتة ولا تتغير بتغير العلامة.
- لا أسرار في هذا الملف ولا في المستودع — تُضبط عبر `wrangler secret put` أو ما يكافئه عبر API.

## المسارات الأساسية
- الصفحة الرئيسية: `/` (عربي افتراضيًا، `?lang=fr` للفرنسية)
- صفحة المادة: `/document/{archive_number}` (مثال: `/document/ARC-TD-IMG-000001`)
- ملف: `/file/{file_id}` (يُخدَم من R2)
- API عام (JSON): `/api/v1/search`، `/api/v1/stats`، `/api/v1/glossary`، `/api/v1/document/{ark}`، `/api/v1/document/{ark}/citation`، `/api/v1/collections/{id}`، `/api/v1/{people,places,sources,tags,collections}`
- خريطة الموقع: `/sitemap.xml` — **المرجع الموثوق لوجود المواد في الإنتاج** (9 مواد حاليًا)

## نشر إصدار جديد
1. تحقق محليًا: `node --check` لكل ملفات `src/`، وشغّل `wrangler dev` واختبار دخاني سريع.
2. طبّق أي migrations جديدة على `sidjil-prod` أولًا (بالترتيب، واحدة واحدة).
3. ادمج الكود (`esbuild src/index.js --bundle`) وارفع الـWorker مع الـbindings نفسها.
4. **تفعيل workers.dev**: النشر عبر API لا يفعّل route تلقائيًا — بعد أول نشر نفّذ:
   `POST /accounts/{id}/workers/scripts/sidjil/subdomain` بالجسم `{"enabled": true}`.
5. سجّل: Deployment ID، التاريخ، الـcommit، وحالة الـmigrations.
6. اختبار دخاني على العنوان المؤقت قبل اعتبار النشر ناجحًا.

## Rollback
- كل نشر Worker يحتفظ بإصدار سابق: من لوحة Cloudflare ← Workers ← `sidjil` ← Deployments ← Rollback إلى الإصدار السابق.
- الـmigrations أحادية الاتجاه: لا يُرجَع migration مطبق؛ عند مشكلة في بيانات يُعالَج بإصلاح محدود موثق لا بإعادة البناء.

## النسخ الاحتياطي (Backup)
- **D1**: تصدير SQL دوري عبر `wrangler d1 export sidjil-prod` (أو ما يكافئه API) وحفظه خارج Cloudflare.
- **R2**: جرد كامل للكائنات (`r2 object list`) مع manifest يتضمن لكل ملف أصلي: `archive_number` و`r2_key` و`sha256` و`size` و`mime_type`.
- **Deployment**: سجل كل نشر (الإصدار، التاريخ، الـcommit، حالة الـmigrations) في ملف `docs/deployments-log.md`.
- أول نسخة احتياطية تُنشأ فور نجاح النشر الأول.

## الاستعادة (Restore)
1. أنشئ قاعدة D1 جديدة فارغة وطبّق الـmigrations بالترتيب.
2. استورد ملف SQL الاحتياطي.
3. أعد رفع كائنات R2 من النسخة المحلية (تحقق من `sha256` لكل ملف أصلي بعد الرفع).
4. انشر الـWorker واربطه بالموارد المستعادة، ثم اختبار دخاني.

## تحديث الأسرار (Secrets)
- لا تُكتب الأسرار في أي ملف: `echo -n 'VALUE' | npx wrangler secret put NAME --env production` (أو ما يكافئه عبر API).
- الأسرار المستخدمة: جلسات الإدارة، CSRF، بيانات اعتماد الإدارة (hash)، مفاتيح OCR/الترجمة عند ضبط مزود فعلي.
- عند تدوير سر: حدّثه ثم أعد النشر؛ لا حاجة لتغيير الكود.

## إضافة الدومين أو تغييره مستقبلًا
1. أضف الدومين في لوحة Cloudflare ← Workers ← `sidjil` ← Settings ← Domains & Routes.
2. اجعل `https://sidjil.org` الأساسي، و`www.sidjil.org` تحويلًا دائمًا إليه.
3. فعّل فرض HTTPS (Always Use HTTPS) وتأكد من عدم وجود Mixed Content.
4. حدّث `SITE_URL`/canonical في الكود فقط إن لزم، ثم أعد النشر واختبر.

## سجل القرارات المرتبطة
- `docs/adr/001-vanilla-stack.md` — البناء الحالي Vanilla دون أطر.
- `docs/adr/002-rename-archifouna-to-sidjil.md` — إعادة التسمية.
