#!/usr/bin/env node
// ============================================================
// SIDJIL — توليد هاش كلمة مرور المدير الأول
// الاستخدام: node scripts/hash-password.js <password>
// يطبع: pbkdf2$100000$<b64salt>$<b64hash>
// (نفس الصيغة التي ينتجها src/lib/auth.js عبر WebCrypto —
//  PBKDF2-HMAC-SHA256 بـ 100000 تكرار ومفتاح 32 بايت)
// ثم يُزرع الناتج كسرّ: wrangler secret put ADMIN_PASSWORD_HASH
// ============================================================

const crypto = require('node:crypto');

const plain = process.argv[2];
if (!plain) {
  console.error('الاستخدام: node scripts/hash-password.js <password>');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(plain, salt, 100000, 32, 'sha256');
console.log(`pbkdf2$100000$${salt.toString('base64')}$${hash.toString('base64')}`);
