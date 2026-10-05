// ============================================================
// SIDJIL — JSON API للوحة الإدارة (يتطلب جلسة صالحة)
// فريق الخلفية — routeAdminApi(req, env): Promise<Response|null>
// ============================================================

import {
  TYPE_CODES,
  nextArk,
  touchMaterial,
  rebuildSearchBlob,
  audit,
} from './lib/db.js';
import {
  login,
  logout,
  hashPassword,
  verifyPassword,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  verifyCsrf,
} from './lib/auth.js';
import { getOCRProvider } from './lib/ocr.js';
import { putUpload, safeName } from './lib/r2files.js';
import {
  requireVerifiedResearcher,
  apiDiscussionCreate,
  apiDiscussionUpdate,
  apiDiscussionDelete,
  apiReplyCreate,
  apiReplyDelete,
  apiResearcherVerify,
} from './discussions.js';

// ---------- أدوات ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

const err = (message, status = 400) => json({ error: message }, status);

function normPath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

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

function pageParams(url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage'), 10) || 20));
  return { page, perPage, offset: (page - 1) * perPage };
}

const asInt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

async function findMaterial(db, idOrArk) {
  if (/^\d+$/.test(String(idOrArk))) {
    return db.prepare('SELECT * FROM materials WHERE id = ?').bind(parseInt(idOrArk, 10)).first();
  }
  return db.prepare('SELECT * FROM materials WHERE ark = ?').bind(idOrArk).first();
}

// ---------- صلاحيات الباحث ----------
function researcherAllowed(rest, method) {
  // A researcher may always revoke their own authenticated session.
  if (rest === 'logout' && method === 'POST') return true;
  if (rest === 'profile' && (method === 'GET' || method === 'PATCH')) return true;
  if (rest === 'profile/avatar' && (method === 'POST' || method === 'DELETE')) return true;
  if (rest === 'profile/password' && method === 'POST') return true;
  if (method === 'GET' && rest === 'materials') return true;      // تُفلتر لمواده داخل الدالة
  if (method === 'GET' && rest === 'collections') return true;    // لاختيار الأقسام في النموذج
  if (method === 'POST' && rest === 'materials') return true;     // إنشاء كمسودة حصرًا
  if (/^materials\/\d+$/.test(rest) && (method === 'PUT' || method === 'DELETE')) return true;
  if (/^materials\/\d+\/files$/.test(rest) && method === 'POST') return true;
  if (/^files\/\d+$/.test(rest) && method === 'DELETE') return true;
  if (/^materials\/\d+\/submit$/.test(rest) && method === 'POST') return true; // إرسال للمراجعة
  if (/^materials\/\d+\/edit-request$/.test(rest) && method === 'POST') return true;
  // مجلس سِجِل: الباحث (الموثّق — يُتحقق داخل الدالة) ينشر النقاشات والردود
  if (rest === 'discussions' && method === 'POST') return true;
  if (/^discussions\/\d+$/.test(rest) && (method === 'PUT' || method === 'DELETE')) return true;
  if (/^discussions\/\d+\/files$/.test(rest) && method === 'POST') return true;
  if (/^discussions\/\d+\/replies$/.test(rest) && method === 'POST') return true;
  if (/^discussions\/\d+\/replies\/\d+$/.test(rest) && method === 'DELETE') return true;
  return false;
}

// يتحقق أن المادة مسودة مملوكة للباحث (يُرجع المادة أو يرمي خطأ)
// بعد الإرسال للمراجعة تُقفل المادة أمام الباحث حتى يبتّ فيها المدير
async function requireOwnDraft(db, user, idOrArk) {
  const m = await findMaterial(db, idOrArk);
  if (!m) throw new Error('المادة غير موجودة');
  if (Number(m.created_by) !== Number(user.id)) throw new Error('هذه المادة ليست من منشوراتك');
  if (m.publish_status === 'in_review') throw new Error('المادة قيد المراجعة — لا يمكن تعديلها الآن');
  if (m.publish_status !== 'draft') throw new Error('لا يمكن تعديل مادة منشورة — تواصل مع الإدارة');
  return m;
}

async function requireOwnEditableMaterial(db, user, idOrArk) {
  const m = await findMaterial(db, idOrArk);
  if (!m) throw new Error('المادة غير موجودة');
  if (Number(m.created_by) !== Number(user.id)) throw new Error('هذه المادة ليست من منشوراتك');
  if (m.publish_status === 'draft') return m;
  if (m.publish_status === 'published') {
    const grant = await db.prepare(
      "SELECT id FROM material_edit_requests WHERE material_id = ? AND researcher_id = ? AND status = 'approved' LIMIT 1"
    ).bind(m.id, user.id).first();
    if (grant) return m;
  }
  if (m.publish_status === 'in_review') throw new Error('المادة قيد المراجعة — لا يمكن تعديلها الآن');
  throw new Error('لا يمكن تعديل المادة المنشورة قبل موافقة الإدارة على طلب التعديل');
}

async function admMaterialEditRequest(env, user, req, id) {
  const db = env.DB;
  const material = await findMaterial(db, id);
  if (!material || Number(material.created_by) !== Number(user.id)) return err('المادة غير موجودة أو ليست من منشوراتك', 404);
  if (material.publish_status !== 'published') return err('يمكن طلب تعديل المواد المنشورة فقط', 400);
  const existing = await db.prepare(
    "SELECT status FROM material_edit_requests WHERE material_id = ? AND researcher_id = ? ORDER BY id DESC LIMIT 1"
  ).bind(material.id, user.id).first();
  if (existing?.status === 'pending') return json({ ok: true, status: 'pending' });
  if (existing?.status === 'approved') return json({ ok: true, status: 'approved' });
  await db.prepare(
    "INSERT INTO material_edit_requests (material_id, researcher_id, status) VALUES (?, ?, 'pending')"
  ).bind(material.id, user.id).run();
  await audit(db, { userId: user.id, action: 'material.edit_request', target: material.ark, ip: clientIp(req) });
  return json({ ok: true, status: 'pending' }, 201);
}

async function admMaterialEditRequestsList(env, user) {
  if (user.role !== 'admin') return err('صلاحية الإدارة مطلوبة', 403);
  const result = await env.DB.prepare(
    `SELECT r.id, r.material_id, r.requested_at, m.ark, m.title_ar, m.title_orig,
            COALESCE(u.display_name, u.username, 'باحث') AS researcher_name
     FROM material_edit_requests r
     JOIN materials m ON m.id = r.material_id
     JOIN admin_users u ON u.id = r.researcher_id
     WHERE r.status = 'pending' AND m.publish_status = 'published'
     ORDER BY r.requested_at ASC, r.id ASC`
  ).all();
  return json({ items: result.results || [] });
}

async function admMaterialEditRequestReview(env, user, req, id, body) {
  if (user.role !== 'admin') return err('صلاحية الإدارة مطلوبة', 403);
  const db = env.DB;
  const decision = body.decision;
  if (!['approve', 'reject'].includes(decision)) return err('قرار غير صالح', 400);
  const request = await db.prepare(
    "SELECT r.id, r.material_id, m.ark FROM material_edit_requests r JOIN materials m ON m.id = r.material_id WHERE r.id = ? AND r.status = 'pending' AND m.publish_status = 'published'"
  ).bind(id).first();
  if (!request) return err('طلب التعديل غير موجود أو سبق البت فيه', 404);
  const note = String(body.note || '').trim().slice(0, 1000) || null;
  await db.prepare(
    "UPDATE material_edit_requests SET status = ?, note = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?"
  ).bind(decision === 'approve' ? 'approved' : 'rejected', note, user.id, id).run();
  await audit(db, { userId: user.id, action: `material.edit_request_${decision}`, target: request.ark, detail: note || '', ip: clientIp(req) });
  return json({ ok: true, status: decision === 'approve' ? 'approved' : 'rejected' });
}

// ---------- الموجّه ----------


// ---------- مسرد المصطلحات ----------
async function admGlossaryList(env, url) {
  const rows = await env.DB.prepare(
    'SELECT id, source_lang, target_lang, source_term, target_term, notes, created_at FROM glossary ORDER BY source_lang, target_lang, source_term LIMIT 1000'
  ).all();
  return json({ items: rows.results || [] });
}
async function admGlossaryAdd(env, user, req, body) {
  const sl = String(body.source_lang || '').trim().slice(0, 8);
  const tl = String(body.target_lang || '').trim().slice(0, 8);
  const st = String(body.source_term || '').trim().slice(0, 200);
  const tt = String(body.target_term || '').trim().slice(0, 200);
  const notes = String(body.notes || '').trim().slice(0, 500) || null;
  if (!sl || !tl || !st || !tt) return err('كل الحقول مطلوبة');
  if (sl === tl) return err('لغتا المصدر والهدف مختلفتان');
  try {
    const r = await env.DB.prepare(
      'INSERT INTO glossary (source_lang, target_lang, source_term, target_term, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(sl, tl, st, tt, notes, user.id).run();
    await audit(env.DB, { userId: user.id, action: 'glossary.add', target: `${sl}>${tl}:${st}`, ip: clientIp(req) });
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) return err('المصطلح موجود مسبقًا لهذا الزوج اللغوي', 409);
    throw e;
  }
}
async function admGlossaryDelete(env, user, req, id) {
  await env.DB.prepare('DELETE FROM glossary WHERE id = ?').bind(id).run();
  await audit(env.DB, { userId: user.id, action: 'glossary.delete', target: String(id), ip: clientIp(req) });
  return json({ ok: true });
}

export async function routeAdminApi(req, env) {
  const url = new URL(req.url);
  const path = normPath(url.pathname);
  if (!path.startsWith('/api/v1/admin/')) return null;
  const rest = path.slice('/api/v1/admin/'.length);
  const method = req.method;

  // تسجيل الدخول — بدون جلسة
  if (rest === 'login' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return err('طلب غير صالح', 400);
    const r = await login(env, body.username, body.password, clientIp(req));
    if (!r.ok) return err(r.error, 401);
    const user = await env.DB
      .prepare('SELECT id, username, role FROM admin_users WHERE username = ?')
      .bind(String(body.username).trim())
      .first();
    return json(
      { ok: true, user, csrfToken: r.csrfToken },
      200,
      { 'Set-Cookie': setSessionCookie(r.token, req.url) }
    );
  }

  // باقي المسارات تتطلب جلسة صالحة
  const user = await getSessionUser(req, env);
  if (!user) return err('غير مصرح', 401);

  // CSRF: كل طلب معدِّل (POST/PUT/PATCH/DELETE) يتطلب هيدر X-CSRF-Token
  // مطابقًا لرمز الجلسة — المصادقة هنا كوكيز جلسات (ليست Cloudflare Access)
  // إذن CSRF قابل للتطبيق فعلًا.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !verifyCsrf(user, req)) {
    await audit(env.DB, { userId: user.id, action: 'admin.csrf_rejected', target: rest, ip: clientIp(req) });
    return err('رمز CSRF غير صالح أو مفقود', 403);
  }

  // صلاحيات الباحث: قائمة بيضاء صارمة — كل ما عداها للإدارة فقط
  // (النشر المباشر، المراجعة، المستخدمون، الإعلانات، الكيانات، النسخ… للإدارة)
  const isAdmin = user.role === 'admin';
  if (!isAdmin && !researcherAllowed(rest, method)) {
    await audit(env.DB, { userId: user.id, action: 'admin.forbidden', target: `${method} ${rest}`, ip: clientIp(req) });
    return err('غير مصرح — هذه العملية من صلاحيات الإدارة فقط', 403);
  }

  if (rest === 'logout' && method === 'POST') {
    await logout(env, user.sessionToken);
    await audit(env.DB, { userId: user.id, action: 'admin.logout', ip: clientIp(req) });
    // امسح نسختي الكوكي: نطاق النطاق (.sidjil.org) والنسخة host-only — أيهما وُجد
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
    headers.append('Set-Cookie', clearSessionCookie(req.url));
    headers.append('Set-Cookie', clearSessionCookie(''));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  // حساب الباحث: البيانات الشخصية والصورة (لا يغيّر اسم المستخدم هنا)
  if (rest === 'profile' && method === 'GET') {
    const { csrfToken, sessionToken, ...safeProfile } = user;
    return json({ profile: safeProfile });
  }
  if (rest === 'profile' && method === 'PATCH')
    return withJsonBody(req, (body) => admProfileUpdate(env, user, req, body));
  if (rest === 'profile/password' && method === 'POST')
    return withJsonBody(req, (body) => admProfilePasswordUpdate(env, user, req, body));
  if (rest === 'profile/avatar' && method === 'POST') return admProfileAvatarUpload(env, user, req);
  if (rest === 'profile/avatar' && method === 'DELETE') return admProfileAvatarDelete(env, user, req);

  // المواد
  if (rest === 'materials' && method === 'GET') return admMaterialsList(env, url, user);
  if (rest === 'materials' && method === 'POST')
    return withJsonBody(req, (body) => admMaterialCreate(env, user, req, body));

  if (rest === 'materials/edit-requests' && method === 'GET') return admMaterialEditRequestsList(env, user);
  let editRequestMatch = rest.match(/^materials\/(\d+)\/edit-request\/review$/);
  if (editRequestMatch && method === 'POST')
    return withJsonBody(req, (body) => admMaterialEditRequestReview(env, user, req, parseInt(editRequestMatch[1], 10), body));
  editRequestMatch = rest.match(/^materials\/(\d+)\/edit-request$/);
  if (editRequestMatch && method === 'POST') {
    if (isAdmin) return err('مسار طلب التعديل مخصص للباحث', 400);
    return admMaterialEditRequest(env, user, req, parseInt(editRequestMatch[1], 10));
  }

  let m = rest.match(/^materials\/([^/]+)\/publish$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admMaterialPublish(env, user, req, m[1], body));

  // إرسال المادة للمراجعة (باحث: مسودته → قيد المراجعة)
  m = rest.match(/^materials\/(\d+)\/submit$/);
  if (m && method === 'POST') return admMaterialSubmit(env, user, req, parseInt(m[1], 10));

  // قرار المراجعة (إدارة فقط — محمي بالقائمة البيضاء أعلاه)
  m = rest.match(/^materials\/(\d+)\/review$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admMaterialReview(env, user, req, parseInt(m[1], 10), body));

  // إدارة المستخدمين (إدارة فقط)
  if (rest === 'users' && method === 'GET') return admUsersList(env);
  if (rest === 'users' && method === 'POST')
    return withJsonBody(req, (body) => admUserCreate(env, user, req, body));
  m = rest.match(/^users\/(\d+)$/);
  if (m && method === 'PATCH')
    return withJsonBody(req, (body) => admUserUpdate(env, user, req, parseInt(m[1], 10), body));

  // توثيق باحث (إدارة فقط)
  m = rest.match(/^researchers\/(\d+)\/verify$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => apiResearcherVerify(env, req, user, parseInt(m[1], 10), body));

  // مجلس سِجِل: النقاشات (الباحث الموثّق — يُتحقق داخل كل دالة)
  if (rest === 'discussions' && method === 'POST') {
    const v = await requireVerifiedResearcher(env, req);
    if (v.error) return v.error;
    return apiDiscussionCreate(env, req, v.user);
  }
  m = rest.match(/^discussions\/(\d+)\/files$/);
  if (m && method === 'POST') {
    const v = await requireVerifiedResearcher(env, req);
    if (v.error) return v.error;
    return admDiscussionImageUpload(env, req, v.user, parseInt(m[1], 10));
  }
  m = rest.match(/^discussions\/(\d+)$/);
  if (m && (method === 'PUT' || method === 'DELETE')) {
    const v = await requireVerifiedResearcher(env, req);
    if (v.error) return v.error;
    const id = parseInt(m[1], 10);
    if (method === 'PUT') return apiDiscussionUpdate(env, req, v.user, id);
    return apiDiscussionDelete(env, req, v.user, id);
  }
  m = rest.match(/^discussions\/(\d+)\/replies$/);
  if (m && method === 'POST') {
    const v = await requireVerifiedResearcher(env, req);
    if (v.error) return v.error;
    return apiReplyCreate(env, req, v.user, parseInt(m[1], 10));
  }
  m = rest.match(/^discussions\/(\d+)\/replies\/(\d+)$/);
  if (m && method === 'DELETE') {
    const v = await requireVerifiedResearcher(env, req);
    if (v.error) return v.error;
    return apiReplyDelete(env, req, v.user, parseInt(m[1], 10), parseInt(m[2], 10));
  }

  m = rest.match(/^materials\/([^/]+)\/files$/);
  if (m && method === 'POST') return admMaterialUpload(env, user, req, m[1]);

  m = rest.match(/^materials\/([^/]+)\/versions$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admVersionCreate(env, user, req, m[1], body));

  m = rest.match(/^materials\/([^/]+)\/text$/);
  if (m && method === 'PUT')
    return withJsonBody(req, (body) => admMaterialText(env, user, req, m[1], body));

  m = rest.match(/^materials\/([^/]+)\/relations$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admRelationCreate(env, user, req, m[1], body));

  // مسرد المصطلحات (مرجع لغوي للمترجمين)
  if (rest === 'glossary' && method === 'GET') return admGlossaryList(env, url);
  if (rest === 'glossary' && method === 'POST')
    return withJsonBody(req, (body) => admGlossaryAdd(env, user, req, body));
  m = rest.match(/^glossary\/(\d+)$/);
  if (m && method === 'DELETE') return admGlossaryDelete(env, user, req, parseInt(m[1], 10));

  // ---------- قسم الترجمة الجديد: نظائر Word ----------
  if (rest === '_classify-langs' && method === 'GET') return admClassifyLangs(env, user, req); // مؤقتة — تُحذف بعد التشغيل
  if (rest === 'translations/overview' && method === 'GET') return admTranslationOverview(env, url);
  if (rest === 'translations/upload' && method === 'POST') return admTranslationUpload(env, user, req);
  m = rest.match(/^translations\/files\/(\d+)\/lang$/);
  if (m && method === 'PATCH')
    return withJsonBody(req, (body) => admTranslationFileLang(env, user, req, parseInt(m[1], 10), body));
  m = rest.match(/^translations\/(\d+)$/);
  if (m && method === 'DELETE') return admTranslationDelete(env, user, req, parseInt(m[1], 10));
  if (rest === 'translations/requests' && method === 'GET') return admTranslationRequests(env, url);
  m = rest.match(/^translations\/requests\/(\d+)$/);
  if (m && method === 'PATCH')
    return withJsonBody(req, (body) => admTranslationRequestUpdate(env, user, req, parseInt(m[1], 10), body));

  // OCR اليدوي (لا يعمل تلقائيًا عند الرفع — تكلفة)
  m = rest.match(/^materials\/([^/]+)\/ocr$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admMaterialOcr(env, user, req, m[1], body));

  m = rest.match(/^materials\/([^/]+)\/jobs$/);
  if (m && method === 'GET') return admJobsList(env, m[1]);

  m = rest.match(/^materials\/([^/]+)$/);
  if (m && method === 'PUT')
    return withJsonBody(req, (body) => admMaterialUpdate(env, user, req, m[1], body));
  if (m && method === 'DELETE') return admMaterialDelete(env, user, req, m[1]);

  // ملفات ونسخ
  m = rest.match(/^files\/(\d+)$/);
  if (m && method === 'DELETE') return admFileDelete(env, user, req, parseInt(m[1], 10));

  m = rest.match(/^versions\/(\d+)$/);
  if (m && method === 'DELETE') return admVersionDelete(env, user, req, parseInt(m[1], 10));

  // النسخ الاحتياطي والسجل
  if (rest === 'export' && method === 'GET') return admExport(env, user, req);
  if (rest === 'audit' && method === 'GET') return admAuditList(env, url);

  // الكيانات: people/places/sources/tags/collections/glossary
  m = rest.match(/^(people|places|sources|tags|collections|glossary|announcements)$/);
  if (m && method === 'GET') return admEntityList(env, url, m[1]);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admEntityCreate(env, user, req, m[1], body));

  m = rest.match(/^(people|places|sources|tags|collections|glossary|announcements)\/(\d+)$/);
  if (m && method === 'PUT')
    return withJsonBody(req, (body) => admEntityUpdate(env, user, req, m[1], parseInt(m[2], 10), body));
  if (m && method === 'DELETE') return admEntityDelete(env, user, req, m[1], parseInt(m[2], 10));

  return err('غير موجود', 404);
}

async function withJsonBody(req, fn) {
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return err('طلب غير صالح (JSON)', 400);
  try {
    return await fn(body);
  } catch (e) {
    return err(e.message || 'خطأ غير متوقع', 400);
  }
}

// ---------- المواد: قائمة ----------

async function admMaterialsList(env, url, user) {
  const sp = url.searchParams;
  const { page, perPage, offset } = pageParams(url);
  const where = [];
  const binds = [];
  const status = sp.get('status');
  const type = sp.get('type');
  const q = (sp.get('q') || '').trim();
  if (status) {
    where.push('m.publish_status = ?');
    binds.push(status);
  }
  if (type) {
    where.push('m.type = ?');
    binds.push(type);
  }
  if (q) {
    where.push('(m.title_ar LIKE ? OR m.title_orig LIKE ? OR m.ark LIKE ? OR m.archive_ref LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }
  // الباحث يرى مواده فقط
  if (user && user.role !== 'admin') {
    where.push('m.created_by = ?');
    binds.push(user.id);
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const fromSql = 'FROM materials m LEFT JOIN admin_users u ON u.id = m.created_by';
  const [itemsRes, countRow] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.year, m.date_text, m.language,
              m.publish_status, m.review_note, m.transcription_status,
              m.updated_at, u.username AS creator
       ${fromSql}${whereSql} ORDER BY m.updated_at DESC, m.id DESC LIMIT ? OFFSET ?`
    )
      .bind(...binds, perPage, offset)
      .all(),
    env.DB.prepare(`SELECT COUNT(*) AS c ${fromSql}${whereSql}`).bind(...binds).first(),
  ]);
  return json({ items: itemsRes.results, total: countRow.c, page, perPage });
}

// ---------- المواد: إنشاء ----------

const MATERIAL_FIELDS = [
  'type',
  'title_ar',
  'title_orig',
  'description',
  'language',
  'year',
  'date_text',
  'date_confidence',
  'author',
  'photographer',
  'place_id',
  'place_confidence',
  'source_id',
  'archive_ref',
  'source_url',
  'rights',
  'full_text',
  'transcription_status',
  'publish_status',
];

const PUBLISH_STATUSES = ['draft', 'in_review', 'published', 'hidden'];
const DATE_CONFIDENCES = ['confirmed', 'approximate', 'probable', 'unknown'];
const TRANSCRIPTION_STATUSES = ['none', 'auto', 'corrected'];

function pickMaterialFields(body) {
  const f = {};
  for (const k of MATERIAL_FIELDS) {
    if (body[k] !== undefined) f[k] = body[k] === '' ? null : body[k];
  }
  if (f.year !== undefined) f.year = asInt(f.year);
  if (f.place_id !== undefined) f.place_id = asInt(f.place_id);
  if (f.source_id !== undefined) f.source_id = asInt(f.source_id);
  return f;
}

function validateMaterialFields(f, isCreate) {
  if (isCreate || f.type !== undefined) {
    if (!f.type || !TYPE_CODES[f.type]) throw new Error('نوع المادة غير صالح');
  }
  if (isCreate && (!f.title_ar || !String(f.title_ar).trim())) {
    throw new Error('العنوان بالعربية مطلوب');
  }
  if (f.publish_status !== undefined && f.publish_status !== null && !PUBLISH_STATUSES.includes(f.publish_status))
    throw new Error('حالة النشر غير صالحة');
  if (f.date_confidence && !DATE_CONFIDENCES.includes(f.date_confidence))
    throw new Error('مستوى ثقة التاريخ غير صالح');
  if (f.place_confidence && !DATE_CONFIDENCES.includes(f.place_confidence))
    throw new Error('مستوى ثقة المكان غير صالح');
  if (f.transcription_status && !TRANSCRIPTION_STATUSES.includes(f.transcription_status))
    throw new Error('حالة التفريغ غير صالحة');
}

async function replaceLinks(db, materialId, body) {
  const links = [
    ['material_people', 'person_id', body.peopleIds],
    ['material_places', 'place_id', body.placeIds],
    ['material_tags', 'tag_id', body.tagIds],
  ];
  const stmts = [];
  for (const [table, col, ids] of links) {
    if (ids === undefined) continue;
    stmts.push(db.prepare(`DELETE FROM ${table} WHERE material_id = ?`).bind(materialId));
    for (const raw of Array.isArray(ids) ? ids : []) {
      const id = asInt(raw);
      if (id) stmts.push(db.prepare(`INSERT OR IGNORE INTO ${table} (material_id, ${col}) VALUES (?, ?)`).bind(materialId, id));
    }
  }
  if (body.collectionIds !== undefined) {
    stmts.push(db.prepare('DELETE FROM material_collections WHERE material_id = ?').bind(materialId));
    let order = 0;
    for (const raw of Array.isArray(body.collectionIds) ? body.collectionIds : []) {
      const id = asInt(raw);
      if (id)
        stmts.push(
          db.prepare('INSERT OR IGNORE INTO material_collections (material_id, collection_id, sort_order) VALUES (?, ?, ?)').bind(materialId, id, order++)
        );
    }
  }
  if (stmts.length) await db.batch(stmts);
}

async function admMaterialCreate(env, user, req, body) {
  const f = pickMaterialFields(body);
  // الباحث: إنشاء كمسودة حصرًا — لا يملك تعيين حالة النشر ولا المالك
  if (user.role !== 'admin') {
    f.publish_status = 'draft';
  }
  validateMaterialFields(f, true);
  const db = env.DB;

  const ark = await nextArk(db, f.type); // ذري عبر batch
  const cols = ['ark', 'created_by', ...Object.keys(f)];
  const vals = [ark, user.id, ...Object.values(f)];
  const res = await db
    .prepare(`INSERT INTO materials (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...vals)
    .run();
  const materialId = res.meta.last_row_id;

  await replaceLinks(db, materialId, body);
  await rebuildSearchBlob(db, materialId);
  await audit(db, {
    userId: user.id,
    action: 'material.create',
    target: ark,
    detail: f.title_ar,
    ip: clientIp(req),
  });
  return json({ ok: true, ark, id: materialId }, 201);
}

// ---------- المواد: تعديل ----------

async function admMaterialUpdate(env, user, req, idOrArk, body) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  // الباحث: المسودات أو المواد المنشورة التي وافقت الإدارة على طلب تعديلها
  if (user.role !== 'admin') {
    try {
      await requireOwnEditableMaterial(db, user, m.id);
    } catch (e) {
      return err(e.message, 403);
    }
    delete body.publish_status;
  }
  const f = pickMaterialFields(body);
  delete f.ark; // الرقم الأرشيفي ثابت لا يتغير
  validateMaterialFields(f, false);

  const keys = Object.keys(f);
  if (keys.length) {
    await db
      .prepare(
        `UPDATE materials SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
      )
      .bind(...keys.map((k) => f[k]), m.id)
      .run();
  }
  await replaceLinks(db, m.id, body);
  await touchMaterial(db, m.id);
  await rebuildSearchBlob(db, m.id);
  await audit(db, {
    userId: user.id,
    action: 'material.update',
    target: m.ark,
    detail: keys.join(', '),
    ip: clientIp(req),
  });
  return json({ ok: true, ark: m.ark });
}

// ---------- المواد: حذف (مع مفاتيح R2) ----------

async function admMaterialDelete(env, user, req, idOrArk) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  // الباحث: حذف مواده غير المنشورة فقط
  if (user.role !== 'admin') {
    try {
      await requireOwnDraft(db, user, m.id);
    } catch (e) {
      return err(e.message, 403);
    }
  }

  const files = await db.prepare('SELECT r2_key FROM files WHERE material_id = ?').bind(m.id).all();
  // حذف الملفات من R2 أولًا (الأصل لا يُستبدل — الحذف هنا نهائي بطلب المدير)
  await Promise.all(
    files.results.map((f) => env.FILES.delete(f.r2_key).catch(() => {}))
  );

  await db.batch([
    db.prepare('DELETE FROM material_relations WHERE material_a = ? OR material_b = ?').bind(m.id, m.id),
    db.prepare('DELETE FROM material_people WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM material_places WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM material_tags WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM material_collections WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM image_versions WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM transcriptions WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM file_translations WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM translation_requests WHERE material_id = ?').bind(m.id),
    db.prepare('DELETE FROM files WHERE material_id = ?').bind(m.id),
    db.prepare('UPDATE collections SET cover_material_id = NULL WHERE cover_material_id = ?').bind(m.id),
    db.prepare('DELETE FROM materials_fts WHERE ark = ?').bind(m.ark),
    db.prepare('DELETE FROM materials WHERE id = ?').bind(m.id),
  ]);

  await audit(db, {
    userId: user.id,
    action: 'material.delete',
    target: m.ark,
    detail: `${m.title_ar} — حُذفت ${files.results.length} ملفات من R2`,
    ip: clientIp(req),
  });
  return json({ ok: true });
}

// ---------- المواد: نشر ----------

async function admMaterialPublish(env, user, req, idOrArk, body) {
  // دفاع إضافي: النشر المباشر للإدارة فقط (القائمة البيضاء تمنعه أصلًا)
  if (user.role !== 'admin') return err('النشر المباشر من صلاحيات الإدارة فقط', 403);
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const status = body.status;
  if (!PUBLISH_STATUSES.includes(status)) return err('حالة النشر غير صالحة', 400);
  await db
    .prepare("UPDATE materials SET publish_status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, m.id)
    .run();
  await audit(db, {
    userId: user.id,
    action: 'material.publish',
    target: m.ark,
    detail: `→ ${status}`,
    ip: clientIp(req),
  });
  return json({ ok: true, status });
}

// ---------- المواد: إرسال للمراجعة (باحث) ----------

async function admMaterialSubmit(env, user, req, id) {
  const db = env.DB;
  const m = await findMaterial(db, id);
  if (!m) return err('المادة غير موجودة', 404);
  // الباحث يرسل مسودته فقط؛ الإدارة لا تحتاج هذا المسار
  if (user.role !== 'admin') {
    if (Number(m.created_by) !== Number(user.id)) return err('هذه المادة ليست من منشوراتك', 403);
  }
  if (m.publish_status !== 'draft') return err('يمكن إرسال المسودات فقط للمراجعة', 400);
  if (m.type !== 'article') {
    const files = await db.prepare('SELECT kind, mime, filename FROM files WHERE material_id = ?').bind(m.id).all();
    const rows = files.results || [];
    const hasCover = rows.some(f => f.kind === 'cover' && /^image\//i.test(f.mime || ''));
    if (!hasCover) return err('أضف صورة الغلاف قبل الإرسال للمراجعة', 400);
    const hasContent = rows.some(f => f.kind === 'attachment' && (
      /^image\//i.test(f.mime || '') || f.mime === 'application/pdf' || /\.pdf$/i.test(f.filename || '')
    ));
    if (!hasContent) return err('أضف صور المحتوى أو ملف PDF قبل الإرسال للمراجعة', 400);
  }
  await db
    .prepare("UPDATE materials SET publish_status = 'in_review', review_note = NULL, updated_at = datetime('now') WHERE id = ?")
    .bind(m.id)
    .run();
  await audit(db, { userId: user.id, action: 'material.submit', target: m.ark, ip: clientIp(req) });
  return json({ ok: true, status: 'in_review' });
}

// ---------- المواد: قرار المراجعة (إدارة فقط) ----------

async function admMaterialReview(env, user, req, id, body) {
  const db = env.DB;
  const m = await findMaterial(db, id);
  if (!m) return err('المادة غير موجودة', 404);
  if (m.publish_status !== 'in_review') return err('المادة ليست قيد المراجعة', 400);
  const decision = body.decision;
  const note = String(body.note || '').trim();
  if (decision === 'approve') {
    await db
      .prepare("UPDATE materials SET publish_status = 'published', review_note = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(m.id)
      .run();
    await rebuildSearchBlob(db, m.id);
    await audit(db, { userId: user.id, action: 'material.review_approve', target: m.ark, ip: clientIp(req) });
    return json({ ok: true, status: 'published' });
  }
  if (decision === 'reject') {
    if (!note) return err('ملاحظة المراجعة مطلوبة عند إعادة المادة', 400);
    await db
      .prepare('UPDATE materials SET publish_status = ?, review_note = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind('draft', note.slice(0, 2000), m.id)
      .run();
    await audit(db, { userId: user.id, action: 'material.review_reject', target: m.ark, detail: note.slice(0, 200), ip: clientIp(req) });
    return json({ ok: true, status: 'draft' });
  }
  return err('قرار غير صالح (approve/reject)', 400);
}

// ---------- حساب الباحث ----------

function profileText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

async function admProfileUpdate(env, user, req, body) {
  const db = env.DB;
  const displayName = profileText(body.display_name, 80);
  const email = profileText(body.email, 160).toLowerCase();
  const phone = profileText(body.phone, 40);
  const affiliation = profileText(body.affiliation, 160);
  const jobTitle = profileText(body.job_title, 160);
  const bio = profileText(body.bio, 1000);
  const specialty = profileText(body.specialty, 160);
  const website = profileText(body.website, 300);

  if (!displayName) return err('الاسم الظاهر مطلوب', 400);
  if (!email) return err('البريد الإلكتروني مطلوب', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('أدخل بريدًا إلكترونيًا صحيحًا', 400);
  if (!phone || phone.replace(/[\s()+\-]/g, '').length < 6) return err('رقم الهاتف مطلوب وصالح', 400);
  if (!jobTitle) return err('الصفة أو المسمى الوظيفي مطلوب', 400);
  if (!bio) return err('النبذة التعريفية مطلوبة', 400);
  if (website && !/^https?:\/\/\S+$/i.test(website)) return err('رابط فيسبوك يجب أن يبدأ بـ https:// أو http://', 400);

  const emailExists = await db
    .prepare('SELECT id FROM admin_users WHERE lower(email) = ? AND id <> ?')
    .bind(email, user.id)
    .first();
  if (emailExists) return err('البريد الإلكتروني مستخدم مسبقًا', 400);

  await db.prepare(
    `UPDATE admin_users SET display_name = ?, email = ?, phone = ?, affiliation = ?,
      job_title = ?, bio = ?, specialty = ?, website = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(displayName, email, phone, affiliation || null, jobTitle, bio, specialty || null, website || null, user.id).run();
  await audit(db, { userId: user.id, action: 'researcher.profile_update', target: user.username, detail: 'تحديث بيانات الحساب', ip: clientIp(req) });
  return json({ ok: true });
}

async function admProfilePasswordUpdate(env, user, req, body) {
  const currentPassword = String(body.current_password || '');
  const newPassword = String(body.new_password || '');
  const confirmPassword = String(body.confirm_password || '');
  if (!currentPassword || !newPassword || !confirmPassword) return err('جميع حقول كلمة المرور مطلوبة', 400);
  if (newPassword.length < 8) return err('كلمة المرور الجديدة 8 أحرف على الأقل', 400);
  if (newPassword !== confirmPassword) return err('كلمتا المرور الجديدتان غير متطابقتين', 400);
  if (newPassword === currentPassword) return err('اختر كلمة مرور جديدة مختلفة', 400);

  const account = await env.DB.prepare('SELECT username, password_hash FROM admin_users WHERE id = ?').bind(user.id).first();
  if (!account || !(await verifyPassword(currentPassword, account.password_hash))) {
    await audit(env.DB, { userId: user.id, action: 'account.password_change_failed', target: user.username, detail: 'كلمة المرور الحالية غير صحيحة', ip: clientIp(req) });
    return err('كلمة المرور الحالية غير صحيحة', 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await env.DB.prepare(
    `UPDATE admin_users SET password_hash = ?, password_changed_at = datetime('now'),
      must_change_password = 0, updated_at = datetime('now') WHERE id = ?`
  ).bind(passwordHash, user.id).run();

  // Keep the current session usable while invalidating every other device.
  const currentToken = user.sessionToken;
  if (currentToken) {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').bind(user.id, currentToken).run();
  } else {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  }
  await audit(env.DB, { userId: user.id, action: 'account.password_changed', target: user.username, detail: 'تغيير كلمة المرور وإبطال الجلسات الأخرى', ip: clientIp(req) });
  return json({ ok: true, sessionsRevoked: true });
}

function avatarExtension(file) {
  const mime = String(file?.type || '').toLowerCase();
  const byMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  return byMime[mime] || '';
}

async function admProfileAvatarUpload(env, user, req) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('avatar');
  if (!file || typeof file.arrayBuffer !== 'function') return err('اختر صورة صالحة', 400);
  if ((file.size || 0) > 5 * 1024 * 1024) return err('حجم الصورة يتجاوز 5 ميغابايت', 400);
  const ext = avatarExtension(file);
  if (!ext) return err('الصورة يجب أن تكون JPG أو PNG أو WEBP أو GIF', 400);
  const key = `avatars/users/${user.id}/${crypto.randomUUID()}.${ext}`;
  const oldKey = user.avatar_r2_key || '';
  await env.FILES.put(key, file, { httpMetadata: { contentType: file.type } });
  await env.DB.prepare(
    "UPDATE admin_users SET avatar_r2_key = ?, avatar_url = '/researcher/avatar', updated_at = datetime('now') WHERE id = ?"
  ).bind(key, user.id).run();
  if (oldKey && oldKey !== key) await env.FILES.delete(oldKey).catch(() => {});
  await audit(env.DB, { userId: user.id, action: 'researcher.avatar_update', target: user.username, detail: 'رفع صورة الملف الشخصي', ip: clientIp(req) });
  return json({ ok: true, url: '/researcher/avatar' });
}

async function admProfileAvatarDelete(env, user, req) {
  const key = user.avatar_r2_key || '';
  if (key) await env.FILES.delete(key).catch(() => {});
  await env.DB.prepare("UPDATE admin_users SET avatar_r2_key = NULL, avatar_url = NULL, updated_at = datetime('now') WHERE id = ?").bind(user.id).run();
  await audit(env.DB, { userId: user.id, action: 'researcher.avatar_delete', target: user.username, detail: 'حذف صورة الملف الشخصي', ip: clientIp(req) });
  return json({ ok: true });
}

// ---------- المستخدمون (إدارة فقط) ----------

async function admUsersList(env) {
  const res = await env.DB.prepare(
    `SELECT u.id, u.username, u.role, u.is_active, u.is_verified, u.verification_type, u.display_name, u.affiliation,
            u.created_at,
            (SELECT COUNT(*) FROM materials m WHERE m.created_by = u.id) AS materials_count
     FROM admin_users u ORDER BY u.id ASC`
  ).all();
  return json({ items: res.results });
}

async function admUserCreate(env, user, req, body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'researcher';
  if (!username || username.length < 3) return err('اسم المستخدم 3 أحرف على الأقل', 400);
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) return err('اسم المستخدم: أحرف لاتينية وأرقام و _ . - فقط', 400);
  if (password.length < 8) return err('كلمة المرور 8 أحرف على الأقل', 400);
  const exists = await env.DB.prepare('SELECT id FROM admin_users WHERE username = ?').bind(username).first();
  if (exists) return err('اسم المستخدم موجود مسبقًا', 400);
  const password_hash = await hashPassword(password);
  const res = await env.DB.prepare(
    'INSERT INTO admin_users (username, password_hash, role, is_active) VALUES (?, ?, ?, 1)'
  ).bind(username, password_hash, role).run();
  await audit(env.DB, { userId: user.id, action: 'user.create', target: username, detail: `role=${role}`, ip: clientIp(req) });
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function admUserUpdate(env, user, req, id, body) {
  const db = env.DB;
  const target = await db.prepare('SELECT id, username, role FROM admin_users WHERE id = ?').bind(id).first();
  if (!target) return err('المستخدم غير موجود', 404);
  const sets = [];
  const binds = [];
  // لا يمكن للمدير إيقاف نفسه أو تغيير دوره
  const selfEdit = Number(id) === Number(user.id);
  if (body.role !== undefined) {
    const role = body.role === 'admin' ? 'admin' : 'researcher';
    if (selfEdit && role !== 'admin') return err('لا يمكنك تغيير دور حسابك', 400);
    sets.push('role = ?');
    binds.push(role);
  }
  if (body.is_active !== undefined) {
    const active = body.is_active ? 1 : 0;
    if (selfEdit && !active) return err('لا يمكنك إيقاف حسابك', 400);
    sets.push('is_active = ?');
    binds.push(active);
    if (!active) {
      // إبطال جلسات المستخدم الموقوف فورًا
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    }
  }
  if (body.password !== undefined && body.password !== '') {
    if (String(body.password).length < 8) return err('كلمة المرور 8 أحرف على الأقل', 400);
    sets.push('password_hash = ?');
    binds.push(await hashPassword(String(body.password)));
  }
  if (!sets.length) return err('لا تغييرات', 400);
  await db.prepare(`UPDATE admin_users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  await audit(db, { userId: user.id, action: 'user.update', target: target.username, detail: sets.join(', '), ip: clientIp(req) });
  return json({ ok: true });
}

// ---------- المواد: رفع ملف ----------

async function admMaterialUpload(env, user, req, idOrArk) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  // الباحث: الرفع لمسوداته أو لمادته المنشورة بعد موافقة الإدارة على تعديلها
  if (user.role !== 'admin') {
    try {
      await requireOwnEditableMaterial(db, user, m.id);
    } catch (e) {
      return err(e.message, 403);
    }
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return err('نموذج الرفع غير صالح', 400);
  }
  const file = form.get('file');
  const requestedKind = String(form.get('kind') || 'original');
  let kind = requestedKind;
  if (user.role !== 'admin') {
    const isImage = /^image\/(jpeg|png|webp|tiff|gif|heic)$/i.test(file?.type || '');
    const isPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
    const isArticleFile = m.type === 'article' && /\.(pdf|docx?)$/i.test(file?.name || '');
    if (requestedKind === 'cover') {
      if (m.type === 'article') return err('مقالات المجلة لا تحتاج إلى صورة غلاف هنا', 400);
      if (!isImage) return err('الغلاف يجب أن يكون صورة', 400);
      const existing = await db.prepare("SELECT id FROM files WHERE material_id = ? AND kind = 'cover' LIMIT 1").bind(m.id).first();
      if (existing) return err('للمادة صورة غلاف واحدة فقط؛ احذف الغلاف الحالي أولًا لاستبداله', 400);
      kind = 'cover';
    } else if (requestedKind === 'content-image') {
      if (m.type === 'article') return err('يمكن إرفاق ملف PDF أو Word واحد بمقال المجلة', 400);
      if (!isImage) return err('اختر صورة بصيغة مدعومة', 400);
      const existing = await db.prepare('SELECT kind, mime, filename FROM files WHERE material_id = ? AND kind = \'attachment\'').bind(m.id).all();
      const rows = existing.results || [];
      if (m.type !== 'article' && rows.some(f => f.mime === 'application/pdf' || /\.pdf$/i.test(f.filename || ''))) return err('اختر صور المحتوى أو PDF، ولا يمكن الجمع بينهما', 400);
      if (rows.filter(f => /^image\//i.test(f.mime || '')).length >= 20) return err('الحد الأقصى 20 صورة للمادة', 400);
      kind = 'attachment';
    } else if (requestedKind === 'content-file') {
      if (!(isPdf || isArticleFile)) return err(m.type === 'article' ? 'ملف المقال يجب أن يكون PDF أو Word' : 'ملف المحتوى يجب أن يكون PDF', 400);
      const existing = await db.prepare('SELECT mime, filename FROM files WHERE material_id = ? AND kind = \'attachment\'').bind(m.id).all();
      const rows = existing.results || [];
      if (rows.some(f => f.mime === 'application/pdf' || /\.pdf$/i.test(f.filename || '') || /\.(docx?)$/i.test(f.filename || ''))) return err('يمكن إضافة ملف محتوى واحد فقط؛ احذف الملف الحالي أولًا', 400);
      if (m.type !== 'article' && rows.some(f => /^image\//i.test(f.mime || ''))) return err('اختر صور المحتوى أو PDF، ولا يمكن الجمع بينهما', 400);
      kind = 'attachment';
    } else {
      return err('استخدم قسم الغلاف أو المحتوى لإضافة الملفات', 400);
    }
  } else if (!['original', 'attachment', 'cover'].includes(requestedKind)) {
    return err('نوع الملف (kind) غير صالح', 400);
  }

  let row;
  try {
    row = await putUpload(env, { materialId: m.id, ark: m.ark, type: m.type }, file, kind);
  } catch (e) {
    return err(e.message || 'فشل الرفع', 400);
  }

  // صورة أصلية → تسجيلها تلقائيًا كنسخة original في image_versions
  if (m.type === 'image' && kind === 'original') {
    await db
      .prepare(
        'INSERT INTO image_versions (material_id, version_type, file_id, process_note) VALUES (?, ?, ?, ?)'
      )
      .bind(m.id, 'original', row.id, 'النسخة الأصلية كما وردت من المصدر')
      .run();
  }

  await touchMaterial(db, m.id);
  await audit(db, {
    userId: user.id,
    action: 'file.upload',
    target: m.ark,
    detail: `${row.filename} (${row.size} بايت، ${kind})`,
    ip: clientIp(req),
  });
  return json(row, 201);
}

async function admDiscussionImageUpload(env, req, user, discussionId) {
  const discussion = await env.DB.prepare('SELECT author_id, status FROM discussions WHERE id = ?').bind(discussionId).first();
  if (!discussion) return err('المنشور غير موجود', 404);
  if (user.role !== 'admin' && Number(discussion.author_id) !== Number(user.id)) return err('ليس هذا منشورك', 403);
  if (discussion.status !== 'published') return err('لا يمكن إرفاق الصور بمنشور مخفي', 400);
  let form;
  try { form = await req.formData(); } catch { return err('نموذج الرفع غير صالح', 400); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return err('اختر صورة أولًا', 400);
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  const accepted = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic' };
  if (!accepted[ext] || (file.type && file.type !== accepted[ext])) return err('الصيغ المدعومة: JPEG وPNG وWebP وGIF وTIFF وHEIC', 400);
  if (file.size > 20 * 1024 * 1024) return err('حجم الصورة يتجاوز 20 ميغابايت', 400);
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM discussion_files WHERE discussion_id = ?').bind(discussionId).first();
  if (Number(count?.c || 0) >= 10) return err('الحد الأقصى 10 صور للمنشور', 400);
  const filename = safeName(file.name || 'image');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = `discussions/${discussionId}/${hash}-${filename}`;
  await env.FILES.put(key, file, { httpMetadata: { contentType: accepted[ext] } });
  try {
    const result = await env.DB.prepare(
      'INSERT INTO discussion_files (discussion_id, filename, mime, size, r2_key) VALUES (?, ?, ?, ?, ?)'
    ).bind(discussionId, filename, accepted[ext], file.size, key).run();
    return json({ id: result.meta.last_row_id, filename }, 201);
  } catch (error) {
    await env.FILES.delete(key).catch(() => {});
    throw error;
  }
}

// ---------- نسخ الصور: تسجيل مشتق ----------

const VERSION_TYPES = ['original', 'restored', 'enhanced', 'colorized', 'annotated', 'cropped'];

async function admVersionCreate(env, user, req, idOrArk, body) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const fileId = asInt(body.fileId);
  const versionType = body.versionType;
  if (!fileId) return err('fileId مطلوب', 400);
  if (!VERSION_TYPES.includes(versionType)) return err('نوع النسخة غير صالح', 400);

  const file = await db
    .prepare('SELECT * FROM files WHERE id = ? AND material_id = ?')
    .bind(fileId, m.id)
    .first();
  if (!file) return err('الملف غير موجود', 404);
  // التحقق: مشتق مسموح دائمًا؛ 'original' مسموح فقط إذا رُفع الملف كأصل
  if (versionType === 'original' && file.kind !== 'original') {
    return err('لا يمكن تسجيل نسخة أصلية لملف غير مرفوع كأصل', 400);
  }

  const res = await db
    .prepare(
      'INSERT INTO image_versions (material_id, version_type, file_id, process_note) VALUES (?, ?, ?, ?)'
    )
    .bind(m.id, versionType, fileId, body.processNote || null)
    .run();
  const row = await db.prepare('SELECT * FROM image_versions WHERE id = ?').bind(res.meta.last_row_id).first();
  await touchMaterial(db, m.id);
  await audit(db, {
    userId: user.id,
    action: 'image_version.create',
    target: m.ark,
    detail: `${versionType} ← ملف ${fileId}`,
    ip: clientIp(req),
  });
  return json(row, 201);
}

// ---------- نسخ الصور: حذف صف النسخة فقط (دون المساس بالملف) ----------

async function admVersionDelete(env, user, req, id) {
  const db = env.DB;
  const v = await db
    .prepare(
      `SELECT iv.*, m.ark AS material_ark
       FROM image_versions iv JOIN materials m ON m.id = iv.material_id
       WHERE iv.id = ?`
    )
    .bind(id)
    .first();
  if (!v) return err('النسخة غير موجودة', 404);

  // يُحذف صف image_versions فقط — يبقى الملف في R2 وفي جدول files
  await db.prepare('DELETE FROM image_versions WHERE id = ?').bind(id).run();
  await audit(db, {
    userId: user.id,
    action: 'image_version.delete',
    target: v.material_ark,
    detail: `نسخة ${id} (${v.version_type}) — الملف الأصلي محفوظ`,
    ip: clientIp(req),
  });
  return json({ ok: true });
}

// ---------- الملفات: حذف ----------

async function admFileDelete(env, user, req, id) {
  const db = env.DB;
  const f = await db
    .prepare(
      `SELECT f.*, m.ark AS material_ark FROM files f
       JOIN materials m ON m.id = f.material_id WHERE f.id = ?`
    )
    .bind(id)
    .first();
  if (!f) return err('الملف غير موجود', 404);
  // الباحث: يحذف ملفات المسودات أو المواد التي وافقت الإدارة على تعديلها
  if (user.role !== 'admin') {
    try {
      await requireOwnEditableMaterial(db, user, f.material_id);
    } catch (e) {
      return err(e.message, 403);
    }
  }

  await env.FILES.delete(f.r2_key).catch(() => {});
  await db.batch([
    db.prepare('DELETE FROM image_versions WHERE file_id = ?').bind(id),
    db.prepare('DELETE FROM files WHERE id = ?').bind(id),
  ]);
  await audit(db, {
    userId: user.id,
    action: 'file.delete',
    target: f.material_ark,
    detail: `${f.filename} — حُذف من R2`,
    ip: clientIp(req),
  });
  return json({ ok: true });
}

// ---------- النصوص: التفريغ والترجمة ----------

async function upsertTranscription(db, materialId, layer, text, lang) {
  const ex = await db
    .prepare('SELECT id FROM transcriptions WHERE material_id = ? AND layer = ?')
    .bind(materialId, layer)
    .first();
  if (ex) {
    await db.prepare('UPDATE transcriptions SET text = ?, lang = ? WHERE id = ?').bind(text, lang, ex.id).run();
  } else {
    await db
      .prepare('INSERT INTO transcriptions (material_id, layer, lang, text) VALUES (?, ?, ?, ?)')
      .bind(materialId, layer, lang, text)
      .run();
  }
}

async function admMaterialText(env, user, req, idOrArk, body) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);

  const changed = [];
  if (body.transcriptionAuto !== undefined) {
    await upsertTranscription(db, m.id, 'auto', String(body.transcriptionAuto), m.language);
    changed.push('transcription:auto');
  }
  if (body.transcriptionManual !== undefined) {
    await upsertTranscription(db, m.id, 'manual', String(body.transcriptionManual), m.language);
    changed.push('transcription:manual');
  }
  // اشتقاق حالة التفريغ من الطبقات الموجودة
  const layers = await db
    .prepare('SELECT layer FROM transcriptions WHERE material_id = ?')
    .bind(m.id)
    .all();
  const has = new Set(layers.results.map((r) => r.layer));
  const trStatus = has.has('manual') ? 'corrected' : has.has('auto') ? 'auto' : 'none';

  const matSets = ['transcription_status = ?'];
  const matBinds = [trStatus];
  if (body.fullText !== undefined) {
    matSets.push('full_text = ?');
    matBinds.push(String(body.fullText));
    changed.push('full_text');
  }
  matSets.push("updated_at = datetime('now')");
  await db.prepare(`UPDATE materials SET ${matSets.join(', ')} WHERE id = ?`).bind(...matBinds, m.id).run();

  await rebuildSearchBlob(db, m.id);
  await audit(db, {
    userId: user.id,
    action: 'material.text',
    target: m.ark,
    detail: changed.join(', '),
    ip: clientIp(req),
  });
  return json({ ok: true });
}

// ---------- العلاقات مادة↔مادة ----------

async function admRelationCreate(env, user, req, idOrArk, body) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const relatedArk = String(body.relatedArk || '').trim();
  if (!relatedArk) return err('relatedArk مطلوب', 400);
  const rel = await db.prepare('SELECT id, ark FROM materials WHERE ark = ?').bind(relatedArk).first();
  if (!rel) return err('المادة المرتبطة غير موجودة', 404);
  if (rel.id === m.id) return err('لا يمكن ربط المادة بنفسها', 400);

  const a = Math.min(m.id, rel.id);
  const b = Math.max(m.id, rel.id);
  await db
    .prepare('INSERT OR IGNORE INTO material_relations (material_a, material_b, relation, note) VALUES (?, ?, ?, ?)')
    .bind(a, b, body.relation || null, body.note || null)
    .run();
  await touchMaterial(db, m.id);
  await audit(db, {
    userId: user.id,
    action: 'material.relate',
    target: m.ark,
    detail: `↔ ${relatedArk} (${body.relation || 'مرتبطة'})`,
    ip: clientIp(req),
  });
  return json({ ok: true }, 201);
}


// ============================================================

// تصنيف لغات الملفات من لغة المواد (مؤقتة — تُحذف بعد التشغيل)
async function admClassifyLangs(env, user, req) {
  const db = env.DB;
  const dist = await db.prepare(
    `SELECT m.language AS lang, COUNT(*) AS c FROM files f
     JOIN materials m ON m.id = f.material_id GROUP BY m.language`
  ).all();
  const upd = await db.prepare(
    `UPDATE files SET lang = (SELECT m.language FROM materials m WHERE m.id = files.material_id)
     WHERE (lang IS NULL OR lang = 'undetermined')
     AND EXISTS (SELECT 1 FROM materials m WHERE m.id = files.material_id AND m.language IN ('ar','fr','en'))`
  ).run();
  await audit(db, { userId: user.id, action: 'db.classify_langs', target: 'production', ip: clientIp(req) });
  return json({ ok: true, updated: upd.meta?.changes ?? 0, distribution: dist.results || [] });
}

// ============================================================
// قسم الترجمة الجديد: نظائر Word مرفوعة يدويًا
// القاعدة: فرنسي→عربي، عربي→فرنسي، إنجليزي→عربي وفرنسي
// ============================================================

const FILE_LANGS = ['ar', 'fr', 'en', 'undetermined'];
const TARGET_LANGS = ['ar', 'fr'];

/** اللغات الهدف المسموحة حسب لغة الملف الأصل */
function allowedTargets(sourceLang) {
  if (sourceLang === 'fr') return ['ar'];
  if (sourceLang === 'ar') return ['fr'];
  if (sourceLang === 'en') return ['ar', 'fr'];
  return [];
}

const TRANSLATABLE_WHERE = `f.kind IN ('original','attachment') AND (
  f.mime = 'application/pdf' OR f.mime LIKE '%word%'
  OR lower(f.filename) LIKE '%.pdf' OR lower(f.filename) LIKE '%.doc' OR lower(f.filename) LIKE '%.docx'
)`;

/** نظرة عامة: كل الملفات القابلة للترجمة مصنفة لغويًا مع حالة نظائرها */
async function admTranslationOverview(env, url) {
  const db = env.DB;
  const sp = url.searchParams;
  const page = Math.max(1, parseInt(sp.get('page'), 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(sp.get('perPage'), 10) || 30));
  const q = (sp.get('q') || '').trim();
  const langF = sp.get('lang') || '';
  const statusF = sp.get('status') || 'all'; // all|awaiting|ready

  const where = [TRANSLATABLE_WHERE];
  const binds = [];
  if (FILE_LANGS.includes(langF)) { where.push('f.lang = ?'); binds.push(langF); }
  if (q) {
    where.push('(f.filename LIKE ? OR m.title_ar LIKE ? OR m.title_orig LIKE ? OR m.ark LIKE ?)');
    const like = `%${q}%`; binds.push(like, like, like, like);
  }
  if (statusF === 'awaiting') {
    where.push("NOT EXISTS (SELECT 1 FROM file_translations ft WHERE ft.source_file_id = f.id AND ft.status = 'ready')");
  } else if (statusF === 'ready') {
    where.push("EXISTS (SELECT 1 FROM file_translations ft WHERE ft.source_file_id = f.id AND ft.status = 'ready')");
  }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const fromSql = `FROM files f JOIN materials m ON m.id = f.material_id ${whereSql}`;

  const [itemsRes, countRow, statsRes, reqCount] = await Promise.all([
    db.prepare(
      `SELECT f.id, f.material_id, f.filename, f.mime, f.size, f.lang, f.kind, f.created_at,
              m.ark, m.title_ar, m.title_orig
       ${fromSql} ORDER BY m.updated_at DESC, f.id DESC LIMIT ? OFFSET ?`
    ).bind(...binds, perPage, (page - 1) * perPage).all(),
    db.prepare(`SELECT COUNT(*) AS c ${fromSql}`).bind(...binds).first(),
    db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN f.lang = 'undetermined' THEN 1 ELSE 0 END) AS undetermined,
         SUM(CASE WHEN EXISTS (SELECT 1 FROM file_translations ft WHERE ft.source_file_id = f.id AND ft.status = 'ready') THEN 1 ELSE 0 END) AS ready
       FROM files f WHERE ${TRANSLATABLE_WHERE}`
    ).first(),
    db.prepare("SELECT COUNT(*) AS c FROM translation_requests WHERE status = 'new'").first(),
  ]);

  const items = itemsRes.results || [];
  const ids = items.map((r) => r.id);
  let cpMap = new Map();
  if (ids.length) {
    const cps = await db.prepare(
      `SELECT ft.*, tf.filename AS t_filename, tf.size AS t_size, tf.created_at AS t_created
       FROM file_translations ft LEFT JOIN files tf ON tf.id = ft.translation_file_id
       WHERE ft.source_file_id IN (${ids.map(() => '?').join(',')})`
    ).bind(...ids).all();
    for (const c of cps.results || []) {
      if (!cpMap.has(c.source_file_id)) cpMap.set(c.source_file_id, []);
      cpMap.get(c.source_file_id).push(c);
    }
  }
  const total = Number(countRow?.c || 0);
  const ready = Number(statsRes?.ready || 0);
  const all = Number(statsRes?.total || 0);
  return json({
    items: items.map((r) => ({ ...r, counterparts: cpMap.get(r.id) || [] })),
    total, page, perPage,
    stats: {
      total: all,
      ready,
      awaiting: all - ready,
      undetermined: Number(statsRes?.undetermined || 0),
      newRequests: Number(reqCount?.c || 0),
    },
    allowedTargets: { fr: ['ar'], ar: ['fr'], en: ['ar', 'fr'] },
  });
}

/** رفع نظير Word لملف أصلي (بعد تحديد لغة الملف) */
async function admTranslationUpload(env, user, req) {
  const db = env.DB;
  let form;
  try { form = await req.formData(); } catch { return err('نموذج الرفع غير صالح', 400); }
  const sourceFileId = parseInt(form.get('source_file_id'), 10);
  const sourceLang = String(form.get('source_lang') || '');
  const targetLang = String(form.get('target_lang') || '');
  const file = form.get('file');
  if (!Number.isFinite(sourceFileId)) return err('حدد الملف الأصل أولًا', 400);
  if (!['ar', 'fr', 'en'].includes(sourceLang)) return err('حدد لغة الملف الأصل (عربي/فرنسي/إنجليزي)', 400);
  if (!allowedTargets(sourceLang).includes(targetLang)) {
    return err(`لغة الهدف غير مسموحة للغة الأصل (${sourceLang})`, 400);
  }
  if (!file || typeof file.arrayBuffer !== 'function') return err('اختر ملف Word أولًا', 400);
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  if (ext !== 'docx') return err('صيغة النظير يجب أن تكون Word (.docx) فقط', 400);

  const src = await db.prepare(
    `SELECT f.*, m.ark, m.type FROM files f JOIN materials m ON m.id = f.material_id WHERE f.id = ?`
  ).bind(sourceFileId).first();
  if (!src) return err('الملف الأصل غير موجود', 404);
  if (!['original', 'attachment'].includes(src.kind)) return err('النظير يُرفع للملفات الأصلية فقط', 400);

  // تحديث لغة الملف الأصل حسب تحديد الإدارة
  await db.prepare('UPDATE files SET lang = ? WHERE id = ?').bind(sourceLang, src.id).run();

  // استبدال: إن وُجد نظير سابق لنفس اللغة الهدف يُحذف ملفه من R2 أولًا
  const existing = await db.prepare(
    'SELECT ft.*, f.r2_key FROM file_translations ft LEFT JOIN files f ON f.id = ft.translation_file_id WHERE ft.source_file_id = ? AND ft.target_lang = ?'
  ).bind(src.id, targetLang).first();
  if (existing && existing.r2_key) {
    await env.FILES.delete(existing.r2_key).catch(() => {});
    if (existing.translation_file_id) {
      await db.prepare('DELETE FROM files WHERE id = ?').bind(existing.translation_file_id).run();
    }
  }

  let row;
  try {
    row = await putUpload(env, { materialId: src.material_id, ark: src.ark, type: src.type }, file, 'translation');
  } catch (e) {
    return err(e.message || 'فشل الرفع', 400);
  }
  await db.prepare('UPDATE files SET lang = ? WHERE id = ?').bind(targetLang, row.id).run();
  await db.prepare(
    `INSERT INTO file_translations (material_id, source_file_id, source_lang, target_lang, translation_file_id, status, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', datetime('now'))
     ON CONFLICT(source_file_id, target_lang) DO UPDATE SET
       translation_file_id = excluded.translation_file_id,
       source_lang = excluded.source_lang,
       status = 'ready', updated_at = datetime('now')`
  ).bind(src.material_id, src.id, sourceLang, targetLang, row.id).run();

  // طلبات الترجمة المفتوحة لهذا الملف تُعتبر منجزة
  await db.prepare("UPDATE translation_requests SET status = 'done' WHERE source_file_id = ? AND status = 'new'")
    .bind(src.id).run();

  await audit(db, {
    userId: user.id, action: 'translation.upload', target: src.ark,
    detail: `${src.filename} → ${targetLang} (${row.filename})`, ip: clientIp(req),
  });
  return json({ ok: true, file: row, sourceLang, targetLang }, 201);
}

/** تصنيف لغة ملف أصلي يدويًا */
async function admTranslationFileLang(env, user, req, fileId, body) {
  const db = env.DB;
  const lang = String(body?.lang || '');
  if (!FILE_LANGS.includes(lang)) return err('اللغة غير صالحة', 400);
  const f = await db.prepare('SELECT id FROM files WHERE id = ?').bind(fileId).first();
  if (!f) return err('الملف غير موجود', 404);
  await db.prepare('UPDATE files SET lang = ? WHERE id = ?').bind(lang, fileId).run();
  await audit(db, { userId: user.id, action: 'translation.set_lang', target: `file:${fileId}`, detail: lang, ip: clientIp(req) });
  return json({ ok: true, lang });
}

/** حذف نظير ترجمة (السجل + ملف R2) */
async function admTranslationDelete(env, user, req, id) {
  const db = env.DB;
  const ft = await db.prepare(
    'SELECT ft.*, f.r2_key, f.filename, m.ark FROM file_translations ft LEFT JOIN files f ON f.id = ft.translation_file_id LEFT JOIN materials m ON m.id = ft.material_id WHERE ft.id = ?'
  ).bind(id).first();
  if (!ft) return err('النظير غير موجود', 404);
  if (ft.r2_key) await env.FILES.delete(ft.r2_key).catch(() => {});
  if (ft.translation_file_id) await db.prepare('DELETE FROM files WHERE id = ?').bind(ft.translation_file_id).run();
  await db.prepare('DELETE FROM file_translations WHERE id = ?').bind(id).run();
  await audit(db, {
    userId: user.id, action: 'translation.delete', target: String(ft.ark || ''),
    detail: `${ft.filename || ''} (${ft.target_lang})`, ip: clientIp(req),
  });
  return json({ ok: true });
}

/** صندوق طلبات الترجمة الواردة من القرّاء */
async function admTranslationRequests(env, url) {
  const db = env.DB;
  const sp = url.searchParams;
  const status = sp.get('status') || 'new';
  const where = status === 'all' ? '' : 'WHERE r.status = ?';
  const binds = status === 'all' ? [] : [status];
  const rows = await db.prepare(
    `SELECT r.*, m.ark, m.title_ar, m.title_orig, f.filename AS source_filename
     FROM translation_requests r
     JOIN materials m ON m.id = r.material_id
     LEFT JOIN files f ON f.id = r.source_file_id
     ${where} ORDER BY r.created_at DESC LIMIT 200`
  ).bind(...binds).all();
  return json({ items: rows.results || [] });
}

async function admTranslationRequestUpdate(env, user, req, id, body) {
  const db = env.DB;
  const status = String(body?.status || '');
  if (!['new', 'done', 'dismissed'].includes(status)) return err('الحالة غير صالحة', 400);
  const r = await db.prepare('SELECT id FROM translation_requests WHERE id = ?').bind(id).first();
  if (!r) return err('الطلب غير موجود', 404);
  await db.prepare("UPDATE translation_requests SET status = ? WHERE id = ?").bind(status, id).run();
  await audit(db, { userId: user.id, action: 'translation.request_update', target: `request:${id}`, detail: status, ip: clientIp(req) });
  return json({ ok: true, status });
}


// ---------- OCR اليدوي (لا يعمل تلقائيًا عند الرفع) ----------

/**
 * تشغيل OCR على ملف: يدوي فقط (تكلفة).
 * الناتج يُحفظ دائمًا في raw_text (طبقة auto) —
 * ولا ينتقل إلى corrected_text (طبقة manual) إلا بمراجعة بشرية.
 */
async function admMaterialOcr(env, user, req, idOrArk, body) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const fileId = asInt(body.fileId);
  if (!fileId) return err('fileId مطلوب', 400);
  const file = await db
    .prepare('SELECT * FROM files WHERE id = ? AND material_id = ?')
    .bind(fileId, m.id)
    .first();
  if (!file) return err('الملف غير موجود', 404);
  const language = String(body.language || 'fra').slice(0, 10);

  const provider = getOCRProvider(env);
  const jobRes = await db
    .prepare(
      `INSERT INTO processing_jobs (material_id, file_id, job_type, status, provider, started_at)
       VALUES (?, ?, 'ocr', 'processing', ?, datetime('now'))`
    )
    .bind(m.id, fileId, provider.name)
    .run();
  const jobId = jobRes.meta.last_row_id;

  try {
    const obj = await env.FILES.get(file.r2_key);
    if (!obj) throw new Error('الملف غير موجود في التخزين');
    const bytes = await obj.arrayBuffer();
    const result = await provider.extract(bytes, { language, timeoutMs: 180000 });
    if (result.status === 'failed') throw new Error(result.error || 'فشل OCR');
    const raw = result.text || '';

    const ex = await db
      .prepare('SELECT id FROM transcriptions WHERE material_id = ? AND layer = ?')
      .bind(m.id, 'auto')
      .first();
    if (ex) {
      await db
        .prepare('UPDATE transcriptions SET text = ?, raw_text = ?, lang = ? WHERE id = ?')
        .bind(raw, raw, language, ex.id)
        .run();
    } else {
      await db
        .prepare('INSERT INTO transcriptions (material_id, layer, lang, text, raw_text) VALUES (?, ?, ?, ?, ?)')
        .bind(m.id, 'auto', language, raw, raw)
        .run();
    }

    await db
      .prepare("UPDATE processing_jobs SET status = 'completed', provider = ?, finished_at = datetime('now') WHERE id = ?")
      .bind(result.provider || provider.name, jobId)
      .run();
    await db
      .prepare("UPDATE materials SET transcription_status = 'auto', updated_at = datetime('now') WHERE id = ?")
      .bind(m.id)
      .run();
    await rebuildSearchBlob(db, m.id);
    await audit(db, {
      userId: user.id,
      action: 'ocr.run',
      target: m.ark,
      detail: `ملف ${fileId} عبر ${result.provider} — ${raw.length} حرف`,
      ip: clientIp(req),
    });
    return json({
      ok: true,
      jobId,
      provider: result.provider,
      chars: raw.length,
      confidence: result.confidence,
    });
  } catch (e) {
    await db
      .prepare("UPDATE processing_jobs SET status = 'failed', error_message = ?, finished_at = datetime('now') WHERE id = ?")
      .bind(String(e.message).slice(0, 2000), jobId)
      .run();
    await audit(db, {
      userId: user.id,
      action: 'ocr.failed',
      target: m.ark,
      detail: String(e.message).slice(0, 500),
      ip: clientIp(req),
    });
    return err('فشل OCR: ' + e.message, 502);
  }
}

/** سجل عمليات المعالجة للمادة */
async function admJobsList(env, idOrArk) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const r = await db
    .prepare('SELECT * FROM processing_jobs WHERE material_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(m.id)
    .all();
  return json({ items: r.results });
}

const ENTITIES = {
  people: {
    table: 'people',
    fields: ['name_ar', 'name_orig', 'bio', 'birth_year', 'death_year', 'identity_confidence'],
    required: ['name_ar'],
    searchCols: ['name_ar', 'name_orig'],
    order: 'name_ar',
  },
  places: {
    table: 'places',
    fields: ['name_ar', 'name_orig', 'region', 'kind', 'lat', 'lng', 'place_confidence', 'notes'],
    required: ['name_ar'],
    searchCols: ['name_ar', 'name_orig', 'region'],
    order: 'name_ar',
  },
  sources: {
    table: 'sources',
    fields: ['name', 'name_ar', 'kind', 'website', 'notes'],
    required: ['name'],
    searchCols: ['name_ar', 'name'],
    order: 'name_ar',
  },
  tags: {
    table: 'tags',
    fields: ['name_ar', 'name_orig'],
    required: ['name_ar'],
    searchCols: ['name_ar', 'name_orig'],
    order: 'name_ar',
  },
  collections: {
    table: 'collections',
    fields: ['title_ar', 'title_fr', 'description', 'description_fr', 'cover_material_id', 'sort_order'],
    required: ['title_ar'],
    searchCols: ['title_ar', 'title_fr'],
    order: 'sort_order, title_ar',
  },
  announcements: {
    table: 'announcements',
    fields: ['title_ar', 'title_fr', 'body_ar', 'body_fr', 'link_url', 'active', 'sort_order', 'starts_at', 'ends_at'],
    required: ['title_ar'],
    searchCols: ['title_ar', 'title_fr'],
    order: 'sort_order, id',
  },
  glossary: {
    table: 'glossary',
    fields: ['term_orig', 'term_ar', 'domain', 'notes'],
    required: ['term_orig', 'term_ar'],
    searchCols: ['term_orig', 'term_ar'],
    order: 'term_orig',
  },
};

function pickEntityFields(cfg, body, key) {
  const f = {};
  for (const k of cfg.fields) {
    if (body[k] !== undefined) f[k] = body[k] === '' ? null : body[k];
  }
  // الإعلانات: تطبيع صيغة datetime-local («YYYY-MM-DDTHH:MM») إلى صيغة SQLite
  if (key === 'announcements') {
    for (const dk of ['starts_at', 'ends_at']) {
      if (typeof f[dk] === 'string' && f[dk]) {
        let v = f[dk].replace('T', ' ');
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) v += ':00';
        f[dk] = v;
      }
    }
    // مربع الاختيار: «on» أو غائب → 1/0
    if (f.active !== undefined && f.active !== null) {
      f.active = (f.active === 'on' || f.active === 1 || f.active === '1' || f.active === true) ? 1 : 0;
    }
  }
  return f;
}
async function admEntityList(env, url, key) {
  const cfg = ENTITIES[key];
  const { page, perPage, offset } = pageParams(url);
  const q = (url.searchParams.get('q') || '').trim();
  const where = [];
  const binds = [];
  if (q) {
    where.push(`(${cfg.searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    for (const _ of cfg.searchCols) binds.push(`%${q}%`);
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const [itemsRes, countRow] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ${cfg.table}${whereSql} ORDER BY ${cfg.order} LIMIT ? OFFSET ?`)
      .bind(...binds, perPage, offset)
      .all(),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM ${cfg.table}${whereSql}`).bind(...binds).first(),
  ]);
  return json({ items: itemsRes.results, total: countRow.c, page, perPage });
}

async function admEntityCreate(env, user, req, key, body) {
  const cfg = ENTITIES[key];
  const f = pickEntityFields(cfg, body, key);
  for (const r of cfg.required) {
    if (!f[r] || !String(f[r]).trim()) throw new Error(`الحقل مطلوب: ${r}`);
  }
  const cols = Object.keys(f);
  try {
    const res = await env.DB
      .prepare(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .bind(...cols.map((c) => f[c]))
      .run();
    const row = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).bind(res.meta.last_row_id).first();
    await audit(env.DB, { userId: user.id, action: `${key}.create`, target: String(row.id), ip: clientIp(req) });
    return json(row, 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err('هذا السجل موجود مسبقًا', 409);
    throw e;
  }
}

async function admEntityUpdate(env, user, req, key, id, body) {
  const cfg = ENTITIES[key];
  const ex = await env.DB.prepare(`SELECT id FROM ${cfg.table} WHERE id = ?`).bind(id).first();
  if (!ex) return err('السجل غير موجود', 404);
  const f = pickEntityFields(cfg, body, key);
  const keys = Object.keys(f);
  if (!keys.length) return err('لا حقول للتعديل', 400);
  try {
    await env.DB
      .prepare(`UPDATE ${cfg.table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .bind(...keys.map((k) => f[k]), id)
      .run();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err('هذا السجل موجود مسبقًا', 409);
    throw e;
  }
  const row = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).bind(id).first();
  await audit(env.DB, { userId: user.id, action: `${key}.update`, target: String(id), ip: clientIp(req) });
  return json(row);
}

async function admEntityDelete(env, user, req, key, id) {
  const db = env.DB;
  const cfg = ENTITIES[key];
  const ex = await db.prepare(`SELECT id FROM ${cfg.table} WHERE id = ?`).bind(id).first();
  if (!ex) return err('السجل غير موجود', 404);

  // تنظيف الروابط المرجعية قبل الحذف
  const cleanup = {
    people: ['DELETE FROM material_people WHERE person_id = ?'],
    places: [
      'DELETE FROM material_places WHERE place_id = ?',
      'UPDATE materials SET place_id = NULL WHERE place_id = ?',
    ],
    sources: ['UPDATE materials SET source_id = NULL WHERE source_id = ?'],
    tags: ['DELETE FROM material_tags WHERE tag_id = ?'],
    collections: ['DELETE FROM material_collections WHERE collection_id = ?'],
    glossary: [],
  };
  // عند حذف مادة تُصفَّر مراجع الأغلفة في admMaterialDelete؛ هنا لا نمس المواد إطلاقًا
  const stmts = (cleanup[key] || []).map((sql) => db.prepare(sql).bind(id));
  // عند حذف مجموعة: لا نمس المواد، فقط روابطها
  stmts.push(db.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).bind(id));
  await db.batch(stmts);

  await audit(db, { userId: user.id, action: `${key}.delete`, target: String(id), ip: clientIp(req) });
  return json({ ok: true });
}

// ---------- النسخ الاحتياطي: تفريغ JSON ----------

const EXPORT_TABLES = [
  'counters',
  'sources',
  'people',
  'places',
  'tags',
  'materials',
  'files',
  'image_versions',
  'transcriptions',
  'file_translations',
  'translation_requests',
  'processing_jobs',
  'glossary',
  'collections',
  'material_people',
  'material_places',
  'material_tags',
  'material_collections',
  'material_relations',
  'audit_log',
];

async function admExport(env, user, req) {
  const db = env.DB;
  const tables = {};
  for (const t of EXPORT_TABLES) {
    const r = await db.prepare(`SELECT * FROM ${t}`).all();
    tables[t] = r.results;
  }
  // admin_users دون كلمات المرور
  const au = await db.prepare('SELECT id, username, created_at FROM admin_users').all();
  tables.admin_users = au.results;

  const payload = {
    exported_at: new Date().toISOString(),
    generator: 'sidjil-admin-export-v1',
    tables,
  };
  const day = new Date().toISOString().slice(0, 10);
  await audit(db, { userId: user.id, action: 'backup.export', ip: clientIp(req) });
  return json(payload, 200, {
    'Content-Disposition': `attachment; filename="sidjil-backup-${day}.json"`,
  });
}

// ---------- سجل العمليات ----------

async function admAuditList(env, url) {
  const { page, perPage, offset } = pageParams(url);
  const [itemsRes, countRow] = await Promise.all([
    env.DB.prepare(
      `SELECT a.*, u.username FROM audit_log a
       LEFT JOIN admin_users u ON u.id = a.user_id
       ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`
    )
      .bind(perPage, offset)
      .all(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM audit_log').first(),
  ]);
  return json({ items: itemsRes.results, total: countRow.c, page, perPage });
}
