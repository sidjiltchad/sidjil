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
            m.title_ar AS material_title,
            (SELECT COUNT(*) FROM social_reactions sr WHERE sr.target_type = 'discussion' AND sr.target_id = d.id) AS reactions_count
     FROM discussions d
     JOIN admin_users u ON u.id = d.author_id
     LEFT JOIN materials m ON m.id = d.material_id
     WHERE d.status = 'published' AND d.author_id IN (SELECT followed_id FROM researcher_follows WHERE follower_id = ?)
       AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE b.blocker_id = ? AND b.blocked_id = d.author_id)
       AND NOT EXISTS (SELECT 1 FROM social_mutes mu WHERE mu.muter_id = ? AND mu.muted_id = d.author_id)
     UNION ALL
     SELECT 'material' AS item_type, mat.id AS item_id, mat.title_ar AS title, mat.type AS sub_kind,
            substr(COALESCE(mat.description, '') || ' ' || COALESCE(mat.summary, ''), 1, 300) AS excerpt, mat.created_at,
            u.id AS author_id, u.display_name AS author_name, u.avatar_url AS author_avatar,
            NULL AS material_title,
            (SELECT COUNT(*) FROM social_reactions sr WHERE sr.target_type = 'material' AND sr.target_id = mat.id) AS reactions_count
     FROM materials mat
     JOIN admin_users u ON u.id = mat.created_by
     WHERE mat.publish_status = 'published'
       AND mat.created_by IN (SELECT followed_id FROM researcher_follows WHERE follower_id = ?)
       AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE b.blocker_id = ? AND b.blocked_id = mat.created_by)
       AND NOT EXISTS (SELECT 1 FROM social_mutes mu WHERE mu.muter_id = ? AND mu.muted_id = mat.created_by)
     ORDER BY created_at DESC LIMIT ?`
  ).bind(user.id, user.id, user.id, user.id, user.id, user.id, limit).all();
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

const TARGET_TYPES = new Set(['material', 'discussion', 'reply']);
async function socialTarget(db, type, id) {
  if (!TARGET_TYPES.has(type) || !Number.isInteger(id) || id < 1) return null;
  if (type === 'material') return db.prepare("SELECT id, title_ar AS title FROM materials WHERE id = ? AND publish_status = 'published'").bind(id).first();
  if (type === 'discussion') return db.prepare("SELECT id, title FROM discussions WHERE id = ? AND status = 'published'").bind(id).first();
  return db.prepare("SELECT id, body AS title FROM discussion_replies WHERE id = ? AND status = 'published'").bind(id).first();
}

async function apiReaction(env, req, user) {
  const blocked = requireVerified(user); if (blocked) return blocked;
  let body = {}; try { body = await req.json(); } catch { return err('طلب غير صالح'); }
  const type = String(body.target_type || ''); const targetId = Number(body.target_id); const kind = ['like', 'support', 'useful', 'oppose'].includes(body.kind) ? body.kind : 'like';
  if (!await socialTarget(env.DB, type, targetId)) return err('المحتوى غير موجود', 404);
  const existing = await env.DB.prepare('SELECT id, kind FROM social_reactions WHERE actor_id = ? AND target_type = ? AND target_id = ?').bind(user.id, type, targetId).first();
  if (existing && existing.kind === kind) {
    await env.DB.prepare('DELETE FROM social_reactions WHERE id = ?').bind(existing.id).run();
    return json({ ok: true, active: false, kind, count: Number((await env.DB.prepare('SELECT COUNT(*) AS c FROM social_reactions WHERE target_type = ? AND target_id = ?').bind(type, targetId).first())?.c || 0) });
  }
  if (existing) await env.DB.prepare('UPDATE social_reactions SET kind = ?, created_at = datetime(\'now\') WHERE id = ?').bind(kind, existing.id).run();
  else await env.DB.prepare('INSERT INTO social_reactions (actor_id, target_type, target_id, kind) VALUES (?, ?, ?, ?)').bind(user.id, type, targetId, kind).run();
  await audit(env.DB, { userId: user.id, action: 'social.reaction', target: `${type}:${targetId}`, detail: kind, ip: clientIp(req) });
  return json({ ok: true, active: true, kind, count: Number((await env.DB.prepare('SELECT COUNT(*) AS c FROM social_reactions WHERE target_type = ? AND target_id = ?').bind(type, targetId).first())?.c || 0) });
}

async function apiReactionStatus(env, req, user) {
  const url = new URL(req.url); const type = String(url.searchParams.get('target_type') || ''); const targetId = Number(url.searchParams.get('target_id'));
  if (!await socialTarget(env.DB, type, targetId)) return err('المحتوى غير موجود', 404);
  const [counts, mine] = await Promise.all([
    env.DB.prepare('SELECT kind, COUNT(*) AS c FROM social_reactions WHERE target_type = ? AND target_id = ? GROUP BY kind').bind(type, targetId).all(),
    user ? env.DB.prepare('SELECT kind FROM social_reactions WHERE actor_id = ? AND target_type = ? AND target_id = ?').bind(user.id, type, targetId).first() : null,
  ]);
  return json({ counts: Object.fromEntries((counts.results || []).map(row => [row.kind, Number(row.c || 0)])), mine: mine?.kind || null });
}

async function apiBookmark(env, req, user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  let body = {}; try { body = await req.json(); } catch { return err('طلب غير صالح'); }
  const type = String(body.target_type || ''); const targetId = Number(body.target_id);
  if (!await socialTarget(env.DB, type, targetId)) return err('المحتوى غير موجود', 404);
  const existing = await env.DB.prepare('SELECT id FROM social_bookmarks WHERE user_id = ? AND target_type = ? AND target_id = ?').bind(user.id, type, targetId).first();
  if (existing) { await env.DB.prepare('DELETE FROM social_bookmarks WHERE id = ?').bind(existing.id).run(); return json({ ok: true, saved: false }); }
  await env.DB.prepare('INSERT INTO social_bookmarks (user_id, target_type, target_id) VALUES (?, ?, ?)').bind(user.id, type, targetId).run();
  return json({ ok: true, saved: true });
}

async function apiBookmarksList(env, req, user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit') || 30), 1), 100);
  const rows = await env.DB.prepare(`SELECT b.id, b.target_type, b.target_id, b.created_at,
      COALESCE(m.title_ar, d.title, substr(r.body, 1, 160)) AS title,
      COALESCE(m.description, d.body, r.body) AS excerpt,
      CASE WHEN m.id IS NOT NULL THEN 'material' WHEN d.id IS NOT NULL THEN 'discussion' ELSE 'reply' END AS resolved_type
    FROM social_bookmarks b
    LEFT JOIN materials m ON b.target_type = 'material' AND m.id = b.target_id AND m.publish_status = 'published'
    LEFT JOIN discussions d ON b.target_type = 'discussion' AND d.id = b.target_id AND d.status = 'published'
    LEFT JOIN discussion_replies r ON b.target_type = 'reply' AND r.id = b.target_id AND r.status = 'published'
    WHERE b.user_id = ? AND (m.id IS NOT NULL OR d.id IS NOT NULL OR r.id IS NOT NULL)
    ORDER BY b.created_at DESC, b.id DESC LIMIT ?`).bind(user.id, limit).all();
  return json({ items: rows.results || [] });
}

async function apiTagTarget(env, req, user) {
  const blocked = requireVerified(user); if (blocked) return blocked;
  let body = {}; try { body = await req.json(); } catch { return err('طلب غير صالح'); }
  const type = String(body.target_type || ''); const targetId = Number(body.target_id);
  if (!await socialTarget(env.DB, type, targetId)) return err('المحتوى غير موجود', 404);
  const rawTags = Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(/[\s,]+/);
  const tags = [...new Set(rawTags.map(t => String(t).replace(/^#/, '').trim()).filter(t => /^[\p{L}\p{N}_-]{1,40}$/u.test(t)).slice(0, 10))];
  for (const name of tags) {
    const normalized = name.normalize('NFKC').toLocaleLowerCase();
    await env.DB.prepare('INSERT OR IGNORE INTO social_tags (name, normalized_name, created_by) VALUES (?, ?, ?)').bind(name, normalized, user.id).run();
    const row = await env.DB.prepare('SELECT id FROM social_tags WHERE normalized_name = ?').bind(normalized).first();
    if (row) await env.DB.prepare('INSERT OR IGNORE INTO social_post_tags (tag_id, target_type, target_id) VALUES (?, ?, ?)').bind(row.id, type, targetId).run();
  }
  return json({ ok: true, tags });
}

async function apiRelation(env, req, user, relation) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  let body = {}; try { body = await req.json(); } catch { return err('طلب غير صالح'); }
  const targetId = Number(body.user_id);
  if (!targetId || targetId === Number(user.id)) return err('حساب غير صالح');
  const target = await env.DB.prepare("SELECT id FROM admin_users WHERE id = ? AND role = 'researcher' AND is_active = 1").bind(targetId).first();
  if (!target) return err('الباحث غير موجود', 404);
  const table = relation === 'block' ? 'social_blocks' : 'social_mutes';
  const left = relation === 'block' ? 'blocker_id' : 'muter_id'; const right = relation === 'block' ? 'blocked_id' : 'muted_id';
  const existing = await env.DB.prepare(`SELECT 1 AS present FROM ${table} WHERE ${left} = ? AND ${right} = ?`).bind(user.id, targetId).first();
  if (existing) { await env.DB.prepare(`DELETE FROM ${table} WHERE ${left} = ? AND ${right} = ?`).bind(user.id, targetId).run(); return json({ ok: true, active: false }); }
  await env.DB.prepare(`INSERT INTO ${table} (${left}, ${right}) VALUES (?, ?)`).bind(user.id, targetId).run();
  await audit(env.DB, { userId: user.id, action: `social.${relation}`, target: String(targetId), ip: clientIp(req) });
  return json({ ok: true, active: true });
}

async function apiReport(env, req, user) {
  if (!user) return err('سجّل الدخول أولًا', 401);
  let body = {}; try { body = await req.json(); } catch { return err('طلب غير صالح'); }
  const type = String(body.target_type || ''); const targetId = Number(body.target_id); const reason = String(body.reason || '').trim().slice(0, 80); const note = String(body.note || '').trim().slice(0, 1000) || null;
  if (!['material', 'discussion', 'reply', 'researcher'].includes(type) || !targetId || !reason) return err('بيانات البلاغ غير مكتملة');
  if (type !== 'researcher' && !await socialTarget(env.DB, type, targetId)) return err('المحتوى غير موجود', 404);
  try { await env.DB.prepare('INSERT INTO social_reports (reporter_id, target_type, target_id, reason, note) VALUES (?, ?, ?, ?, ?)').bind(user.id, type, targetId, reason, note).run(); } catch (e) { if (String(e.message || '').includes('UNIQUE')) return err('سبق أن أرسلت بلاغًا لهذا المحتوى', 409); throw e; }
  await notifyUser(env.DB, user.id, 'report_received', 'تم استلام البلاغ', 'ستراجعه الإدارة وتُحدّث حالته عند اتخاذ القرار.', '/researcher');
  await env.DB.prepare(`INSERT INTO notifications (user_id, kind, title, body, link)
    SELECT id, 'social_report', 'بلاغ اجتماعي جديد', ?, '/admin/social-reports'
    FROM admin_users WHERE role = 'admin' AND is_active = 1`).bind(`${type}:${targetId} · ${reason}`).run().catch(() => {});
  await audit(env.DB, { userId: user.id, action: 'social.report', target: `${type}:${targetId}`, detail: reason, ip: clientIp(req) });
  return json({ ok: true }, 201);
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
  if (req.method === 'POST' && path === '/api/v1/social/reaction') return apiReaction(env, req, user);
  if (req.method === 'GET' && path === '/api/v1/social/reactions') return apiReactionStatus(env, req, user);
  if (req.method === 'POST' && path === '/api/v1/social/bookmark') return apiBookmark(env, req, user);
  if (req.method === 'GET' && path === '/api/v1/social/bookmarks') return apiBookmarksList(env, req, user);
  if (req.method === 'POST' && path === '/api/v1/social/tags') return apiTagTarget(env, req, user);
  if (req.method === 'POST' && path === '/api/v1/social/block') return apiRelation(env, req, user, 'block');
  if (req.method === 'POST' && path === '/api/v1/social/mute') return apiRelation(env, req, user, 'mute');
  if (req.method === 'POST' && path === '/api/v1/social/report') return apiReport(env, req, user);
  return null;
}
