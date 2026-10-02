# استقبال مواد سِجِل عبر Telegram

## ما يلزم مرة واحدة

1. أنشئ البوت من `@BotFather` واحتفظ بالرمز خارج المستودع.
2. أنشئ محادثة خاصة للإدارة، وأضف البوت إليها، ثم احصل على `TELEGRAM_ADMIN_CHAT_ID` وعلى أرقام حسابات المديرين في `TELEGRAM_ADMIN_USER_IDS`.
3. اختر قيمة عشوائية طويلة لكل من `TELEGRAM_WEBHOOK_SECRET` و`TELEGRAM_WEBHOOK_PATH`.
4. (اختياري) إذا كان حساب Cloudflare مفعّلًا فيه Queues، أنشئ الطوابير لتحويل تنزيل الملفات إلى معالجة خلفية مستقلة:

```powershell
npx wrangler queues create sidjil-telegram-ingest
npx wrangler queues create sidjil-telegram-ingest-dlq
```

بدون Queues يعمل Worker عبر `ctx.waitUntil` مباشرة، ويظل مسار الاستقبال والمراجعة نفسه. عند إضافة binding باسم `TELEGRAM_QUEUE` في بيئة لاحقة سيستخدمه الكود تلقائيًا.

5. اضبط الأسرار على Worker:

نفّذ الأوامر من مجلد المشروع حتى يقرأ Wrangler ملف `wrangler.toml`:

```powershell
Set-Location D:\sidjil-full-project
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_WEBHOOK_PATH
npx wrangler secret put TELEGRAM_ADMIN_CHAT_ID
npx wrangler secret put TELEGRAM_ADMIN_USER_IDS
```

وإذا بقيت في أي مجلد آخر، مرّر ملف الإعداد واسم Worker صراحة:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN --config D:\sidjil-full-project\wrangler.toml --name sidjil
```

كرّر الصيغة نفسها لبقية الأسرار. سيطلب كل أمر القيمة تفاعليًا؛ لا تضع رمز البوت داخل الأمر أو في Git.

لا تضع رمز البوت في `wrangler.toml` أو في Git أو في رسالة عامة.

## النشر والربط

```powershell
npm ci
npx wrangler d1 migrations apply SIDJIL --remote
npx wrangler deploy

$env:TELEGRAM_BOT_TOKEN = '…'
$env:TELEGRAM_WEBHOOK_SECRET = '…'
$env:TELEGRAM_WEBHOOK_PATH = '…'
$env:SITE_URL = 'https://sidjil.org'
node scripts/telegram-setup.mjs
```

بعدها يرسل المستخدم `/submit`، ثم يختار النوع ويدخل العنوان والملخص والتاريخ والمكان والمصدر والحقوق، ويرسل ملفًا أو عدة ملفات، ثم `/done`. تحفظ المادة كمسودة، وتُنزل الملفات إلى R2 من خلال طابور، ثم تصل بطاقة المراجعة إلى محادثة الإدارة. لا تُنشر المادة إلا بعد ضغط «اعتماد ونشر» من حساب إداري مسموح.

## التشغيل الآمن

- يتحقق Worker من مسار webhook ورأس `X-Telegram-Bot-Api-Secret-Token`.
- تُسجّل أرقام تحديث Telegram لمنع التنفيذ المكرر.
- تُحفظ الملفات في R2، بينما تحفظ D1 بيانات المصدر والبصمة والحالة.
- حجم الملف الواحد محدود بـ20MB بما يطابق حد تنزيل ملفات البوت من Telegram.
- زر «طلب تعديل» يعيد المادة لمسودة، ويمكن للمدير إرسال `/note رقم_الإرسال الملاحظة` لإضافة سبب محدد.
