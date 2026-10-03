// ============================================================
// SIDJIL — التجزئة والجلسات (WebCrypto PBKDF2)
// فريق الخلفية — exports ملزمة بموجب docs/API.md §2
// ============================================================

import { audit } from './db.js';

const SESSION_COOKIE = 'archifouna_admin';
const SESSION_TTL_SEC = 12 * 3600; // 12 ساعة

// ---------- base64 ----------

function b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomHex(nBytes) {
  const b = crypto.getRandomValues(new Uint8Array(nBytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ---------- كلمات المرور ----------

/**
 * تجزئة كلمة المرور — الصيغة: pbkdf2$100000$<b64salt>$<b64hash>
 * (متوافقة مع scripts/hash-password.js الذي يستخدم node:crypto)
 */
export async function hashPassword(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plain),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key,
    256
  );
  return `pbkdf2$100000$${b64encode(salt)}$${b64encode(new Uint8Array(bits))}`;
}

export async function verifyPassword(plain, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2' || parts[1] !== '100000') return false;
    const salt = b64decode(parts[2]);
    const expected = b64decode(parts[3]);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(plain),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
        key,
        expected.length * 8
      )
    );
    if (bits.length !== expected.length) return false;
    // مقارنة ثابتة الزمن
    let diff = 0;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

// ---------- تسجيل الدخول ----------

/**
 * login(env, username, password, ip)
 * - يتحقق من admin_users.
 * - إذا كان الجدول فارغًا وكان env.ADMIN_PASSWORD_HASH مضبوطًا وتحقق
 *   (واسم المستخدم يطابق env.ADMIN_USERNAME أو 'admin')، ينشئ صف
 *   المدير تلقائيًا ثم يكمل الدخول.
 * @returns {Promise<{ok:boolean, token?:string, error?:string}>}
 */
export async function login(env, username, password, ip) {
  username = String(username || '').trim();
  if (!username || !password) {
    return { ok: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' };
  }
  const db = env.DB;

  let user = await db
    .prepare('SELECT id, username, password_hash, role, is_active FROM admin_users WHERE username = ?')
    .bind(username)
    .first();

  // إنشاء المدير الأول تلقائيًا من السرّ المزروع
  if (!user) {
    const countRow = await db.prepare('SELECT COUNT(*) AS c FROM admin_users').first();
    const seedHash = env.ADMIN_PASSWORD_HASH;
    const seedUser = env.ADMIN_USERNAME || 'admin';
    if (countRow && countRow.c === 0 && seedHash && username === seedUser) {
      if (await verifyPassword(password, seedHash)) {
        const res = await db
          .prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)')
          .bind(username, seedHash)
          .run();
        user = { id: res.meta.last_row_id, username, password_hash: seedHash };
        await audit(db, {
          userId: user.id,
          action: 'admin.auto_created',
          target: username,
          detail: 'إنشاء حساب المدير الأول من ADMIN_PASSWORD_HASH',
          ip,
        });
      }
    }
  }

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await audit(db, {
      userId: user ? user.id : null,
      action: 'admin.login_failed',
      target: username,
      ip,
    });
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }

  // الحسابات الموقوفة لا تدخل
  if (Number(user.is_active) === 0) {
    await audit(db, { userId: user.id, action: 'admin.login_blocked', target: username, ip });
    return { ok: false, error: 'هذا الحساب موقوف — تواصل مع الإدارة' };
  }

  const token = randomHex(32);
  const csrfToken = randomHex(32); // رمز CSRF مستقل لكل جلسة
  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  await db
    .prepare('INSERT INTO sessions (token, user_id, expires_at, csrf_token) VALUES (?, ?, ?, ?)')
    .bind(token, user.id, expiresAt, csrfToken)
    .run();
  await audit(db, { userId: user.id, action: 'admin.login', target: username, ip });

  return { ok: true, token, csrfToken, role: user.role || 'admin', username: user.username };
}

/** قراءة المستخدم من كوكي archifouna_admin */
export async function getSessionUser(req, env) {
  try {
    const cookie = req.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)archifouna_admin=([^;]+)/);
    if (!m) return null;
    const token = m[1].trim();
    if (!token) return null;
    const user = await env.DB
      .prepare(
        `SELECT u.id, u.username, u.role, u.is_active, u.is_verified, u.display_name, u.avatar_url, u.avatar_r2_key,
                u.email, u.phone, u.affiliation, u.job_title, u.bio, u.specialty, u.website, u.is_public_profile,
                s.csrf_token AS csrfToken FROM admin_users u
         JOIN sessions s ON s.user_id = u.id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
      )
      .bind(token)
      .first();
    if (!user || Number(user.is_active) === 0) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * التحقق من رمز CSRF للطلبات المعدِّلة.
 * يقارن هيدر X-CSRF-Token برمز الجلسة (مقارنة ثابتة الزمن).
 */
export function verifyCsrf(user, req) {
  try {
    const given = String(req.headers.get('X-CSRF-Token') || '');
    const expected = String(user && user.csrfToken ? user.csrfToken : '');
    if (!given || !expected || given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

/** إنهاء الجلسة */
export async function logout(env, token) {
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

/**
 * setSessionCookie(token, reqUrl?)
 * + Secure إذا كان reqUrl يبدأ بـ https
 */
export function setSessionCookie(token, reqUrl = '') {
  let c = `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}`;
  if (String(reqUrl).startsWith('https')) c += '; Secure';
  return c;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

/** استخراج التوكن الخام من الكوكي (للاستخدام الداخلي) */
export function getSessionToken(req) {
  const cookie = req.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)archifouna_admin=([^;]+)/);
  return m ? m[1].trim() : null;
}
