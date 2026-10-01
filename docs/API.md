# SIDJIL — عقد الوحدات والـ API (v1)

> الاسم السابق: Archifouna (أُعيدت التسمية إلى SIDJIL / سِجِل في 2026-10-01).

هذا الملف هو المرجع الملزم لكل من يبني جزءًا من المشروع.
قاعدة البيانات: `migrations/0001_init.sql` — أسماء الجداول والأعمدة نهائية، لا تغيّرها.

## 1) هيكل الملفات وملكية كل جزء

```
src/
  index.js        ← أنا (الموكّل): الموجّه الرئيسي فقط، لا منطق فيه
  i18n.js         ← فريق الواجهة العامة: القاموس اللغوي
  views.js        ← فريق الواجهة العامة: كل صفحات الزوار (HTML)
  api.js          ← فريق الخلفية: JSON API العام + تقديم الملفات + sitemap
  admin-api.js    ← فريق الخلفية: JSON API للإدارة (يتطلب جلسة)
  admin-views.js  ← فريق لوحة الإدارة: كل صفحات الإدارة (HTML، عربية فقط)
  lib/
    db.js         ← فريق الخلفية: مساعدات قاعدة البيانات
    auth.js       ← فريق الخلفية: التجزئة والجلسات
    search.js     ← فريق الخلفية: البحث والتطبيع
    r2files.js    ← فريق الخلفية: الرفع والتقديم من R2
    citation.js   ← فريق الخلفية: بناء الاستشهاد
public/
  style.css       ← فريق الواجهة العامة
  app.js          ← فريق الواجهة العامة (مقارنة قبل/بعد، نسخ الاستشهاد، البحث)
  admin.css       ← فريق لوحة الإدارة
  admin.js        ← فريق لوحة الإدارة
  logo.svg        ← فريق الواجهة العامة (شعار: صفحة وثيقة + قوس أرشيفي + حرف أ)
  robots.txt      ← فريق الواجهة العامة
```

## 2) الواجهات البرمجية بين الوحدات (exports الإلزامية)

### src/index.js (الموكّل)
```js
import { routeApi } from './api.js';            // GET /api/v1/*, /file/:id, /sitemap.xml → Response|null
import { routeAdminApi } from './admin-api.js'; // /api/v1/admin/* → Response|null
import { renderPublic } from './views.js';      // أي مسار آخر → Response (HTML)
import { renderAdmin } from './admin-views.js'; // /admin/* → Response (HTML)
import { getSessionUser } from './lib/auth.js';
```
الترتيب: `routeAdminApi` → `routeApi` → مسارات `/admin/*` (تحقق جلسة، ثم `renderAdmin(pathname, req, env, user)`) → `renderPublic(pathname, req, env)`.

### lib/auth.js — فريق الخلفية
- `hashPassword(plain: string): Promise<string>` — الصيغة: `pbkdf2$100000$<b64salt>$<b64hash>` عبر `crypto.subtle`.
- `verifyPassword(plain, stored): Promise<boolean>`
- `login(env, username, password, ip): Promise<{ok, token?, csrfToken?, error?}>` — يتحقق من `admin_users`، ينشئ صفًا في `sessions` (صلاحية 12 ساعة) **مع رمز CSRF مستقل**، ويسجّل في `audit_log`.
- `getSessionUser(req, env): Promise<user|null>` — يقرأ كوكي `archifouna_admin`؛ يعيد أيضًا `csrfToken`.
- `verifyCsrf(user, req): boolean` — يقارن هيدر `X-CSRF-Token` برمز الجلسة (مقارنة ثابتة الزمن).
- `logout(env, token): Promise<void>`
- `setSessionCookie(token): string` — `archifouna_admin=<t>; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200` (+ `Secure` إذا `request.url` يبدأ بـ https).
- `clearSessionCookie(): string`
- إنشاء المدير الأول: سكربت `scripts/hash-password.js` يطبع الهاش؛ يُزرع عبر `wrangler d1 execute` أو `.dev.vars` → `ADMIN_PASSWORD_HASH` (يقرأه `login` كبديل إذا جدول `admin_users` فارغ).

### lib/db.js — فريق الخلفية
- `TYPE_CODES = { document:'DOC', book:'BOK', manuscript:'MSS', image:'IMG', map:'MAP', press:'PRS', correspondence:'COR', excerpt:'EXC' }`
- `TYPE_DIRS  = { document:'documents', book:'books', manuscript:'manuscripts', image:'images', map:'maps', press:'press', correspondence:'correspondence', excerpt:'excerpts' }`
- `nextArk(db, type): Promise<string>` — يزيد `counters` ذريًا ويعيد `ARC-TD-DOC-000001`.
- `getMaterialFull(db, ark): Promise<object|null>` — المادة + `people[]` + `places[]` + `tags[]` + `collections[]` + `files[]` + `image_versions[]` (مع بيانات الملف) + `transcriptions[]` + `translations[]` + **`translation_segments[]`** (مقاطع أحدث ترجمة عربية، مرتبة) + `relations[]` (مواد مرتبطة) + `place` + `source`. يُستخدم في صفحة المادة و API.
- `touchMaterial(db, id)` — يحدّث `updated_at`.
- `rebuildSearchBlob(db, materialId): Promise<void>` — يبني النص المطبّع من: العناوين، الوصف، `full_text`، نصوص التفريغ والترجمات، **مقاطع الترجمة** (`source_text` + `reviewed_translation` مفضّلة على `machine_translation`)، أسماء الأشخاص/الأماكن/الوسوم/المصدر، المرجع الأرشيفي → يحدّث `materials.search_blob` ويعيد بناء صف `materials_fts` (حذف ثم إدخال: `ark, title, body`).
- `audit(db, {userId, action, target, detail, ip})`
- `normalizeText(s: string): string` — تطبيع عربي/فرنسي للفهرسة:
  - إزالة التشكيل (`[\u064B-\u065F\u0670]`) والتطويل (`\u0640`)
  - `أإآٱ`→`ا`، `ة`→`ه`، `ى`→`ي`، `ؤ`→`و`، `ئ`→`ي`
  - فرنسي: `toLowerCase()` + إزالة علامات التشكيل عبر `normalize('NFD')`
  - تصغير، تقليص المسافات.

### lib/search.js — فريق الخلفية
- `searchMaterials(db, params): Promise<{items, total, page, perPage}>`
  - `params = { q, type, fromYear, toYear, region, lang, personId, tagId, sourceId, collectionId, translationStatus, placeId, page, perPage, publishedOnly=true }`
  - إذا `q`: ابنِ استعلام FTS5: رمّز بـ `normalizeText`، كل رمز `tok*`، ثم `MATCH '{title body} : "t1"* "t2"*'`... الصيغة الصحيحة: `materials_fts MATCH ?` حيث `?` = `"t1"* "t2"*` (يبحث في title و body معًا) مع `ORDER BY bm25(materials_fts, 8.0, 1.0)` (ترجيح العنوان 8×).
  - الفلاتر تُبنى كـ `WHERE` إضافية مع `JOIN`s على الجداول الوسيطة عند الحاجة.
  - `region` يُطابق `places.region`.
  - النتائج: صفوف `materials` (الأعمدة الأساسية) + `snippet` عبر `snippet(materials_fts, 2, '<mark>', '</mark>', '…', 30)`.
- `advancedSearch` = نفس الدالة (الواجهة تجمع الحقول).

### lib/r2files.js — فريق الخلفية
- `safeName(name): string` — تنظيف اسم الملف.
- `r2KeyFor({ark, type, kind, versionType, filename, sha8})`:
  - أصلي/مرفق: `originals/{TYPE_DIRS[type]}/{ark}/{sha8}-{safeName}` (المرفقات: `originals/.../{ark}/att-{sha8}-{safe}`)
  - مشتق صورة: `derived/images/{ark}/{versionType}-{sha8}.jpg`
  - مصغرة: `thumbnails/{ark}/thumb-480.jpg`
- `putUpload(env, {materialId, ark, type}, file /*File من formData*/, kind): Promise<fileRow>` — يحسب `sha256` عبر `crypto.subtle.digest`، يرفع إلى R2 بالمفتاح، يُدخل صف `files`، يعيد الصف.
- `serveFile(env, fileId, {download}): Promise<Response>` — يجلب `files` ثم `env.FILES.get(r2_key)`؛ `Content-Type` من العمود، و`Content-Disposition: attachment` إذا `download=1`. يُستخدم للمسار `/file/:id`.
- حدود الرفع: `MAX_UPLOAD = 100 * 1024 * 1024` (100MB) — تُرفض الأكبر برسالة عربية.

### lib/citation.js — فريق الخلفية
- `buildCitation(m, lang='ar'): string` — الصيغة: `«{title_ar}»، سِجِل، رقم {ark}، المصدر الأصلي: {source_name}، المرجع: {archive_ref}.` (تُحذف الأجزاء الفارغة).

### lib/ocr.js — تجريد OCR بمزود قابل للتبديل
- `class OCRProvider` — العقد: `extract(file, options): Promise<{text, language, page_number, confidence, provider, status, error}>`.
- `class HttpOCRAdapter extends OCRProvider` — يرسل الملف (`multipart`) إلى `OCR_ENDPOINT`
  (مع `Authorization: Bearer OCR_API_KEY` إن ضُبط)؛ يتوقع `200 JSON` بصيغة
  `{text, language, confidence, pages: [{page_number, text, confidence}]}`؛ لا منطق خاص بمزود.
- `getOCRProvider(env): OCRProvider` — المصنع (لتغيير المزود: Adapter جديد هنا دون مساس ببقية النظام).

### lib/ratelimit.js — تحديد معدل الطلبات
- `check(key, limit, windowMs): {allowed, retryAfter}` — نافذة منزلقة في الذاكرة.
- `rateLimitCheck(req, clientIp): {allowed, retryAfter, rule}` — السياسة: login ‏10/د،
  OCR/المقاطع 30/د، `/admin/*` ‏300/د، `/search` ‏60/د، `/file/*` ‏60/د.
- `rateLimitResponse(retryAfter)` — رد `429` مع `Retry-After`.
- ⚠ قيد موثّق: الحد لكل isolate في الإنتاج — للحد الصارم عالميًا تُستخدم
  Cloudflare Rate Limiting Rules أو Durable Object.

### api.js — فريق الخلفية — `routeApi(req, env): Promise<Response|null>`
مسارات عامة (JSON):
- `GET /api/v1/search` — نفس params أعلاه، يعيد `{items:[{ark,type,title_ar,title_orig,year,date_text,place_name,source_name,thumb}], total, page, perPage}`. `thumb` = `/file/:id` لأول صورة/مصغرة.
- `GET /api/v1/document/:ark` — `getMaterialFull` (المنشورة فقط).
- `GET /api/v1/document/:ark/citation?lang=` — `{citation}`.
- `GET /api/v1/people?q=&page=` ، `/places` ، `/sources` ، `/tags` ، `/collections` ، `/collections/:id` (مع موادها).
- `GET /api/v1/glossary?term=` — بحث في القاموس.
- `GET /api/v1/stats` — `{materials, images, documents, people, places}` للرئيسية.
- ملفات: `GET /file/:id` (`?download=1` للتنزيل) — منشور فقط (ملفات مواد `published`).
- `GET /sitemap.xml` — كل المواد المنشورة + الصفحات الثابتة.
- الأخطاء: `{error: 'رسالة عربية'}` مع رمز HTTP مناسب.

### admin-api.js — فريق الخلفية — `routeAdminApi(req, env): Promise<Response|null>`
كل المسارات تحت `/api/v1/admin/*` وتتطلب جلسة صالحة (تُفحص داخل `routeAdminApi` عبر `getSessionUser`؛ بدونها `401 {error:'غير مصرح'}`).
**CSRF:** كل طلب معدِّل (`POST/PUT/PATCH/DELETE`) يتطلب هيدر `X-CSRF-Token` مطابقًا لرمز
الجلسة (يُعاد في رد `login` كـ `csrfToken` ويُحقن كميتا في صفحات الإدارة)؛ بدونه `403`.
المصادقة كوكيز جلسات (ليست Cloudflare Access) لذا CSRF قابل للتطبيق فعلًا.
- `POST /api/v1/admin/login` `{username,password}` → كوكي جلسة + `{csrfToken}`. `POST /api/v1/admin/logout`.
- `GET /api/v1/admin/materials?status=&type=&q=&page=` — قائمة (كل الحالات).
- `POST /api/v1/admin/materials` — إنشاء (يولّد `ark` تلقائيًا) `{...fields, peopleIds[], placeIds[], tagIds[], collectionIds[]}` → يعيد `{ark}`. يستدعي `rebuildSearchBlob`.
- `PUT /api/v1/admin/materials/:id` — تعديل + علاقات. `DELETE /api/v1/admin/materials/:id` — حذف (يسجل audit؛ ملفات R2 تُحذف أيضًا).
- `POST /api/v1/admin/materials/:id/publish` `{status: published|draft|hidden}`.
- `POST /api/v1/admin/materials/:id/files` — `multipart`: حقول `file` (+`kind`=original|attachment). يعيد صف الملف.
- `POST /api/v1/admin/materials/:id/versions` — `{fileId, versionType, processNote}` — تسجيل نسخة مشتقة (التحقق: `versionType != 'original'` أو الملف مرفوع كأصل).
- `DELETE /api/v1/admin/files/:id` — حذف ملف (+ من R2).
- `PUT /api/v1/admin/materials/:id/text` — `{transcriptionAuto?, transcriptionManual?, fullText?, translationText?, translationStatus?, translator?}` — يحدّث الطبقات والحالات. **يُرفض** `translationText` إن كانت الترجمة تُدار بالمقاطع (400).
- **مقاطع الترجمة:**
  - `GET /api/v1/admin/materials/:id/translation-segments` — `{translation, segments[]}` مرتبة.
  - `POST /api/v1/admin/materials/:id/translation-segments` — `{segments: [{source_text, machine_translation?, page_number?}], sourceLang?, translator?}` — إنشاء/استبدال ترجمة من مقاطع (≤2000).
  - `PATCH /api/v1/admin/translation-segments/:id` — `{reviewed_translation?, machine_translation?, page_number?, status?}` — تعديل مقطع؛ تُشتق حالة الترجمة الأم (`in_review`/`reviewed`) تلقائيًا — **ليس اعتمادًا**.
  - `POST /api/v1/admin/translations/:id/approve` — **اعتماد صريح فقط** (لا يحدث تلقائيًا أبدًا).
  - `DELETE /api/v1/admin/translations/:id` — حذف الترجمة ومقاطعها (CASCADE).
- **OCR (يدوي فقط — لا يعمل تلقائيًا عند الرفع):**
  - `POST /api/v1/admin/materials/:id/ocr` — `{fileId, language?}` — يشغّل `OCRProvider` المضبوط عبر `OCR_ENDPOINT`؛ الناتج يُحفظ في `transcriptions.raw_text` (طبقة `auto`)؛ يُنشئ سجل `processing_jobs`.
  - `GET /api/v1/admin/materials/:id/jobs` — سجل عمليات المعالجة.
- CRUD عام لجداول: `/api/v1/admin/people`, `/places`, `/sources`, `/tags`, `/collections`, `/glossary` — `GET` (قائمة) `POST` `PUT /:id` `DELETE /:id` (JSON).
- `POST /api/v1/admin/materials/:id/relations` `{relatedArk, relation, note}`.
- `GET /api/v1/admin/export` — تفريغ JSON كامل `{exported_at, tables: {...}}` للنسخ الاحتياطي.
- `GET /api/v1/admin/audit?page=` — سجل العمليات.
- كل عملية كتابة تُسجَّل في `audit_log`.

### views.js — فريق الواجهة العامة — `renderPublic(pathname, req, env): Promise<Response>`
- اللغة: `?lang=fr` أو كوكي `archifouna_lang` (الافتراضي `ar`). `<html lang dir>` حسبها.
- الصفحات: `/` `/archive` `/search` `/advanced-search` `/document/:ark` `/categories` `/places` `/place/:id` `/people` `/person/:id` `/sources` `/collections` `/collection/:id` `/about` `/methodology` — وصف كل صفحة في §7 من التصور.
- صفحة المادة: البيانات الكاملة، المعرض (نسخ الصور + مقارنة قبل/بعد + بيانات المعالجة الإلزامية)، التفريغ، الترجمة جنبًا إلى جنب مع شارة الحالة، المواد ذات الصلة، صندوق الاستشهاد + زر نسخ، روابط دائمة.
- كل صفحة: `<title>` و `meta description` و Open Graph للـ SEO. المواد غير المنشورة → 404.
- عدّاد المشاهدات: `views+1` عند عرض مادة منشورة.

### admin-views.js — فريق لوحة الإدارة — `renderAdmin(pathname, req, env, user): Promise<Response>`
- عربية فقط، RTL. مسارات: `/admin/login` (بدون جلسة) `/admin` `/admin/materials` `/admin/materials/new` `/admin/materials/:id` `/admin/people` `/admin/places` `/admin/sources` `/admin/tags` `/admin/collections` `/admin/glossary` `/admin/backup` `/admin/audit`.
- نموذج المادة: كل الحقول + رفع الملفات + مدير نسخ الصور (سؤال: أصلية أم مشتقة؟) + محرر التفريغ/الترجمة مع حالات سير العمل + منتقي علاقات (أشخاص/أماكن/وسوم/مجموعات) + حفظ مسودة/نشر.
- لوحة النسخ الاحتياطي: زر تنزيل التفريغ JSON + قائمة الملفات (manifest) + تعليمات `wrangler d1 export` ومزامنة R2.

### i18n.js — فريق الواجهة العامة
```js
export const SUPPORTED_LANGS = ['ar','fr'];
export const STR = { ar: {...}, fr: {...} };  // نفس المفاتيح تمامًا
export function t(lang, key, vars={})  // بديل: يُرجع key نفسه
export function htmlDir(lang)          // 'rtl' | 'ltr'
```
مفاتيح إلزامية (ar+fr): `site_name, tagline, tagline2, search_placeholder, nav_home, nav_archive, nav_search, nav_advanced, nav_categories, nav_places, nav_people, nav_sources, nav_collections, nav_about, nav_methodology, quick_access, latest_additions, explore_regions, featured_collections, type_document, type_book, type_manuscript, type_image, type_map, type_press, type_correspondence, type_excerpt, original, restored, enhanced, colorized, annotated, original_text, arabic_translation, translation_status_none, translation_status_machine, translation_status_in_review, translation_status_reviewed, translation_status_approved, download, view, copy_link, citation, related_materials, source_label, archive_ref_label, date_label, place_label, author_label, no_results, search_results, advanced_search_title, field_keyword, field_type, field_from_year, field_to_year, field_region, field_language, field_source, field_person, field_tag, search_button, disclaimer_restored, disclaimer_colorized, confidence_confirmed, confidence_approximate, confidence_probable, confidence_unknown, footer_about, all_rights`.

## 3) التصميم البصري (ملزم للواجهة العامة)
- هوية: وقار أكاديمي + بساطة + إحساس أرشيفي دون مبالغة «الورق القديم».
- الألوان: `--ink:#23272e` (حبر)، `--paper:#faf7f1` (عاجي)، `--gold:#a8842f` (ذهبي أرشيفي)، `--teal:#14655c` (تركواز عميق)، `--line:#e7dfcf`، `--muted:#6b6558`.
- الخطوط: العناوين `Amiri, serif` (Google Fonts مع fallback)، المتن `system-ui`.
- بطاقات المواد: مصغرة + عنوان + سنة + نوع + مكان + مصدر.
- مقارنة قبل/بعد: منزلق `<input type=range>` فوق صورتين متراكبتين (CSS `clip-path`) — التنفيذ في `public/app.js`.

## 4) الأمن (ملزم)
- كلمات المرور: PBKDF2 فقط. لا تُخزن أسرار في الكود؛ `ADMIN_PASSWORD_HASH` كـ secret.
- رفع الملفات: فحص الامتداد (`pdf,doc,docx,jpg,jpeg,png,webp,tiff,tif`) والحجم (100MB)؛ يُحفظ في R2 فقط؛ `Content-Type` صريح عند التقديم؛ لا تنفيذ.
- الجلسات: httpOnly + SameSite=Lax (+Secure للإنتاج)؛ انتهاء 12 ساعة.
- **CSRF:** رمز لكل جلسة (`sessions.csrf_token`)؛ كل `POST/PUT/PATCH/DELETE` على `/api/v1/admin/*`
  يتطلب هيدر `X-CSRF-Token` مطابقًا؛ الرفض `403` ويُسجَّل في `audit_log` كـ `admin.csrf_rejected`.
- **Rate Limiting** على مستوى الخادم (`src/lib/ratelimit.js` — نافذة منزلقة في الذاكرة؛
  موثّق قيد الـ isolates المتعددة): تسجيل الدخول 10/دقيقة، البحث 60/دقيقة، التنزيلات 60/دقيقة،
  `/admin/*` ‏300/دقيقة، مسارات OCR/المقاطع 30/دقيقة — الرد `429` مع `Retry-After`.
- كل كتابة إدارية في `audit_log` مع IP.

## 5) ملاحظات D1
- استخدم `env.DB.prepare(sql).bind(...).all()/first()/run()`.
- المعاملات: `env.DB.batch([...])` للكتابة الذرية (ark + material + fts).
- FTS5 متاح في D1 مع `unicode61`.
