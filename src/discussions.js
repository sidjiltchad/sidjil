// ============================================================
// SIDJIL — مجلس سِجِل: النقاشات العلمية
// - قراءة عامة: GET /api/v1/discussions , GET /api/v1/discussions/:id
// - تفاعلات الزوار (بلا حساب، بحدّ معدل IP): POST /api/v1/reactions
// - تسجيل الباحثين (توثيق لاحق من الإدارة): POST /api/v1/researcher/register
// - الكتابة للباحثين الموثّقين عبر /api/v1/admin/discussions (تُوصَّل من admin-api.js)
// ============================================================

import { getSessionUser, hashPassword } from './lib/auth.js';
import { check } from './lib/ratelimit.js';
import { audit } from './lib/db.js';

export const DISCUSSION_KINDS = ['comment', 'review', 'critique', 'idea', 'text'];
export const REACTION_KINDS = ['like', 'support', 'useful', 'oppose'];

// ---------- أدوات ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
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

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// بصمة IP للتفاعلات المجهولة (لمنع التكرار — ليست سرًا أمنيًا)
async function ipHash(ip) {
  const data = new TextEncoder().encode('sidjil-react|' + (ip || 'unknown'));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function authorName(u) {
  return (u && (u.display_name || u.username)) || 'باحث';
}

// يتطلب باحثًا موثّقًا (المدير يتجاوز التوثيق دائمًا)
export async function requireVerifiedResearcher(env, req) {
  const user = await getSessionUser(req, env);
  if (!user) return { error: err('سجّل الدخول أولًا', 401) };
  if (user.role !== 'admin' && user.role !== 'researcher') {
    return { error: err('غير مصرح', 403) };
  }
  if (user.role === 'researcher' && Number(user.is_verified) !== 1) {
    return { error: err('حسابك بانتظار التوثيق من الإدارة — لا يمكنك النشر بعد', 403) };
  }
  return { user };
}

// ---------- القراءة العامة ----------

const DISCUSSION_SELECT = `
  d.id, d.material_id, d.author_id, d.kind, d.title, d.body, d.quote_text, d.page_no,
  d.status, d.created_at, d.updated_at,
  COALESCE(u.display_name, u.username) AS author_name,
  u.is_verified AS author_verified,
  m.ark AS material_ark, m.title_ar AS material_title`;

async function reactionCounts(db, discussionId) {
  const rows = await db
    .prepare(
      `SELECT reply_id, kind, COUNT(*) AS c FROM discussion_reactions
       WHERE discussion_id = ? GROUP BY reply_id, kind`
    )
    .bind(discussionId)
    .all();
  const out = { discussion: {}, replies: {} };
  for (const r of rows.results) {
    const bucket = r.reply_id ? (out.replies[r.reply_id] ||= {}) : out.discussion;
    bucket[r.kind] = r.c;
  }
  return out;
}

export async function fetchDiscussions(db, { kind, materialId, page = 1, perPage = 15 } = {}) {
  page = Math.max(1, parseInt(page, 10) || 1);
  perPage = Math.min(50, Math.max(1, parseInt(perPage, 10) || 15));
  const where = [`d.status = 'published'`];
  const binds = [];
  if (kind && DISCUSSION_KINDS.includes(kind)) {
    where.push('d.kind = ?');
    binds.push(kind);
  }
  if (materialId && /^\d+$/.test(String(materialId))) {
    where.push('d.material_id = ?');
    binds.push(parseInt(materialId, 10));
  }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM discussions d ${whereSql}`)
    .bind(...binds)
    .first();
  const rows = await db
    .prepare(
      `SELECT ${DISCUSSION_SELECT},
        (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count,
        (SELECT COUNT(*) FROM discussion_reactions x WHERE x.discussion_id = d.id AND x.reply_id IS NULL) AS reactions_count
       FROM discussions d
       LEFT JOIN admin_users u ON u.id = d.author_id
       LEFT JOIN materials m ON m.id = d.material_id
       ${whereSql} ORDER BY d.id DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, perPage, (page - 1) * perPage)
    .all();
  return { items: rows.results, page, perPage, total: total.c, pages: Math.ceil(total.c / perPage) };
}

export async function apiDiscussionsList(env, url) {
  const sp = url.searchParams;
  const data = await fetchDiscussions(env.DB, {
    kind: sp.get('kind'),
    materialId: sp.get('material_id'),
    page: sp.get('page'),
    perPage: sp.get('perPage'),
  });
  return json(data);
}

export async function getDiscussionFull(db, id) {
  const d = await db
    .prepare(
      `SELECT ${DISCUSSION_SELECT} FROM discussions d
       LEFT JOIN admin_users u ON u.id = d.author_id
       LEFT JOIN materials m ON m.id = d.material_id
       WHERE d.id = ? AND d.status = 'published'`
    )
    .bind(id)
    .first();
  if (!d) return null;
  const replies = await db
    .prepare(
      `SELECT r.id, r.discussion_id, r.parent_id, r.author_id, r.body, r.created_at,
              COALESCE(u.display_name, u.username) AS author_name,
              u.is_verified AS author_verified
       FROM discussion_replies r
       LEFT JOIN admin_users u ON u.id = r.author_id
       WHERE r.discussion_id = ? AND r.status = 'published' ORDER BY r.id ASC`
    )
    .bind(id)
    .all();
  const counts = await reactionCounts(db, id);
  return { discussion: d, replies: replies.results, counts };
}

// تفاعلات الزائر الحالي (لإبراز أزراره) — مفتاح الفاعل: مستخدم أو بصمة IP
export async function viewerReactions(db, req, discussionId) {
  const user = await getSessionUser(req, { DB: db }).catch(() => null);
  const actorKey = user ? `u:${user.id}` : `ip:${await ipHash(clientIp(req))}`;
  const rows = await db
    .prepare('SELECT reply_id, kind FROM discussion_reactions WHERE discussion_id = ? AND actor_key = ?')
    .bind(discussionId, actorKey)
    .all();
  const mine = {};
  for (const r of rows.results) mine[r.reply_id || 0] = r.kind;
  return { mine, user };
}

export async function apiDiscussionGet(env, req, id) {
  const full = await getDiscussionFull(env.DB, id);
  if (!full) return err('النقاش غير موجود', 404);
  const { mine } = await viewerReactions(env.DB, req, id);
  return json({ ...full, mine });
}

// ---------- تفاعلات الزوار (بلا حساب) ----------

export async function apiReactionPost(env, req) {
  const ip = clientIp(req);
  // حدّ المعدل: 30 تفاعلًا/دقيقة لكل IP (التفاعل الواحد يُحدَّث لا يتكرر أصلًا)
  const rl = check(`react:${ip}`, 30, 60 * 1000);
  if (!rl.allowed) return err('طلبات كثيرة جدًا — حاول بعد قليل', 429);

  const body = await readJson(req);
  if (!body) return err('طلب غير صالح', 400);
  const discussionId = parseInt(body.discussion_id, 10);
  const replyId = body.reply_id ? parseInt(body.reply_id, 10) : null;
  const kind = String(body.kind || '');
  if (!discussionId || !REACTION_KINDS.includes(kind)) return err('بيانات غير صالحة', 400);

  const db = env.DB;
  const d = await db
    .prepare('SELECT id FROM discussions WHERE id = ? AND status = ?')
    .bind(discussionId, 'published')
    .first();
  if (!d) return err('النقاش غير موجود', 404);
  if (replyId) {
    const r = await db
      .prepare('SELECT id FROM discussion_replies WHERE id = ? AND discussion_id = ? AND status = ?')
      .bind(replyId, discussionId, 'published')
      .first();
    if (!r) return err('الرد غير موجود', 404);
  }

  const user = await getSessionUser(req, env).catch(() => null);
  const actorKey = user ? `u:${user.id}` : `ip:${await ipHash(ip)}`;
  await db
    .prepare(
      `INSERT INTO discussion_reactions (discussion_id, reply_id, user_id, ip_hash, actor_key, kind)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(discussion_id, COALESCE(reply_id, 0), actor_key)
       DO UPDATE SET kind = excluded.kind`
    )
    .bind(
      discussionId,
      replyId,
      user ? user.id : null,
      user ? null : await ipHash(ip),
      actorKey,
      kind
    )
    .run();
  const counts = await reactionCounts(db, discussionId);
  return json({ ok: true, kind, counts });
}

// ---------- تسجيل الباحثين (التوثيق لاحقًا من الإدارة) ----------

export async function apiResearcherRegister(env, req) {
  const ip = clientIp(req);
  const rl = check(`reg:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return err('طلبات كثيرة جدًا — حاول لاحقًا', 429);

  const body = await readJson(req);
  if (!body) return err('طلب غير صالح', 400);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const displayName = String(body.display_name || '').trim().slice(0, 80);
  const affiliation = String(body.affiliation || '').trim().slice(0, 160);
  const bio = String(body.bio || '').trim().slice(0, 500);

  if (username.length < 3) return err('اسم المستخدم 3 أحرف على الأقل', 400);
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) return err('اسم المستخدم: أحرف لاتينية وأرقام و _ . - فقط', 400);
  if (password.length < 8) return err('كلمة المرور 8 أحرف على الأقل', 400);
  if (!displayName) return err('الاسم الكريم مطلوب', 400);

  const db = env.DB;
  const exists = await db.prepare('SELECT id FROM admin_users WHERE username = ?').bind(username).first();
  if (exists) return err('اسم المستخدم موجود مسبقًا', 400);

  const password_hash = await hashPassword(password);
  const res = await db
    .prepare(
      `INSERT INTO admin_users (username, password_hash, role, is_active, is_verified, display_name, affiliation, bio)
       VALUES (?, ?, 'researcher', 1, 0, ?, ?, ?)`
    )
    .bind(username, password_hash, displayName, affiliation || null, bio || null)
    .run();
  await audit(db, {
    userId: null,
    action: 'researcher.register',
    target: username,
    detail: displayName,
    ip,
  });
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

// ---------- الكتابة: باحث موثّق (تُوصَّل من admin-api) ----------

export async function apiDiscussionCreate(env, req, user) {
  const body = await readJson(req);
  if (!body) return err('طلب غير صالح', 400);
  const kind = DISCUSSION_KINDS.includes(body.kind) ? body.kind : 'comment';
  const title = String(body.title || '').trim().slice(0, 200);
  const text = String(body.body || '').trim().slice(0, 20000);
  if (!title || !text) return err('العنوان والنص مطلوبان', 400);

  let materialId = null;
  if (body.material_id) {
    const m = await env.DB.prepare(
      "SELECT id FROM materials WHERE id = ? AND publish_status = 'published'"
    )
      .bind(parseInt(body.material_id, 10))
      .first();
    if (!m) return err('المادة غير موجودة أو غير منشورة', 400);
    materialId = m.id;
  }
  const res = await env.DB
    .prepare(
      `INSERT INTO discussions (material_id, author_id, kind, title, body, quote_text, page_no)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      materialId,
      user.id,
      kind,
      title,
      text,
      String(body.quote_text || '').trim().slice(0, 2000) || null,
      String(body.page_no || '').trim().slice(0, 20) || null
    )
    .run();
  await audit(env.DB, { userId: user.id, action: 'discussion.create', target: String(res.meta.last_row_id), ip: clientIp(req) });
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

export async function apiDiscussionUpdate(env, req, user, id) {
  const db = env.DB;
  const d = await db.prepare('SELECT * FROM discussions WHERE id = ?').bind(id).first();
  if (!d) return err('النقاش غير موجود', 404);
  const isAdmin = user.role === 'admin';
  if (!isAdmin && Number(d.author_id) !== Number(user.id)) return err('ليس من نقاشاتك', 403);
  const body = await readJson(req);
  if (!body) return err('طلب غير صالح', 400);

  // الإدارة فقط تخفي/تظهر
  if (body.status !== undefined) {
    if (!isAdmin) return err('غير مصرح', 403);
    if (!['published', 'hidden'].includes(body.status)) return err('حالة غير صالحة', 400);
    await db.prepare("UPDATE discussions SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(body.status, id).run();
    await audit(db, { userId: user.id, action: 'discussion.moderate', target: String(id), detail: body.status, ip: clientIp(req) });
    return json({ ok: true });
  }
  const title = String(body.title || '').trim().slice(0, 200);
  const text = String(body.body || '').trim().slice(0, 20000);
  if (!title || !text) return err('العنوان والنص مطلوبان', 400);
  await db.prepare(
    `UPDATE discussions SET title = ?, body = ?, quote_text = ?, page_no = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(title, text,
      String(body.quote_text || '').trim().slice(0, 2000) || null,
      String(body.page_no || '').trim().slice(0, 20) || null, id)
    .run();
  return json({ ok: true });
}

export async function apiDiscussionDelete(env, req, user, id) {
  const db = env.DB;
  const d = await db.prepare('SELECT author_id FROM discussions WHERE id = ?').bind(id).first();
  if (!d) return err('النقاش غير موجود', 404);
  if (user.role !== 'admin' && Number(d.author_id) !== Number(user.id)) return err('ليس من نقاشاتك', 403);
  await db.prepare('DELETE FROM discussions WHERE id = ?').bind(id).run();
  await audit(db, { userId: user.id, action: 'discussion.delete', target: String(id), ip: clientIp(req) });
  return json({ ok: true });
}

export async function apiReplyCreate(env, req, user, discussionId) {
  const db = env.DB;
  const d = await db.prepare("SELECT id FROM discussions WHERE id = ? AND status = 'published'").bind(discussionId).first();
  if (!d) return err('النقاش غير موجود', 404);
  const body = await readJson(req);
  if (!body) return err('طلب غير صالح', 400);
  const text = String(body.body || '').trim().slice(0, 10000);
  if (!text) return err('نص الرد مطلوب', 400);
  let parentId = null;
  if (body.parent_id) {
    const p = await db.prepare(
      'SELECT id FROM discussion_replies WHERE id = ? AND discussion_id = ? AND status = ?'
    ).bind(parseInt(body.parent_id, 10), discussionId, 'published').first();
    if (!p) return err('الرد الأب غير موجود', 400);
    parentId = p.id;
  }
  const res = await db.prepare(
    'INSERT INTO discussion_replies (discussion_id, parent_id, author_id, body) VALUES (?, ?, ?, ?)'
  ).bind(discussionId, parentId, user.id, text).run();
  await audit(db, { userId: user.id, action: 'discussion.reply', target: String(discussionId), ip: clientIp(req) });
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

export async function apiReplyDelete(env, req, user, discussionId, replyId) {
  const db = env.DB;
  const r = await db.prepare('SELECT author_id FROM discussion_replies WHERE id = ? AND discussion_id = ?')
    .bind(replyId, discussionId).first();
  if (!r) return err('الرد غير موجود', 404);
  if (user.role !== 'admin' && Number(r.author_id) !== Number(user.id)) return err('ليس من ردودك', 403);
  await db.prepare('DELETE FROM discussion_replies WHERE id = ?').bind(replyId).run();
  return json({ ok: true });
}

// توثيق باحث (الإدارة فقط)
export async function apiResearcherVerify(env, req, user, id, body) {
  const db = env.DB;
  const target = await db.prepare("SELECT id, username, role FROM admin_users WHERE id = ? AND role = 'researcher'").bind(id).first();
  if (!target) return err('الباحث غير موجود', 404);
  const verified = body && body.verified === false ? 0 : 1;
  await db.prepare('UPDATE admin_users SET is_verified = ? WHERE id = ?').bind(verified, id).run();
  await audit(db, { userId: user.id, action: verified ? 'researcher.verify' : 'researcher.unverify', target: target.username, ip: clientIp(req) });
  return json({ ok: true, verified: !!verified });
}

// ---------- الموجّه العام (GETs + تفاعلات + تسجيل) ----------

export async function routeDiscussionPublic(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.length > 1 && url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1) : url.pathname;

  if (req.method === 'GET' && path === '/api/v1/discussions') {
    return apiDiscussionsList(env, url);
  }
  let m = path.match(/^\/api\/v1\/discussions\/(\d+)$/);
  if (req.method === 'GET' && m) {
    return apiDiscussionGet(env, req, parseInt(m[1], 10));
  }
  if (req.method === 'POST' && path === '/api/v1/reactions') {
    return apiReactionPost(env, req);
  }
  if (req.method === 'POST' && path === '/api/v1/researcher/register') {
    return apiResearcherRegister(env, req);
  }
  return null;
}

// للعرض من جانب الخادم (صفحة المادة): أحدث النقاشات المرتبطة بمادة
export async function discussionsForMaterial(db, materialId, limit = 5) {
  const rows = await db.prepare(
    `SELECT d.id, d.kind, d.title, d.created_at,
            COALESCE(u.display_name, u.username) AS author_name,
            (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count,
            (SELECT COUNT(*) FROM discussion_reactions x WHERE x.discussion_id = d.id AND x.reply_id IS NULL) AS reactions_count
     FROM discussions d LEFT JOIN admin_users u ON u.id = d.author_id
     WHERE d.material_id = ? AND d.status = 'published'
     ORDER BY d.id DESC LIMIT ?`
  ).bind(materialId, limit).all();
  return rows.results;
}
