// ============================================================
// SIDJIL — الشبكة الاجتماعية لمساحة الباحث
// - المتابعة: POST /api/v1/social/follow  {followed_id}
// - حالة المتابعة: GET /api/v1/social/follow-status?user_id=N
// - الخلاصة: GET /api/v1/social/feed
// - التنبيهات: GET /api/v1/social/notifications
// - تعليم مقروء: POST /api/v1/social/notifications/read  {id} أو {all:true}
// الكتابة للباحثين الموثّقين فقط.
// ============================================================

import { getSessionUser, verifyCsrf } from './lib/auth.js';
import { audit } from './lib/db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
const err = (message, status = 400) => json({ error: message }, status);

function clientIp(req) {
  return (
    req.headers.get('CF-Connecting-IP') ||
    (req.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    ''
  );
}

/** الباحث الموثّق فقط يكتب؛ المدير متجاوز دائمًا */
function requireVerified(user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  if (user.role === 'researcher' && Number(user.is_verified) !== 1) {
    return err('النشر والمتابعة متاحان بعد توثيق الحساب', 403);
  }
  return null;
}

/** إشعار داخلي — تُستدعى من وحدات أخرى (الردود، المتابعة) */
export async function notifyUser(db, userId, kind, title, body, link) {
  if (!userId) return;
  try {
    await db.prepare(
      'INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, kind, title, body || null, link || null).run();
  } catch { /* الإشعار تحسين — لا يفشل العملية */ }
}

async function apiFollowToggle(env, req, user) {
  const blocked = requireVerified(user);
  if (blocked) return blocked;
  let body = {};
  try { body = await req.json(); } catch { return err('طلب غير صالح', 400); }
  const followedId = parseInt(body.followed_id, 10);
  if (!followedId || followedId === Number(user.id)) return err('باحث غير صالح', 400);
  const db = env.DB;
  const target = await db.prepare(
    "SELECT id, display_name, username FROM admin_users WHERE id = ? AND role = 'researcher' AND is_active = 1"
  ).bind(followedId).first();
  if (!target) return err('الباحث غير موجود', 404);

  const existing = await db.prepare(
    'SELECT id FROM researcher_follows WHERE follower_id = ? AND followed_id = ?'
  ).bind(user.id, followedId).first();

  if (existing) {
    await db.prepare('DELETE FROM researcher_follows WHERE id = ?').bind(existing.id).run();
    await audit(db, { userId: user.id, action: 'social.unfollow', target: String(followedId), ip: clientIp(req) });
    return json({ ok: true, following: false });
  }
  await db.prepare(
    'INSERT INTO researcher_follows (follower_id, followed_id) VALUES (?, ?)'
  ).bind(user.id, followedId).run();
  const me = user.display_name || user.username || 'باحث';
  await notifyUser(db, followedId, 'follow', 'متابِع جديد',
    `${me} بدأ بمتابعتك في مساحة الباحث`, `/researcher/profile/${user.id}`);
  await audit(db, { userId: user.id, action: 'social.follow', target: String(followedId), ip: clientIp(req) });
  return json({ ok: true, following: true });
}

async function apiFollowStatus(env, req, user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  const url = new URL(req.url);
  const targetId = parseInt(url.searchParams.get('user_id') || '0', 10);
  if (!targetId) return err('باحث غير صالح', 400);
  const db = env.DB;
  const [row, counts] = await Promise.all([
    db.prepare('SELECT id FROM researcher_follows WHERE follower_id = ? AND followed_id = ?')
      .bind(user.id, targetId).first(),
    db.prepare(`SELECT
        (SELECT COUNT(*) FROM researcher_follows WHERE followed_id = ?) AS followers,
        (SELECT COUNT(*) FROM researcher_follows WHERE follower_id = ?) AS following`)
      .bind(targetId, targetId).first(),
  ]);
  return json({ following: !!row, followers: Number(counts?.followers || 0), followingCount: Number(counts?.following || 0) });
}

/** خلاصة المتابَعين: نقاشاتهم وموادهم الأخيرة */
async function apiFeed(env, req, user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  const db = env.DB;
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '30', 10) || 30, 60);
  const items = await db.prepare(
    `SELECT 'discussion' AS item_type, d.id AS item_id, d.title, d.kind AS sub_kind,
            substr(d.body, 1, 300) AS excerpt, d.created_at,
            u.id AS author_id, u.display_name AS author_name, u.avatar_url AS author_avatar,
            m.title AS material_title
     FROM discussions d
     JOIN admin_users u ON u.id = d.author_id
     LEFT JOIN materials m ON m.id = d.material_id
     WHERE d.status = 'published' AND d.author_id IN (SELECT followed_id FROM researcher_follows WHERE follower_id = ?)
     UNION ALL
     SELECT 'material' AS item_type, mat.id AS item_id, mat.title, mat.type AS sub_kind,
            substr(mat.description_ar || ' ' || mat.description_fr, 1, 300) AS excerpt, mat.created_at,
            u.id AS author_id, u.display_name AS author_name, u.avatar_url AS author_avatar,
            NULL AS material_title
     FROM materials mat
     JOIN admin_users u ON u.id = mat.created_by
     WHERE mat.publish_status = 'published'
       AND mat.created_by IN (SELECT followed_id FROM researcher_follows WHERE follower_id = ?)
     ORDER BY created_at DESC LIMIT ?`
  ).bind(user.id, user.id, limit).all();
  return json({ items: items.results || [] });
}

async function apiNotifications(env, req, user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  const db = env.DB;
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '30', 10) || 30, 60);
  const [rows, unread] = await Promise.all([
    db.prepare('SELECT id, kind, title, body, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?')
      .bind(user.id, limit).all(),
    db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
      .bind(user.id).first(),
  ]);
  return json({ items: rows.results || [], unread: Number(unread?.c || 0) });
}

async function apiNotificationsRead(env, req, user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  let body = {};
  try { body = await req.json(); } catch { return err('طلب غير صالح', 400); }
  const db = env.DB;
  if (body.all) {
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(user.id).run();
  } else {
    const id = parseInt(body.id, 10);
    if (!id) return err('تنبيه غير صالح', 400);
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  }
  return json({ ok: true });
}

export async function routeSocialApi(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const user = await getSessionUser(req, env);

  if (req.method === 'POST' && user && !verifyCsrf(user, req)) {
    return err('رمز CSRF غير صالح أو مفقود', 403);
  }

  if (req.method === 'POST' && path === '/api/v1/social/follow') return apiFollowToggle(env, req, user);
  if (req.method === 'GET' && path === '/api/v1/social/follow-status') return apiFollowStatus(env, req, user);
  if (req.method === 'GET' && path === '/api/v1/social/feed') return apiFeed(env, req, user);
  if (req.method === 'GET' && path === '/api/v1/social/notifications') return apiNotifications(env, req, user);
  if (req.method === 'POST' && path === '/api/v1/social/notifications/read') return apiNotificationsRead(env, req, user);
  return null;
}
