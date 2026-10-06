# SIDJIL Researcher Android — Phase 9 Release Readiness

التاريخ: 2026-10-06

## Baseline

- الفرع المشتق: `codex/capacitor-phase8-android-validation`
- فرع Phase 9: `codex/capacitor-phase9-release`
- نقطة البداية: `54f1912 feat(mobile): brand Android splash assets`
- Capacitor CLI/Core/Android: `8.5.2`
- Android Gradle Plugin: `8.13.0`
- Gradle wrapper: `8.14.3`
- `minSdk`: 24، `compileSdk`: 36، `targetSdk`: 36
- `versionName`: `1.0.0`، `versionCode`: `1`

قاعدة الإصدار التالية: `1.0.0 → 1.0.1` لإصلاحات متوافقة، و`1.1.0` لميزات متوافقة جديدة، مع زيادة `versionCode` في كل بناء قابل للتوزيع.

## الإنتاج والهوية

- `appId`/namespace/applicationId: `org.sidjil.researcher`
- الاسم: `SIDJIL — مساحة الباحث`
- عنوان API الأصلي داخل التطبيق: `https://app.sidjil.org`
- لا يحتوي resolver الإنتاج على localhost أو LAN أو debug proxy. `https://localhost` و`capacitor://localhost` يظهران فقط باعتبارهما Origin داخليًا لـCapacitor في CORS.
- `capacitor.config.ts` يحدد `androidScheme: https` وقائمة تنقل مسموحة لنطاقات Sidjil فقط.
- `wrangler.toml` يعلن `CAPACITOR_ORIGINS=https://localhost,capacitor://localhost`، ولا يستخدم `*` مع credentials.

## خريطة CORS الإنتاجية

كل صف أدناه يعيد `Access-Control-Allow-Origin` فقط إذا كان Origin مساويًا لـ`https://localhost` أو `capacitor://localhost`، مع `Access-Control-Allow-Credentials: true` وCSRF عند الحاجة:

| مجموعة المسارات | الاستخدام |
|---|---|
| `/api/v1/admin/*` | الجلسة، الدخول، الرفع، وواجهات الإدارة المستخدمة من التطبيق |
| `/researcher/feed` | موجز الباحث |
| `/researcher/search` | البحث |
| `/api/v1/materials/:id/details` | تفاصيل المادة والقارئ |
| `/api/v1/materials/:id/translations` | نظائر الترجمة |
| `/file/*` | ملفات PDF/Word والصور؛ تُكشف رؤوس التنزيل والمدى |
| `/researcher/profile/*` | الملفات الشخصية |
| `/researcher/avatar*` | صور الحسابات |

طلبات `OPTIONS` لهذه المسارات تُجاب قبل المصادقة. مسارات HTML العامة وواجهات اجتماعية غير لازمة للتطبيق لا تُفتح تلقائيًا.

## اعتماديات Capacitor

| الإضافة | الإصدار | الاستخدام | الأذونات/الأثر |
|---|---:|---|---|
| `@capacitor/core` | 8.5.2 | runtime | لا أذونات مباشرة |
| `@capacitor/android` | 8.5.2 | Android bridge | جزء من التطبيق |
| `@capacitor/app` | 8.1.2 | Back، lifecycle، exit | لا إذن إضافي |
| `@capacitor/filesystem` | 8.1.4 | DATA/CACHE للملفات | لا تخزين خارجي واسع |
| `@capacitor/share` | 8.0.3 | مشاركة/فتح `content://` | FileProvider محدود |
| `@capacitor/keyboard` | 8.0.6 | resize وإخفاء لوحة المفاتيح | لا إذن إضافي |
| `@capacitor/status-bar` | 8.0.4 | لون وشكل شريط النظام | لا إذن إضافي |
| `@capacitor/splash-screen` | 8.0.2 | splash آمن قصير | لا إذن إضافي |

لا توجد إضافات Push/Camera/Deep Links/Analytics في هذه المرحلة.

## Android hardening

- `usesCleartextTraffic=false` مع `network_security_config` يمنع HTTP غير المشفر.
- `server.allowNavigation` وقائمة التنقل في shell تمنع تحويل التطبيق إلى متصفح عام.
- `FileProvider` غير مُصدّر ويعرض `files-path` و`cache-path` للتطبيق فقط مع `grantUriPermissions` مؤقتة.
- `allowBackup=false` و`fullBackupContent=false` يمنعان نسخ جلسة التطبيق وملفاته المحلية تلقائيًا.
- النشاط الرئيسي هو المكوّن المُصدّر الوحيد لأنه Launcher وبـ`exported=true`، و`launchMode=singleTask`. الـProvider `exported=false`. لا توجد services أو receivers خاصة بالتطبيق؛ receiver الخاص بـProfile Installer تابع لـAndroidX.
- لا توجد صلاحيات تخزين عامة؛ الموجود فقط `INTERNET`.
- CSP في shell تقصر scripts/connect/img/font/worker على الذات ونطاقات Sidjil، مع `object-src 'none'` و`frame-src 'none'`.
- إصدار Release لا يفعّل WebView debugging، و`minifyEnabled=false` موثق لتجنب كسر PDF.js وplugins؛ يمكن تفعيل R8 في دورة منفصلة بعد اختبار شامل.

## الأصول

- شعار Sidjil يحل محل أيقونة Capacitor الافتراضية في mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi، مع adaptive icon وخلفية navy.
- Splash يدعم portrait/landscape، Android 12 system splash، ويخفي نفسه من shell سريعًا حتى لا يعلق عند فشل الشبكة.
- PDF.js: `pdf.min.mjs` و`pdf.worker.min.mjs` و`cmaps` و`standard_fonts` محلية داخل Release.
- Word: `docx-preview` و`JSZip` محليان؛ لا CDN.
- لا توجد source maps أو `sourceMappingURL` داخل `dist-capacitor`.

## الملفات الكبيرة والرفع

التنزيل الحالي يقرأ stream إلى chunks ثم يجمع `Uint8Array` ويحوّله إلى Base64 قبل Filesystem. لملف بحجم `N` بايت قد يصل الضغط التقريبي إلى `N` للـbytes + `1.33N` Base64 + نسخة string/bridge مؤقتة، أي نحو `2.5–3N` في الذروة. لذلك حد الهاتف المحافظ الحالي 120MB قد يعني 300–360MB RAM مؤقتة، وهو خطر على الأجهزة المتوسطة. لم يُعاد بناء المسار في Phase 9؛ يجب خفض الحد أو نقل التنزيل إلى streaming native في Phase 10 قبل التوزيع العام.

الرفع يبقى `File → FormData → XHR` ولا يحوّل الملف إلى Base64، وحد الخادم 100MB.

## التوقيع

لم يُنشأ keystore ولم يُحفظ أي سر في Git. إعداد Release يقرأ اختياريًا:

`SIDJIL_RELEASE_STORE_FILE`, `SIDJIL_RELEASE_STORE_PASSWORD`, `SIDJIL_RELEASE_KEY_ALIAS`, `SIDJIL_RELEASE_KEY_PASSWORD`

أو خصائص Gradle محلية بنفس الأسماء. عند غيابها ينتج البناء APK/AAB غير موقّع، ويجب عدم اعتباره صالحًا للمتجر. الأنماط `*.jks`, `*.keystore`, `*.aab`, `*.apk`, `android/app/build/` و`release-signing.properties` مستبعدة من Git.

## نتائج البناء

- APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- APK SHA-256: `8977FF0DC78E6076BA6803BC5E6AB503EA506B6EE8E33AE0FC76AA33C062F1B3`
- AAB SHA-256: `5A6CACE1F417E2317B14160823F208C57D47077B09DB6F10E09519D1086BAA42`
- APK size: 6,891,264 bytes
- AAB size: 6,701,439 bytes
- AAB/APK غير موقّعين بسبب عدم توفير أسرار إنتاجية، وهذا متوقع وآمن في بيئة Git.

## التدقيق والاختبارات

نجحت اختبارات Phase 1–8، و`test:mobile:release`، و`npm test`، و`npx cap doctor`، و`wrangler deploy --dry-run`، و`git diff --check`. نجح smoke الإنتاج بعد تشغيله خارج العزل: `searchTotal=26`, `levelTotal=47`, `researcherStatus=302`, `discussionsStatus=200`.

`npm audit` وجد 10 ثغرات: 5 moderate و5 high و0 critical، وكلها في أدوات البناء/التبعيات غير المباشرة (Wrangler 3.114.17 وسلسلة `undici`/`miniflare`/`sharp`/`ws`، وCLI/xcode/uuid). لا توجد ثغرة runtime مباشرة في اعتماديات التطبيق، ولم يُشغّل `npm audit fix --force`. `npm outdated` أظهر Wrangler 3.114.17 مقابل 4.147.0، وتم تركه دون ترقية قسرية لأنه تغيير رئيسي يحتاج دورة منفصلة.

## خريطة اعتماد Backend

| ميزة Android | تغيير Worker المطلوب قبل الإصدار |
|---|---|
| Login/session | `admin/session` و`admin/login` + CORS/CSRF |
| Feed | `/researcher/feed` + CORS |
| Search | `/researcher/search` + CORS |
| Profile | `/researcher/profile/*` + CORS |
| Material | `/api/v1/materials/:id/details` |
| Reader | `/file/:id`، headers وRange |
| Download/share | `Content-Disposition`, `Content-Length`, `Content-Range` |
| Upload | `/api/v1/admin/materials/:id/files`، CSRF، حد 100MB |

الـWorker الجديد متوافق رجعيًا مع الويب، لكنه لم يُنشر في Phase 9؛ يلزم نشره أولًا قبل اختبار تسجيل الدخول من APK النهائي.

## Data inventory وPlay readiness

التطبيق يتعامل مع: بيانات الحساب والجلسة Cookie، المواد المرفوعة، ملفات PDF/Word والصور المحفوظة في DATA/CACHE، طلبات الشبكة إلى `app.sidjil.org`، وCache مؤقت للملفات. لا يوجد Analytics أو Push في هذه المرحلة.

قبل Google Play يلزم تجهيز: الاسم والوصفين، أيقونة وFeature Graphic، لقطات الشاشة، رابط سياسة الخصوصية، Data Safety، تصنيف المحتوى والجمهور، بريد الدعم، وتعليمات وصول للمراجع مع حساب اختبار يُنشأ خارج Git. لا يوجد Listing ولا نشر من هذه المرحلة.

## Release checklist

| البند | النتيجة | الملاحظات |
|---|---|---|
| Production config | ناجح | API production، https، allowNavigation محدود |
| Release APK | ناجح مع تحذير | بُني unsigned |
| AAB | ناجح مع تحذير | بُني unsigned |
| Signing configuration | جاهز | أسرار خارج Git، keystore غير متوفر |
| Versioning | ناجح | 1.0.0 / 1 |
| App icon | ناجح | شعار Sidjil + adaptive densities |
| Splash | ناجح | branded، قصير، لا ينتظر الشبكة |
| Permissions | ناجح | INTERNET فقط، بلا تخزين واسع |
| Cleartext disabled | ناجح | manifest + network security config |
| WebView hardening | ناجح | CSP وallowNavigation وno debugging release |
| Secrets audit | ناجح | لا أسرار في source/dist/APK/AAB |
| PDF assets | ناجح | worker/cmaps/standard_fonts محلية |
| DOCX assets | ناجح | docx-preview وJSZip محليان |
| Native files | ناجح | FileProvider محدود، DATA/CACHE |
| Upload | ناجح تعاقديًا | FormData/XHR، 100MB |
| Dependency audit | تحذير | 5 high أدوات بناء، 5 moderate، لا critical |
| Backend compatibility | جاهز للنشر | CORS map مكتمل، Worker لم يُنشر |
| Web regression | ناجح | smoke الإنتاج وCI contract |
| Mobile regression | ناجح تعاقديًا | Phase 1–8 + release checks |
| Real-device validation | تحذير/مانع للإطلاق العام | المحاكي كان offline ولا يوجد هاتف حقيقي |

## دين التنفيذ قبل النشر

1. نشر تغييرات Worker المتوافقة رجعيًا.
2. اختبار الويب/PWA وCORS من originي Capacitor.
3. توفير keystore خارج Git وبناء APK/AAB موقّعين مع زيادة `versionCode`.
4. اختبار داخلي على هاتف حقيقي: login، cookie، feed، search، profile، PDF/DOCX، download/share/open، upload، rotation، resume، slow network، large files.
5. فتح Google Play internal track لاحقًا فقط بعد اجتياز الاختبارات.

## Commits

- `chore(android): finalize production configuration`
- `chore(android): configure release versioning`
- `chore(android): harden release manifest and webview`
- `chore(android): finalize launcher and splash assets`
- `test(mobile): add release readiness checks`
- `docs(release): add android release checklist`

هذه أسماء التغييرات المقترحة؛ سيُحفظ التنفيذ في commits فعلية منفصلة بعد مراجعة diff.
