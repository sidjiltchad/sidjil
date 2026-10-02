// ضبط Webhook وأوامر بوت سِجِل.
// الاستخدام: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... TELEGRAM_WEBHOOK_PATH=... node scripts/telegram-setup.mjs

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const path = process.env.TELEGRAM_WEBHOOK_PATH;
const site = (process.env.SITE_URL || 'https://sidjil.org').replace(/\/$/, '');
if (!token || !secret || !path) {
  console.error('يلزم TELEGRAM_BOT_TOKEN و TELEGRAM_WEBHOOK_SECRET و TELEGRAM_WEBHOOK_PATH');
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.description || `${method} failed`);
  return data.result;
}

const result = await call('setWebhook', {
  url: `${site}/api/v1/telegram/webhook/${encodeURIComponent(path)}`,
  secret_token: secret,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: false,
});
await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'بدء استخدام قناة سِجِل' },
    { command: 'submit', description: 'إيداع مادة جديدة للمراجعة' },
    { command: 'done', description: 'إنهاء إضافة الملفات' },
    { command: 'cancel', description: 'إلغاء الإيداع الحالي' },
  ],
  language_code: 'ar',
});
console.log(JSON.stringify({ ok: true, webhook: result, url: `${site}/api/v1/telegram/webhook/${path}` }, null, 2));
