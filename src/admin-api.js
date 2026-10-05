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
import { MATERIAL_LEVEL_VALUES } from './lib/material-levels.js';
import { translationOverview, translationUpload, translationFileLang, translationDelete, translationRequests, translationRequestUpdate } from './manual-translations.js';

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

async function recordMaterialWorkflow(db, { materialId, actorId, event, fromStatus = null, toStatus = null, note = null }) {
  try {
    await db.prepare(
      `INSERT INTO material_workflow_events (material_id, actor_id, event, from_status, to_status, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(materialId, actorId || null, event, fromStatus, toStatus, note || null).run();
  } catch { /* لا نفشل تغيير الحالة إذا كانت migration قيد التطبيق */ }
}

async function notifyMaterialOwner(db, material, kind, title, body, link = '/researcher') {
  if (!material?.created_by) return;
  try {
    await db.prepare(
      'INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)'
    ).bind(material.created_by, kind, title, body || null, link).run();
  } catch { /* الإشعار تحسين ولا يفشل الاعتماد */ }
}

async function notifyAdmins(db, kind, title, body, link = '/admin/materials/review') {
  try {
    await db.prepare(
      `INSERT INTO notifications (user_id, kind, title, body, link)
       SELECT id, ?, ?, ?, ? FROM admin_users WHERE role = 'admin' AND is_active = 1`
    ).bind(kind, title, body || null, link).run();
  } catch { /* الإشعار تحسين ولا يفشل الإرسال */ }
}

function requireSuperAdmin(user) {
  return Number(user?.is_super_admin) === 1
    ? null
    : err('هذا الإجراء مخصص لـ Super Admin فقط', 403);
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

function encodeAdminCursor(value) {
  try { return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch { return null; }
}

function decodeAdminCursor(value) {
  if (!value) return null;
  try { const token = String(value); const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4); const row = JSON.parse(atob(padded)); return row && typeof row === 'object' ? row : null; } catch { return null; }
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
  if (rest === 'profile/sessions' && method === 'GET') return true;
  if (rest === 'profile/sessions/revoke' && method === 'POST') return true;
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
  if (!['draft', 'changes_requested'].includes(m.publish_status)) throw new Error('لا يمكن تعديل مادة منشورة — تواصل مع الإدارة');
  return m;
}

async function requireOwnEditableMaterial(db, user, idOrArk) {
  const m = await findMaterial(db, idOrArk);
  if (!m) throw new Error('المادة غير موجودة');
  if (Number(m.created_by) !== Number(user.id)) throw new Error('هذه المادة ليست من منشوراتك');
  if (['draft', 'changes_requested'].includes(m.publish_status)) return m;
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
  await notifyAdmins(db, 'material_edit_request', 'طلب تعديل مادة منشورة', `طلب الباحث تعديل المادة: ${material.title_ar || material.ark}`, '/admin/materials/review');
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
    "SELECT r.id, r.material_id, r.researcher_id, m.ark, m.title_ar FROM material_edit_requests r JOIN materials m ON m.id = r.material_id WHERE r.id = ? AND r.status = 'pending' AND m.publish_status = 'published'"
  ).bind(id).first();
  if (!request) return err('طلب التعديل غير موجود أو سبق البت فيه', 404);
  const note = String(body.note || '').trim().slice(0, 1000) || null;
  await db.prepare(
    "UPDATE material_edit_requests SET status = ?, note = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?"
  ).bind(decision === 'approve' ? 'approved' : 'rejected', note, user.id, id).run();
  await notifyMaterialOwner(db, { created_by: request.researcher_id }, decision === 'approve' ? 'material_edit_approved' : 'material_edit_rejected', decision === 'approve' ? 'وافقت الإدارة على تعديل المادة' : 'رفضت الإدارة طلب تعديل المادة', note || `المادة: ${request.title_ar || request.ark}`, `/researcher/${request.material_id}`);
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

async function admSocialReportsList(env, user, url) {
  if (user.role !== 'admin') return err('صلاحية الإدارة مطلوبة', 403);
  const status = ['open', 'reviewing', 'resolved', 'dismissed', 'all'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'open';
  const where = status === 'all' ? '' : 'WHERE r.status = ?';
  const rows = await env.DB.prepare(`SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at, r.reviewed_at,
      reporter.display_name AS reporter_name, reporter.username AS reporter_username,
      reviewer.username AS reviewer_username,
      CASE WHEN r.target_type = 'material' THEN (SELECT title_ar FROM materials WHERE id = r.target_id)
           WHEN r.target_type = 'discussion' THEN (SELECT title FROM discussions WHERE id = r.target_id)
           WHEN r.target_type = 'reply' THEN (SELECT substr(body, 1, 140) FROM discussion_replies WHERE id = r.target_id)
           WHEN r.target_type = 'researcher' THEN (SELECT display_name FROM admin_users WHERE id = r.target_id)
      END AS target_title
    FROM social_reports r JOIN admin_users reporter ON reporter.id = r.reporter_id
    LEFT JOIN admin_users reviewer ON reviewer.id = r.reviewed_by
    ${where} ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at ASC LIMIT 200`).bind(...(status === 'all' ? [] : [status])).all();
  return json({ items: rows.results || [], status });
}

async function admSocialReportReview(env, user, req, id) {
  if (user.role !== 'admin') return err('صلاحية الإدارة مطلوبة', 403);
  const body = await readJson(req);
  const status = ['open', 'reviewing', 'resolved', 'dismissed'].includes(body?.status) ? body.status : null;
  const report = await env.DB.prepare('SELECT id, target_type, target_id FROM social_reports WHERE id = ?').bind(id).first();
  if (!report) return err('البلاغ غير موجود', 404);
  if (body?.action === 'hide') {
    const table = report.target_type === 'material' ? 'materials' : report.target_type === 'discussion' ? 'discussions' : report.target_type === 'reply' ? 'discussion_replies' : null;
    if (!table) return err('لا يمكن إخفاء هذا النوع من البلاغات', 400);
    const column = table === 'materials' ? 'publish_status' : 'status';
    const updatedAt = table === 'discussion_replies' ? '' : ", updated_at = datetime('now')";
    await env.DB.prepare(`UPDATE ${table} SET ${column} = 'hidden'${updatedAt} WHERE id = ?`).bind(report.target_id).run();
    await env.DB.prepare("UPDATE social_reports SET status = 'resolved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").bind(user.id, id).run();
    await audit(env.DB, { userId: user.id, action: 'social.report_hide', target: `${report.target_type}:${report.target_id}`, detail: String(id), ip: clientIp(req) });
    return json({ ok: true, status: 'resolved', hidden: true });
  }
  if (!status) return err('حالة البلاغ غير صالحة');
  await env.DB.prepare('UPDATE social_reports SET status = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?').bind(status, user.id, id).run();
  await audit(env.DB, { userId: user.id, action: 'social.report_review', target: String(id), detail: status, ip: clientIp(req) });
  return json({ ok: true, status });
}

// ---------- طابور إصلاح المحتوى ----------
// يكتشف النقص فقط ويضعه في طابور قابل للمراجعة؛ لا يخترع غلافًا أو نصًا أو مصدرًا.
export async function syncContentRepairQueue(db) {
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO content_repair_queue (material_id, issue_type, note)
      SELECT m.id, 'cover', 'لا يوجد غلاف أو صورة مرتبطة بالمادة'
      FROM materials m LEFT JOIN material_assets_index a ON a.material_id = m.id
      WHERE ((m.material_level = 'archival_image' AND a.image_file_id IS NULL)
        OR (m.material_level IN ('archival_book_original', 'archival_book_unavailable', 'chadian_publication')
            AND a.cover_file_id IS NULL))`),
    db.prepare(`INSERT OR IGNORE INTO content_repair_queue (material_id, issue_type, note)
      SELECT m.id, 'pdf', 'كتاب أرشيفي أصيل بلا ملف PDF مرتبط'
      FROM materials m LEFT JOIN material_assets_index a ON a.material_id = m.id
      WHERE m.material_level = 'archival_book_original' AND a.pdf_file_id IS NULL`),
    db.prepare(`INSERT OR IGNORE INTO content_repair_queue (material_id, issue_type, note)
      SELECT m.id, 'text', 'وثيقة نصية بلا تفريغ نصي موثق'
      FROM materials m LEFT JOIN material_assets_index a ON a.material_id = m.id
      WHERE m.material_level = 'archival_text'
        AND COALESCE(length(trim(m.full_text)), 0) = 0
        AND NOT EXISTS (SELECT 1 FROM transcriptions t WHERE t.material_id = m.id AND length(trim(t.text)) > 0)
        AND a.pdf_file_id IS NULL`),
  ]);
}

async function admContentRepairList(env, url) {
  await syncContentRepairQueue(env.DB);
  const sp = url.searchParams;
  const status = ['pending', 'processing', 'resolved', 'blocked', 'all'].includes(sp.get('status')) ? sp.get('status') : 'pending';
  const issueType = ['cover', 'pdf', 'text', 'asset', 'ocr', 'metadata'].includes(sp.get('issue_type')) ? sp.get('issue_type') : '';
  const { page, perPage } = pageParams(url);
  const cursor = decodeAdminCursor(sp.get('cursor'));
  const where = [];
  const binds = [];
  if (status !== 'all') { where.push('q.status = ?'); binds.push(status); }
  if (issueType) { where.push('q.issue_type = ?'); binds.push(issueType); }
  if (cursor && cursor.updated_at !== undefined && cursor.id !== undefined) {
    where.push('(q.updated_at < ? OR (q.updated_at = ? AND q.id < ?))');
    binds.push(cursor.updated_at || '', cursor.updated_at || '', Number(cursor.id));
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const countWhere = [];
  const countBinds = [];
  if (status !== 'all') { countWhere.push('q.status = ?'); countBinds.push(status); }
  if (issueType) { countWhere.push('q.issue_type = ?'); countBinds.push(issueType); }
  const repairLimitSql = `LIMIT ${perPage + 1}`;
  const repairOffsetSql = cursor ? '' : ` OFFSET ${(page - 1) * perPage}`;
  const [itemsRes, countRow] = await Promise.all([
    env.DB.prepare(`SELECT q.id, q.material_id, q.issue_type, q.status, q.source_file_id, q.note,
      q.requested_by, q.resolved_by, q.resolved_at, q.created_at, q.updated_at,
      m.ark, m.title_ar, m.title_orig, m.type, m.publish_status
      FROM content_repair_queue q JOIN materials m ON m.id = q.material_id
      ${whereSql} ORDER BY q.updated_at DESC, q.id DESC ${repairLimitSql}${repairOffsetSql}`)
      .bind(...binds).all(),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM content_repair_queue q${countWhere.length ? ` WHERE ${countWhere.join(' AND ')}` : ''}`).bind(...countBinds).first(),
  ]);
  const raw = itemsRes.results || [];
  const items = raw.slice(0, perPage);
  const tail = items[items.length - 1];
  const nextCursor = raw.length > perPage && tail ? encodeAdminCursor({ updated_at: tail.updated_at || '', id: tail.id }) : null;
  return json({ items, total: countRow?.c || 0, page, perPage, nextCursor, hasMore: Boolean(nextCursor), paginationMode: cursor ? 'cursor' : 'page' });
}

async function admContentRepairEnqueue(env, user, req, body) {
  const materialId = asInt(body?.material_id);
  const issueType = ['cover', 'pdf', 'text', 'asset', 'ocr', 'metadata'].includes(body?.issue_type) ? body.issue_type : null;
  if (!materialId || !issueType) return err('المادة ونوع النقص مطلوبان', 400);
  const material = await env.DB.prepare('SELECT id, ark FROM materials WHERE id = ?').bind(materialId).first();
  if (!material) return err('المادة غير موجودة', 404);
  const note = String(body?.note || '').trim().slice(0, 2000) || null;
  await env.DB.prepare(`INSERT INTO content_repair_queue (material_id, issue_type, status, note, requested_by)
    VALUES (?, ?, 'pending', ?, ?)
    ON CONFLICT(material_id, issue_type) DO UPDATE SET note = COALESCE(excluded.note, content_repair_queue.note), status = CASE WHEN content_repair_queue.status = 'resolved' THEN 'pending' ELSE content_repair_queue.status END, requested_by = excluded.requested_by`)
    .bind(materialId, issueType, note, user.id).run();
  await audit(env.DB, { userId: user.id, action: 'content_repair.enqueue', target: material.ark, detail: issueType, ip: clientIp(req) });
  return json({ ok: true });
}

// تصنيف آلي محافظ: يغلق النواقص غير المنطبقة أو المكتملة فعليًا، ويحدد
// ملف PDF المرشح لعناصر OCR دون اعتبار التفريغ مكتملًا قبل مراجعته.
async function admContentRepairAutoTriage(env, user, req) {
  const db = env.DB;
  await syncContentRepairQueue(db);
  const obsolete = await db.prepare(`UPDATE content_repair_queue
    SET status = 'resolved', note = 'غير منطبق: الوثيقة النصية لا تحتاج غلافًا وفق تصنيف المادة',
        resolved_by = ?, resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE status IN ('pending','processing') AND issue_type = 'cover'
      AND material_id IN (SELECT id FROM materials WHERE material_level = 'archival_text')`).bind(user.id).run();
  const completedText = await db.prepare(`UPDATE content_repair_queue
    SET status = 'resolved', note = 'اكتمل التفريغ النصي في سجل المادة',
        resolved_by = ?, resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE status IN ('pending','processing') AND issue_type = 'text'
      AND material_id IN (SELECT m.id FROM materials m WHERE COALESCE(length(trim(m.full_text)), 0) > 0
        OR EXISTS (SELECT 1 FROM transcriptions t WHERE t.material_id = m.id AND length(trim(t.text)) > 0))`).bind(user.id).run();
  const assignedPdf = await db.prepare(`UPDATE content_repair_queue
    SET source_file_id = COALESCE(source_file_id, (SELECT a.pdf_file_id FROM material_assets_index a WHERE a.material_id = content_repair_queue.material_id)),
        note = 'ملف PDF مرتبط؛ يحتاج تشغيل OCR ثم مراجعة التفريغ قبل اعتماده', updated_at = datetime('now')
    WHERE status = 'pending' AND issue_type = 'text'
      AND material_id IN (SELECT m.id FROM materials m WHERE m.material_level = 'archival_text'
        AND EXISTS (SELECT 1 FROM material_assets_index a WHERE a.material_id = m.id AND a.pdf_file_id IS NOT NULL))`).run();
  const blocked = await db.prepare(`UPDATE content_repair_queue
    SET status = 'blocked', note = 'لا يوجد PDF أو نص مصدر يمكن تشغيل OCR عليه؛ يلزم رفع المصدر أولًا',
        resolved_by = ?, resolved_at = datetime('now'), updated_at = datetime('now')
    WHERE status IN ('pending','processing') AND issue_type = 'text'
      AND material_id IN (SELECT m.id FROM materials m WHERE m.material_level = 'archival_text'
        AND COALESCE(length(trim(m.full_text)), 0) = 0
        AND NOT EXISTS (SELECT 1 FROM transcriptions t WHERE t.material_id = m.id AND length(trim(t.text)) > 0)
        AND NOT EXISTS (SELECT 1 FROM material_assets_index a WHERE a.material_id = m.id AND a.pdf_file_id IS NOT NULL))`).bind(user.id).run();
  await audit(db, { userId: user.id, action: 'content_repair.auto_triage', target: 'content_repair_queue', detail: JSON.stringify({ obsoleteCovers: obsolete.meta?.changes || 0, completedText: completedText.meta?.changes || 0, pdfAssigned: assignedPdf.meta?.changes || 0, blocked: blocked.meta?.changes || 0 }), ip: clientIp(req) });
  return json({ ok: true, obsoleteCovers: Number(obsolete.meta?.changes || 0), completedText: Number(completedText.meta?.changes || 0), pdfAssigned: Number(assignedPdf.meta?.changes || 0), blocked: Number(blocked.meta?.changes || 0) });
}

async function admContentRepairUpdate(env, user, req, id, body) {
  const status = ['pending', 'processing', 'resolved', 'blocked'].includes(body?.status) ? body.status : null;
  if (!status) return err('حالة الطابور غير صالحة', 400);
  const item = await env.DB.prepare(`SELECT q.id, q.material_id, m.ark FROM content_repair_queue q JOIN materials m ON m.id = q.material_id WHERE q.id = ?`).bind(id).first();
  if (!item) return err('عنصر الطابور غير موجود', 404);
  const sourceFileId = body?.source_file_id === null || body?.source_file_id === '' ? null : asInt(body?.source_file_id);
  const note = body?.note === undefined ? null : String(body.note || '').trim().slice(0, 2000) || null;
  await env.DB.prepare(`UPDATE content_repair_queue SET status = ?, source_file_id = COALESCE(?, source_file_id), note = COALESCE(?, note), resolved_by = CASE WHEN ? IN ('resolved', 'blocked') THEN ? ELSE resolved_by END, resolved_at = CASE WHEN ? IN ('resolved', 'blocked') THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?`)
    .bind(status, sourceFileId, note, status, user.id, status, id).run();
  await audit(env.DB, { userId: user.id, action: 'content_repair.update', target: item.ark, detail: `${id}:${status}`, ip: clientIp(req) });
  return json({ ok: true, status });
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

  // حالة الجلسة لـCapacitor والواجهات التي لا تملك HTML مولدًا من الخادم.
  // يعاد رمز CSRF فقط لأنه غير قابل لإعادة الاستخدام كجلسة ولا يحتوي على
  // session token أو كلمة مرور.
  if (rest === 'session' && method === 'GET') {
    const { csrfToken, sessionToken, ...safeUser } = user;
    return json({ authenticated: true, user: safeUser, csrfToken });
  }

  // CSRF: كل طلب معدِّل (POST/PUT/PATCH/DELETE) يتطلب هيدر X-CSRF-Token
  // مطابقًا لرمز الجلسة — المصادقة هنا كوكيز جلسات (ليست Cloudflare Access)
  // إذن CSRF قابل للتطبيق فعلًا.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !verifyCsrf(user, req)) {
    await audit(env.DB, { userId: user.id, action: 'admin.csrf_rejected', target: rest, ip: clientIp(req) });
    return err('رمز CSRF غير صالح أو مفقود', 403);
  }

  // صلاحيات الباحث: قائمة بيضاء صارمة — كل ما عداها للإدارة فقط
  // (النشر المباشر، المراجعة، المستخدمون، الإعلانات، الكيانات، النسخ… للإدارة)
  const isAdmin = user.role === 'admin' || Number(user.is_super_admin) === 1;
  if (!isAdmin && !researcherAllowed(rest, method)) {
    await audit(env.DB, { userId: user.id, action: 'admin.forbidden', target: `${method} ${rest}`, ip: clientIp(req) });
    return err('غير مصرح — هذه العملية من صلاحيات الإدارة فقط', 403);
  }

  // منظومة النظائر اليدوية الجديدة (الإدارة فقط)
  if (rest === 'translations/overview' && method === 'GET') return translationOverview(env, url);
  if (rest === 'translations/upload' && method === 'POST') return translationUpload(env, user, req);
  let manualMatch = rest.match(/^translations\/file-lang\/(\d+)$/);
  if (manualMatch && method === 'PATCH') return withJsonBody(req, (body) => translationFileLang(env, user, req, parseInt(manualMatch[1], 10), body));
  manualMatch = rest.match(/^translations\/file\/(\d+)$/);
  if (manualMatch && method === 'DELETE') return translationDelete(env, user, req, parseInt(manualMatch[1], 10));
  if (rest === 'translation-requests' && method === 'GET') return translationRequests(env, url);
  manualMatch = rest.match(/^translation-requests\/(\d+)$/);
  if (manualMatch && method === 'PATCH') return withJsonBody(req, (body) => translationRequestUpdate(env, user, req, parseInt(manualMatch[1], 10), body));
  if (rest.startsWith('translation-segments') || /^translations\/\d+/.test(rest)) return err('مسار الترجمة القديم غير متاح', 410);

  // رفع عدد مجلة كامل بصيغة PDF — صلاحية الإدارة فقط.
  if (rest === 'journal/issues' && method === 'POST') {
    if (!isAdmin) return err('هذه العملية من صلاحيات الإدارة فقط', 403);
    return journalPdfIssueUpload(env, user, req);
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
  if (rest === 'profile/sessions' && method === 'GET') return admProfileSessions(env, user);
  if (rest === 'profile/sessions/revoke' && method === 'POST') return admProfileSessionsRevoke(env, user, req);
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

  m = rest.match(/^materials\/([^/]+)\/integrity$/);
  if (m && method === 'POST') return admMaterialIntegrityCheck(env, user, req, m[1]);

  m = rest.match(/^materials\/([^/]+)\/versions$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admVersionCreate(env, user, req, m[1], body));

  m = rest.match(/^materials\/([^/]+)\/text$/);
  if (m && method === 'PUT')
    return withJsonBody(req, (body) => admMaterialText(env, user, req, m[1], body));

  m = rest.match(/^materials\/([^/]+)\/relations$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admRelationCreate(env, user, req, m[1], body));

  // مقاطع الترجمة (العرض الموازي)
  m = rest.match(/^materials\/([^/]+)\/translation-segments$/);
  if (m && method === 'GET') return admSegmentsList(env, m[1]);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admSegmentsCreate(env, user, req, m[1], body));

  m = rest.match(/^translation-segments\/(\d+)$/);
  if (m && method === 'PATCH')
    return withJsonBody(req, (body) => admSegmentUpdate(env, user, req, parseInt(m[1], 10), body));

  // اعتماد الترجمة: صريح فقط — لا يحدث تلقائيًا أبدًا
  m = rest.match(/^translations\/(\d+)\/approve$/);
  if (m && method === 'POST')
    return withJsonBody(req, (body) => admTranslationApprove(env, user, req, parseInt(m[1], 10), body || {}));

  m = rest.match(/^translations\/(\d+)$/);
  if (m && method === 'DELETE') return admTranslationDelete(env, user, req, parseInt(m[1], 10));

  // مسارات منظومة الترجمة القديمة — مغلقة بعد الانتقال إلى نظائر Word.
  if (rest === 'manual-translations' || rest.startsWith('translation-jobs')) return err('مسار الترجمة القديم غير متاح', 410);

  // مسرد المصطلحات (تثبيت الأسماء قبل الترجمة الآلية)
  if (rest === 'glossary' && method === 'GET') return admGlossaryList(env, url);
  if (rest === 'glossary' && method === 'POST')
    return withJsonBody(req, (body) => admGlossaryAdd(env, user, req, body));
  if (rest === 'social-reports' && method === 'GET') return admSocialReportsList(env, user, url);
  m = rest.match(/^social-reports\/(\d+)$/);
  if (m && method === 'PATCH') return admSocialReportReview(env, user, req, parseInt(m[1], 10));
  if (rest === 'content-repair' && method === 'GET') return admContentRepairList(env, url);
  if (rest === 'content-repair' && method === 'POST')
    return withJsonBody(req, (body) => admContentRepairEnqueue(env, user, req, body));
  if (rest === 'content-repair/triage' && method === 'POST') return admContentRepairAutoTriage(env, user, req);
  m = rest.match(/^content-repair\/(\d+)$/);
  if (m && method === 'PATCH')
    return withJsonBody(req, (body) => admContentRepairUpdate(env, user, req, parseInt(m[1], 10), body));
  m = rest.match(/^glossary\/(\d+)$/);
  if (m && method === 'DELETE') return admGlossaryDelete(env, user, req, parseInt(m[1], 10));

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

async function journalPdfIssueUpload(env, user, req) {
  let form;
  try { form = await req.formData(); } catch (_) { return err('بيانات رفع العدد غير صالحة', 400); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return err('اختر ملف العدد PDF', 400);
  const filename = safeName(file.name || 'journal-issue.pdf');
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext !== 'pdf' || file.size < 8 || file.size > 90 * 1024 * 1024) return err('ملف العدد يجب أن يكون PDF وألا يتجاوز 90 ميغابايت', 400);
  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return err('محتوى الملف لا يبدو ملف PDF صالحًا', 400);
  const issueNumber = String(form.get('issue_number') || '').trim().slice(0, 32);
  const year = Number(form.get('year'));
  const title = String(form.get('title') || '').trim().slice(0, 180);
  const description = String(form.get('description') || '').trim().slice(0, 4000);
  const comment = String(form.get('comment') || '').trim().slice(0, 2000);
  if (!issueNumber || !title) return err('عنوان العدد ورقمه مطلوبان', 400);
  if (!Number.isInteger(year) || year < 1800 || year > 2200) return err('سنة العدد غير صالحة', 400);
  if (await env.DB.prepare('SELECT id FROM journal_pdf_issues WHERE year = ? AND issue_number = ?').bind(year, issueNumber).first()) return err('هذا العدد مسجل بالفعل في السنة نفسها', 409);
  const key = `journal/issues/${crypto.randomUUID()}/${filename}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  try {
    const saved = await env.DB.prepare(
      `INSERT INTO journal_pdf_issues (issue_number, year, title, description, comment, r2_key, filename, size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(issueNumber, year, title, description, comment, key, filename, file.size, user.id).run();
    const id = Number(saved.meta?.last_row_id);
    await audit(env.DB, { userId: user.id, action: 'journal.pdf_issue_upload', target: String(id), detail: `العدد ${issueNumber} · ${year}`, ip: clientIp(req) });
    return json({ ok: true, id }, 201);
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
}

// ---------- المواد: قائمة ----------

async function admMaterialsList(env, url, user) {
  const sp = url.searchParams;
  const { page, perPage } = pageParams(url);
  const cursor = decodeAdminCursor(sp.get('cursor'));
  const offset = cursor ? 0 : (page - 1) * perPage;
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
  const countWhereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const countBinds = binds.slice();
  if (cursor && cursor.updated_at !== undefined && cursor.id !== undefined) {
    where.push('(m.updated_at < ? OR (m.updated_at = ? AND m.id < ?))');
    binds.push(cursor.updated_at || '', cursor.updated_at || '', Number(cursor.id));
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const fromSql = 'FROM materials m LEFT JOIN admin_users u ON u.id = m.created_by';
  // Use validated integer literals for the look-ahead limit. This keeps the
  // extra row available on D1 edge runtimes so cursor pagination is reliable.
  const limitSql = `LIMIT ${perPage + 1}`;
  const offsetSql = cursor ? '' : ` OFFSET ${offset}`;
  const [itemsRes, countRow] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.year, m.date_text, m.language,
              m.publish_status, m.review_note, m.translation_status, m.transcription_status,
              m.updated_at, u.username AS creator
       ${fromSql}${whereSql} ORDER BY m.updated_at DESC, m.id DESC ${limitSql}${offsetSql}`
    )
      .bind(...binds)
      .all(),
    env.DB.prepare(`SELECT COUNT(*) AS c ${fromSql}${countWhereSql}`).bind(...countBinds).first(),
  ]);
  const rawItems = itemsRes.results || [];
  const items = rawItems.slice(0, perPage);
  const tail = items[items.length - 1];
  const nextCursor = rawItems.length > perPage && tail ? encodeAdminCursor({ updated_at: tail.updated_at || '', id: tail.id }) : null;
  return json({ items, total: countRow.c, page, perPage, nextCursor, hasMore: Boolean(nextCursor), paginationMode: cursor ? 'cursor' : 'page' });
}

// ---------- المواد: إنشاء ----------

const MATERIAL_FIELDS = [
  'type',
  'material_level',
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
  'translation_status',
  'publish_status',
];

const PUBLISH_STATUSES = ['draft', 'in_review', 'changes_requested', 'published', 'hidden'];
const DATE_CONFIDENCES = ['confirmed', 'approximate', 'probable', 'unknown'];
const TRANSCRIPTION_STATUSES = ['none', 'auto', 'corrected'];
const TRANSLATION_STATUSES = ['none', 'machine', 'in_review', 'reviewed', 'approved'];

function pickMaterialFields(body) {
  const f = {};
  for (const k of MATERIAL_FIELDS) {
    if (body[k] !== undefined) f[k] = body[k] === '' ? null : body[k];
  }
  if (f.year !== undefined) f.year = asInt(f.year);
  if (f.place_id !== undefined) f.place_id = asInt(f.place_id);
  if (f.source_id !== undefined) f.source_id = asInt(f.source_id);
  if (!f.material_level) {
    f.material_level = f.type === 'image' || f.type === 'map'
      ? 'archival_image'
      : f.type === 'book'
        ? 'archival_book_unavailable'
        : 'archival_text';
  }
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
  if (f.translation_status && !TRANSLATION_STATUSES.includes(f.translation_status))
    throw new Error('حالة الترجمة غير صالحة');
  if (f.material_level && !MATERIAL_LEVEL_VALUES.includes(f.material_level))
    throw new Error('تصنيف المادة غير صالح');
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
  if (user.role !== 'admin' && Number(user.is_super_admin) !== 1) return err('النشر المباشر من صلاحيات الإدارة فقط', 403);
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const status = body.status;
  if (!PUBLISH_STATUSES.includes(status)) return err('حالة النشر غير صالحة', 400);
  await db
    .prepare("UPDATE materials SET publish_status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, m.id)
    .run();
  const workflowEvent = status === 'published' ? 'published' : status === 'hidden' ? 'hidden' : status === 'draft' ? 'restored' : null;
  if (workflowEvent) await recordMaterialWorkflow(db, { materialId: m.id, actorId: user.id, event: workflowEvent, fromStatus: m.publish_status, toStatus: status });
  if (status === 'published') await notifyMaterialOwner(db, m, 'material_published', 'نُشرت مادتك في الأرشيف', `أصبحت المادة متاحة في سِجِل: ${m.title_ar || m.ark}`, `/researcher?feed=official&material=${m.id}`);
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
  if (!['draft', 'changes_requested'].includes(m.publish_status)) return err('يمكن إرسال المسودات أو المواد المطلوبة للتعديل فقط', 400);
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
  await recordMaterialWorkflow(db, { materialId: m.id, actorId: user.id, event: 'submitted', fromStatus: m.publish_status, toStatus: 'in_review' });
  await notifyAdmins(db, 'material_submitted', 'مادة جديدة للمراجعة', `أرسل الباحث مادة للمراجعة: ${m.title_ar || m.ark}`, `/admin/materials/${m.id}`);
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
    await recordMaterialWorkflow(db, { materialId: m.id, actorId: user.id, event: 'approved', fromStatus: 'in_review', toStatus: 'published' });
    await notifyMaterialOwner(db, m, 'material_approved', 'اعتمدت الإدارة مادتك', `تم اعتماد ونشر المادة: ${m.title_ar || m.ark}`, `/researcher?feed=official&material=${m.id}`);
    await audit(db, { userId: user.id, action: 'material.review_approve', target: m.ark, ip: clientIp(req) });
    return json({ ok: true, status: 'published' });
  }
  if (decision === 'request_changes') {
    if (!note) return err('ملاحظة التعديل مطلوبة', 400);
    await db
      .prepare("UPDATE materials SET publish_status = 'changes_requested', review_note = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(note.slice(0, 2000), m.id)
      .run();
    await recordMaterialWorkflow(db, { materialId: m.id, actorId: user.id, event: 'changes_requested', fromStatus: 'in_review', toStatus: 'changes_requested', note: note.slice(0, 2000) });
    await notifyMaterialOwner(db, m, 'material_changes_requested', 'طلبت الإدارة تعديل مادتك', note.slice(0, 1000), `/researcher/materials`);
    await audit(db, { userId: user.id, action: 'material.review_changes_requested', target: m.ark, detail: note.slice(0, 200), ip: clientIp(req) });
    return json({ ok: true, status: 'changes_requested' });
  }
  if (decision === 'reject') {
    if (!note) return err('ملاحظة المراجعة مطلوبة عند إعادة المادة', 400);
    await db
      .prepare('UPDATE materials SET publish_status = ?, review_note = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind('draft', note.slice(0, 2000), m.id)
      .run();
    await recordMaterialWorkflow(db, { materialId: m.id, actorId: user.id, event: 'rejected', fromStatus: 'in_review', toStatus: 'draft', note: note.slice(0, 2000) });
    await notifyMaterialOwner(db, m, 'material_rejected', 'لم تعتمد الإدارة مادتك', note.slice(0, 1000), `/researcher/materials`);
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
  const isPublicProfile = body.is_public_profile === undefined ? Number(user.is_public_profile) === 1 : (body.is_public_profile ? 1 : 0);

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
      job_title = ?, bio = ?, specialty = ?, website = ?, is_public_profile = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(displayName, email, phone, affiliation || null, jobTitle, bio, specialty || null, website || null, isPublicProfile, user.id).run();
  await audit(db, { userId: user.id, action: 'researcher.profile_update', target: user.username, detail: 'تحديث بيانات الحساب', ip: clientIp(req) });
  return json({ ok: true });
}

async function admProfileSessions(env, user) {
  const rows = await env.DB.prepare(
    `SELECT id, user_agent, ip, created_at, last_seen_at, expires_at,
            CASE WHEN token = ? THEN 1 ELSE 0 END AS current
     FROM sessions WHERE user_id = ? AND expires_at > datetime('now')
     ORDER BY current DESC, last_seen_at DESC, created_at DESC`
  ).bind(user.sessionToken || '', user.id).all();
  return json({ sessions: rows.results || [] });
}

async function admProfileSessionsRevoke(env, user, req) {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').bind(user.id, user.sessionToken || '').run();
  await audit(env.DB, { userId: user.id, action: 'account.sessions_revoked', target: user.username, detail: 'إبطال الجلسات الأخرى', ip: clientIp(req) });
  return json({ ok: true, sessionsRevoked: true });
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
    `SELECT u.id, u.username, u.role, u.is_active, u.is_verified, u.is_super_admin, u.verification_type, u.display_name, u.affiliation,
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
  if (role === 'admin') {
    const blocked = requireSuperAdmin(user);
    if (blocked) return blocked;
  }
  if (!username || username.length < 3) return err('اسم المستخدم 3 أحرف على الأقل', 400);
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) return err('اسم المستخدم: أحرف لاتينية وأرقام و _ . - فقط', 400);
  if (password.length < 8) return err('كلمة المرور 8 أحرف على الأقل', 400);
  const exists = await env.DB.prepare('SELECT id FROM admin_users WHERE username = ?').bind(username).first();
  if (exists) return err('اسم المستخدم موجود مسبقًا', 400);
  const password_hash = await hashPassword(password);
  const res = await env.DB.prepare(
    'INSERT INTO admin_users (username, password_hash, role, is_active, is_public_profile) VALUES (?, ?, ?, 1, ?)'
  ).bind(username, password_hash, role, role === 'researcher' ? 1 : 0).run();
  await audit(env.DB, { userId: user.id, action: 'user.create', target: username, detail: `role=${role}`, ip: clientIp(req) });
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function admUserUpdate(env, user, req, id, body) {
  const db = env.DB;
  const target = await db.prepare('SELECT id, username, role, is_super_admin FROM admin_users WHERE id = ?').bind(id).first();
  if (!target) return err('المستخدم غير موجود', 404);
  const sensitiveChange = body.role !== undefined || body.is_active !== undefined || body.is_super_admin !== undefined || (body.password !== undefined && body.password !== '');
  if (sensitiveChange) {
    const blocked = requireSuperAdmin(user);
    if (blocked) return blocked;
  }
  const sets = [];
  const binds = [];
  // لا يمكن للمدير إيقاف نفسه أو تغيير دوره
  const selfEdit = Number(id) === Number(user.id);
  if (body.role !== undefined) {
    const role = body.role === 'admin' ? 'admin' : 'researcher';
    if (selfEdit && role !== 'admin') return err('لا يمكنك تغيير دور حسابك', 400);
    if (role === 'researcher' && Number(target.is_super_admin) === 1 && body.is_super_admin !== false) return err('أزل صلاحية Super Admin أولًا قبل تغيير الدور', 400);
    sets.push('role = ?');
    binds.push(role);
  }
  if (body.is_super_admin !== undefined) {
    const nextSuper = body.is_super_admin ? 1 : 0;
    if (selfEdit && !nextSuper) return err('لا يمكنك إزالة صلاحية Super Admin من حسابك', 400);
    if (!nextSuper && Number(target.is_super_admin) === 1) {
      const remaining = await db.prepare("SELECT COUNT(*) AS c FROM admin_users WHERE is_super_admin = 1 AND is_active = 1 AND id <> ?").bind(id).first();
      if (Number(remaining?.c || 0) === 0) return err('يجب إبقاء Super Admin نشط واحد على الأقل', 400);
    }
    sets.push('is_super_admin = ?');
    binds.push(nextSuper);
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
    sets.push('password_hash = ?', "password_changed_at = datetime('now')", 'must_change_password = 1');
    binds.push(await hashPassword(String(body.password)));
  }
  if (!sets.length) return err('لا تغييرات', 400);
  await db.prepare(`UPDATE admin_users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  if (body.password !== undefined && body.password !== '') {
    try {
      await db.prepare('INSERT INTO notifications (user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?)')
        .bind(id, 'password_reset', 'أعادت الإدارة تعيين كلمة المرور', 'يجب تغيير كلمة المرور عند تسجيل الدخول القادم.', target.role === 'researcher' ? '/researcher/account' : '/admin').run();
    } catch { /* لا يفشل تغيير كلمة المرور بسبب الإشعار */ }
  }
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
    const isImage = /^image\/(jpeg|png|webp|tiff|gif|heic)$/i.test(file?.type || '') || /\.(?:jpe?g|png|webp|tiff?|gif|heic)$/i.test(file?.name || '');
    const isPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
    const isWordFile = /\.(docx?)$/i.test(file?.name || '') || /^application\/(?:msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i.test(file?.type || '');
    const isArticleFile = m.type === 'article' && (isPdf || isWordFile);
    if (requestedKind === 'cover') {
      if (m.type === 'article') return err('مقالات المجلة لا تحتاج إلى صورة غلاف هنا', 400);
      if (!isImage) return err('الغلاف يجب أن يكون صورة', 415);
      const existing = await db.prepare("SELECT id FROM files WHERE material_id = ? AND kind = 'cover' LIMIT 1").bind(m.id).first();
      if (existing) return err('للمادة صورة غلاف واحدة فقط؛ احذف الغلاف الحالي أولًا لاستبداله', 400);
      kind = 'cover';
    } else if (requestedKind === 'content-image') {
      if (m.type === 'article') return err('يمكن إرفاق ملف PDF أو Word واحد بمقال المجلة', 400);
      if (!isImage) return err('اختر صورة بصيغة مدعومة', 415);
      const existing = await db.prepare('SELECT kind, mime, filename FROM files WHERE material_id = ? AND kind = \'attachment\'').bind(m.id).all();
      const rows = existing.results || [];
      if (m.type !== 'article' && rows.some(f => f.mime === 'application/pdf' || /\.pdf$/i.test(f.filename || ''))) return err('اختر صور المحتوى أو PDF، ولا يمكن الجمع بينهما', 400);
      if (rows.filter(f => /^image\//i.test(f.mime || '')).length >= 20) return err('الحد الأقصى 20 صورة للمادة', 400);
      kind = 'attachment';
    } else if (requestedKind === 'content-file') {
      if (!(isPdf || isWordFile || isArticleFile)) return err('ملف المضمون يجب أن يكون PDF أو Word', 415);
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
    const message = e.message || 'فشل الرفع';
    const status = /حجم الملف|100MB|100 ميغابايت/i.test(message) ? 413 : /نوع الملف|المسموح|غير صالح|صيغة مدعومة/i.test(message) ? 415 : 400;
    return err(message, status);
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

  // الكتاب الذي كان مسجلًا كغير متاح ينتقل تلقائيًا إلى «أصيل متاح» عند
  // رفع PDF فعلي، مع إبقاء «كتاب أو مؤلف تشادي» كما اختارته الإدارة.
  if (m.type === 'book' && m.material_level === 'archival_book_unavailable'
      && (row.mime === 'application/pdf' || /\.pdf$/i.test(row.filename || ''))) {
    await db.prepare("UPDATE materials SET material_level = 'archival_book_original', updated_at = datetime('now') WHERE id = ?")
      .bind(m.id).run();
  }
  // قاعدة التصنيف: PDF فعلي لا يبقى في مستوى التفريغ النصي. يستطيع المدير
  // اختيار chadian_publication صراحة للمؤلفات التشادية قبل رفع الملف.
  if (row.mime === 'application/pdf' || /\.pdf$/i.test(row.filename || '')) {
    await db.prepare("UPDATE materials SET material_level = 'archival_book_original', updated_at = datetime('now') WHERE id = ? AND material_level = 'archival_text'")
      .bind(m.id).run();
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

// فحص وجود ملفات المادة فعليًا في R2، دون تنزيل محتواها.
async function admMaterialIntegrityCheck(env, user, req, idOrArk) {
  const db = env.DB;
  const material = await findMaterial(db, idOrArk);
  if (!material) return err('المادة غير موجودة', 404);
  const files = await db.prepare('SELECT id, filename, r2_key, size FROM files WHERE material_id = ? ORDER BY id').bind(material.id).all();
  const missing = [];
  for (const file of files.results || []) {
    let object = null;
    try { object = await env.FILES.head(file.r2_key); } catch (_) { object = null; }
    if (!object) missing.push({ id: file.id, filename: file.filename, key: file.r2_key });
  }
  const status = (files.results || []).length && missing.length === 0 ? 'ok' : 'missing';
  try {
    await db.prepare(`INSERT OR IGNORE INTO material_assets_index (material_id) VALUES (?)`).bind(material.id).run();
    await db.prepare(`UPDATE material_assets_index SET integrity_status = ?, checked_at = datetime('now'), updated_at = datetime('now') WHERE material_id = ?`).bind(status, material.id).run();
  } catch (e) {
    return err('تعذر حفظ نتيجة فحص التخزين. تأكد من تطبيق migration 0041.', 500);
  }
  await audit(db, { userId: user.id, action: 'material.integrity_check', target: material.ark, detail: JSON.stringify({ status, files: (files.results || []).length, missing: missing.map(item => item.id) }), ip: clientIp(req) });
  return json({ ok: true, materialId: material.id, ark: material.ark, status, fileCount: (files.results || []).length, missing });
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

async function getOrCreateTranslation(db, material, translator) {
  let t = await db
    .prepare("SELECT * FROM translations WHERE material_id = ? AND target_lang = 'ar' ORDER BY updated_at DESC")
    .bind(material.id)
    .first();
  if (!t) {
    const res = await db
      .prepare(
        "INSERT INTO translations (material_id, source_lang, target_lang, text, status, translator) VALUES (?, ?, 'ar', '', 'machine', ?)"
      )
      .bind(material.id, material.language || 'fr', translator || null)
      .run();
    t = await db.prepare('SELECT * FROM translations WHERE id = ?').bind(res.meta.last_row_id).first();
  }
  return t;
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

  let tlStatus = body.translationStatus;
  if (tlStatus !== undefined && !TRANSLATION_STATUSES.includes(tlStatus)) {
    return err('حالة الترجمة غير صالحة', 400);
  }
  if (body.translationText !== undefined || body.translator !== undefined || tlStatus !== undefined) {
    const t = await getOrCreateTranslation(db, m, body.translator);
    // إن كانت الترجمة تُدار بالمقاطع، يُمنع تعديل النص الموحد مباشرة (منعًا للتباعد)
    if (body.translationText !== undefined) {
      const segCount = await db
        .prepare('SELECT COUNT(*) AS c FROM translation_segments WHERE translation_id = ?')
        .bind(t.id)
        .first();
      if (segCount && segCount.c > 0) {
        return err('هذه الترجمة تُدار بالمقاطع — عدّل المقاطع من واجهة المراجعة المتوازية', 400);
      }
    }
    const sets = [];
    const binds = [];
    if (body.translationText !== undefined) {
      sets.push('text = ?');
      binds.push(String(body.translationText));
    }
    if (body.translator !== undefined) {
      sets.push('translator = ?');
      binds.push(body.translator || null);
    }
    if (tlStatus !== undefined) {
      sets.push('status = ?');
      binds.push(tlStatus);
    }
    sets.push("updated_at = datetime('now')");
    await db.prepare(`UPDATE translations SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, t.id).run();
    changed.push('translation');
  }

  const matSets = ['transcription_status = ?'];
  const matBinds = [trStatus];
  if (tlStatus !== undefined) {
    matSets.push('translation_status = ?');
    matBinds.push(tlStatus);
  }
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

// ---------- مقاطع الترجمة (العرض الموازي) ----------

const SEGMENT_STATUSES = ['machine', 'reviewed'];

async function getMaterialTranslation(db, materialId) {
  return db
    .prepare("SELECT * FROM translations WHERE material_id = ? AND target_lang = 'ar' ORDER BY updated_at DESC")
    .bind(materialId)
    .first();
}

/** سرد المقاطع (إن وُجدت) مع سجل الترجمة الأم */
async function admSegmentsList(env, idOrArk) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const t = await getMaterialTranslation(db, m.id);
  if (!t) return json({ translation: null, segments: [] });
  const segs = await db
    .prepare('SELECT * FROM translation_segments WHERE translation_id = ? ORDER BY sequence_number')
    .bind(t.id)
    .all();
  return json({ translation: t, segments: segs.results });
}

/**
 * إنشاء ترجمة من مقاطع: body.segments = [{source_text, machine_translation?, page_number?}]
 * تستبدل أي ترجمة عربية سابقة للمادة (مع مقاطعها عبر CASCADE).
 */
async function admSegmentsCreate(env, user, req, idOrArk, body) {
  const db = env.DB;
  const m = await findMaterial(db, idOrArk);
  if (!m) return err('المادة غير موجودة', 404);
  const segments = Array.isArray(body.segments) ? body.segments : [];
  if (!segments.length) return err('المقاطع مطلوبة (مصفوفة segments غير فارغة)', 400);
  if (segments.length > 2000) return err('عدد المقاطع يتجاوز الحد (2000)', 400);
  for (const s of segments) {
    if (!s || !String(s.source_text || '').trim()) return err('كل مقطع يحتاج source_text', 400);
  }

  const old = await getMaterialTranslation(db, m.id);
  if (old) {
    await db.prepare('DELETE FROM translations WHERE id = ?').bind(old.id).run();
  }
  const res = await db
    .prepare(
      "INSERT INTO translations (material_id, source_lang, target_lang, text, status, translator) VALUES (?, ?, 'ar', '', 'machine', ?)"
    )
    .bind(m.id, body.sourceLang || m.language || 'fr', body.translator || null)
    .run();
  const tid = res.meta.last_row_id;

  const stmts = [];
  let seq = 1;
  for (const s of segments) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO translation_segments
           (translation_id, sequence_number, page_number, source_text, machine_translation, reviewed_translation, status)
           VALUES (?, ?, ?, ?, ?, NULL, 'machine')`
        )
        .bind(
          tid,
          seq++,
          asInt(s.page_number),
          String(s.source_text),
          s.machine_translation ? String(s.machine_translation) : null
        )
    );
  }
  await db.batch(stmts);

  await db
    .prepare("UPDATE materials SET translation_status = 'machine', updated_at = datetime('now') WHERE id = ?")
    .bind(m.id)
    .run();
  await rebuildSearchBlob(db, m.id);
  await audit(db, {
    userId: user.id,
    action: 'translation.segments_create',
    target: m.ark,
    detail: `${segments.length} مقطعًا`,
    ip: clientIp(req),
  });
  return json({ ok: true, translationId: tid, count: segments.length }, 201);
}

/** تعديل مقطع: reviewed_translation + status (+ machine_translation + page_number) */
async function admSegmentUpdate(env, user, req, segId, body) {
  const db = env.DB;
  const seg = await db
    .prepare(
      `SELECT ts.*, t.material_id, m.ark FROM translation_segments ts
       JOIN translations t ON t.id = ts.translation_id
       JOIN materials m ON m.id = t.material_id
       WHERE ts.id = ?`
    )
    .bind(segId)
    .first();
  if (!seg) return err('المقطع غير موجود', 404);

  const sets = [];
  const binds = [];
  if (body.reviewed_translation !== undefined) {
    sets.push('reviewed_translation = ?');
    const v = String(body.reviewed_translation || '').trim();
    binds.push(v ? v : null);
  }
  if (body.machine_translation !== undefined) {
    sets.push('machine_translation = ?');
    const v = String(body.machine_translation || '').trim();
    binds.push(v ? v : null);
  }
  if (body.page_number !== undefined) {
    sets.push('page_number = ?');
    binds.push(asInt(body.page_number));
  }
  if (body.status !== undefined) {
    if (!SEGMENT_STATUSES.includes(body.status)) return err('حالة المقطع غير صالحة', 400);
    sets.push('status = ?');
    binds.push(body.status);
  }
  if (!sets.length) return err('لا حقول للتعديل', 400);
  sets.push("updated_at = datetime('now')");
  await db
    .prepare(`UPDATE translation_segments SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, segId)
    .run();

  // اشتقاق حالة الترجمة الأم من اكتمال مراجعة المقاطع (ليس اعتمادًا — الاعتماد صريح فقط)
  const pending = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM translation_segments
       WHERE translation_id = ?
         AND (status != 'reviewed' OR reviewed_translation IS NULL OR reviewed_translation = '')`
    )
    .bind(seg.translation_id)
    .first();
  const parentStatus = pending && pending.c > 0 ? 'in_review' : 'reviewed';
  await db
    .prepare("UPDATE translations SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(parentStatus, seg.translation_id)
    .run();
  await db
    .prepare("UPDATE materials SET translation_status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(parentStatus, seg.material_id)
    .run();

  await rebuildSearchBlob(db, seg.material_id);
  await touchMaterial(db, seg.material_id);
  await audit(db, {
    userId: user.id,
    action: 'translation.segment_update',
    target: seg.ark,
    detail: `مقطع ${segId} ← ${body.status || 'تعديل نص'}`,
    ip: clientIp(req),
  });
  return json({ ok: true, parentStatus });
}

/** اعتماد الترجمة: إجراء إداري صريح — لا يحدث تلقائيًا أبدًا */
async function admTranslationApprove(env, user, req, translationId, body) {
  const db = env.DB;
  const t = await db
    .prepare(
      `SELECT t.*, m.ark, m.id AS material_id FROM translations t
       JOIN materials m ON m.id = t.material_id WHERE t.id = ?`
    )
    .bind(translationId)
    .first();
  if (!t) return err('الترجمة غير موجودة', 404);

  await db
    .prepare("UPDATE translations SET status = 'approved', updated_at = datetime('now') WHERE id = ?")
    .bind(translationId)
    .run();
  await db
    .prepare("UPDATE materials SET translation_status = 'approved', updated_at = datetime('now') WHERE id = ?")
    .bind(t.material_id)
    .run();
  await rebuildSearchBlob(db, t.material_id);
  await audit(db, {
    userId: user.id,
    action: 'translation.approve',
    target: t.ark,
    detail: `اعتماد صريح${body && body.note ? ' — ' + String(body.note).slice(0, 200) : ''}`,
    ip: clientIp(req),
  });
  return json({ ok: true, status: 'approved' });
}

/** حذف الترجمة ومقاطعها (لإعادة التقسيم مثلًا) */
async function admTranslationDelete(env, user, req, translationId) {
  const db = env.DB;
  const t = await db
    .prepare(
      `SELECT t.*, m.ark FROM translations t
       JOIN materials m ON m.id = t.material_id WHERE t.id = ?`
    )
    .bind(translationId)
    .first();
  if (!t) return err('الترجمة غير موجودة', 404);
  await db.prepare('DELETE FROM translations WHERE id = ?').bind(translationId).run(); // CASCADE للمقاطع
  await db
    .prepare("UPDATE materials SET translation_status = 'none', updated_at = datetime('now') WHERE id = ?")
    .bind(t.material_id)
    .run();
  await rebuildSearchBlob(db, t.material_id);
  await audit(db, {
    userId: user.id,
    action: 'translation.delete',
    target: t.ark,
    detail: `حذف ترجمة ${translationId} ومقاطعها`,
    ip: clientIp(req),
  });
  return json({ ok: true });
}

// ---------- إدارة وظائف ترجمة الملفات الكاملة ----------

async function admManualTranslationUpload(env, user, req) {
  let form;
  try { form = await req.formData(); } catch { return err('تعذر قراءة الملفات المرفوعة'); }
  const materialId = asInt(form.get('material_id'));
  const source = String(form.get('source_language') || '').trim();
  const target = String(form.get('target_language') || '').trim();
  const docx = form.get('docx');
  const pdf = form.get('pdf');
  const note = String(form.get('note') || '').trim().slice(0, 500);
  const langs = new Set(['ar', 'fr', 'en']);
  if (!materialId || !langs.has(source) || !langs.has(target) || source === target) return err('تحقق من المادة واتجاه الترجمة');
  if (!(docx instanceof File) || !(pdf instanceof File) || !docx.size || !pdf.size) return err('ملفا Word وPDF مطلوبان');
  if (docx.size > 25 * 1024 * 1024 || pdf.size > 25 * 1024 * 1024) return err('الحد الأقصى لكل ملف 25 ميغابايت', 413);
  if (!/\.docx$/i.test(docx.name) || !/\.pdf$/i.test(pdf.name)) return err('ارفع ملف DOCX وملف PDF فقط');
  const [docxBytes, pdfBytes] = await Promise.all([docx.arrayBuffer(), pdf.arrayBuffer()]);
  const docxHead = new Uint8Array(docxBytes, 0, Math.min(4, docxBytes.byteLength));
  const pdfHead = new Uint8Array(pdfBytes, 0, Math.min(5, pdfBytes.byteLength));
  if (docxHead[0] !== 0x50 || docxHead[1] !== 0x4b) return err('ملف Word غير صالح');
  if (new TextDecoder().decode(pdfHead) !== '%PDF-') return err('ملف PDF غير صالح');
  const material = await env.DB.prepare("SELECT id FROM materials WHERE id = ? AND publish_status = 'published'").bind(materialId).first();
  if (!material) return err('المادة المنشورة غير موجودة', 404);
  const translationId = crypto.randomUUID();
  const prefix = `manual-translations/${materialId}/${translationId}`;
  const docxKey = `${prefix}/translation.docx`;
  const pdfKey = `${prefix}/translation.pdf`;
  const docxName = safeName(docx.name) || 'translation.docx';
  const pdfName = safeName(pdf.name) || 'translation.pdf';
  try {
    await Promise.all([
      env.FILES.put(docxKey, docxBytes, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } }),
      env.FILES.put(pdfKey, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } }),
    ]);
    await env.DB.prepare(`INSERT INTO manual_translations
      (id, material_id, source_language, target_language, docx_key, pdf_key, docx_filename, pdf_filename, docx_size, pdf_size, note, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(translationId, materialId, source, target, docxKey, pdfKey, docxName, pdfName, docx.size, pdf.size, note || null, user.id).run();
  } catch (e) {
    await Promise.all([env.FILES.delete(docxKey).catch(() => {}), env.FILES.delete(pdfKey).catch(() => {})]);
    return err('تعذر حفظ الترجمة؛ لم يُسجل أي ملف', 500);
  }
  await audit(env.DB, { userId: user.id, action: 'manual_translation.upload', target: String(materialId), detail: `${source} → ${target}`, ip: clientIp(req) });
  return json({ ok: true, id: translationId });
}

async function admTranslationJobsList(env, url) {
  const db = env.DB;
  // وظيفة PDF التي لا ترسل heartbeat خلال ساعتين لم تعد قابلة للاستئناف من
  // الخدمة الحالية؛ نضعها فاشلة مع سبب واضح، وتبقى قابلة لإعادة المحاولة.
  await db.prepare(`UPDATE translation_jobs SET status = 'FAILED', current_stage = 'FAILED',
    error_code = 'STALE_HEARTBEAT', error_message = 'توقفت الخدمة دون تحديث ويمكن إعادة المحاولة', updated_at = datetime('now')
    WHERE status IN ('QUEUED','ANALYZING','EXTRACTING','OCR_PROCESSING','TRANSLATING','REBUILDING','UPLOADING')
      AND updated_at < datetime('now', '-2 hours')`).run().catch(() => {});
  const status = String(url.searchParams.get('status') || '').trim().toUpperCase();
  const source = String(url.searchParams.get('source') || '').trim().toLowerCase();
  const target = String(url.searchParams.get('target') || '').trim().toLowerCase();
  const q = String(url.searchParams.get('q') || '').trim();
  const { page, perPage, offset } = pageParams(url);
  const where = [];
  const binds = [];
  if (status) { where.push('j.status = ?'); binds.push(status); }
  if (source) { where.push('j.source_language = ?'); binds.push(source); }
  if (target) { where.push('j.target_language = ?'); binds.push(target); }
  if (q) {
    where.push('(m.title_ar LIKE ? OR m.title_orig LIKE ? OR m.ark LIKE ? OR j.id LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM translation_jobs j
    LEFT JOIN materials m ON m.id = j.material_id
    LEFT JOIN files f ON f.id = j.file_id`;
  const [rows, count] = await Promise.all([
    db.prepare(`SELECT j.id, j.material_id, j.file_id, j.source_language, j.target_language,
      j.output_mode, j.ocr_mode, j.status, j.progress, j.current_stage, j.page_count,
      j.processed_pages, j.error_code, j.error_message, j.output_mime, j.output_size,
      j.created_at, j.updated_at, j.completed_at, m.ark, m.title_ar, m.title_orig,
      m.type, m.publish_status, f.filename
      ${from} ${whereSql} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`).bind(...binds, perPage, offset).all(),
    db.prepare(`SELECT COUNT(*) AS c ${from} ${whereSql}`).bind(...binds).first(),
  ]);
  return json({ items: rows.results || [], total: Number(count?.c || 0), page, perPage });
}

async function deleteTranslationJobRecord(env, job) {
  const db = env.DB;
  if (job?.output_key) await env.FILES.delete(job.output_key).catch(() => {});
  // العلاقات في المخطط تستخدم CASCADE، لكن الحذف الصريح يحافظ على التوافق مع قواعد قديمة.
  await db.batch([
    db.prepare('DELETE FROM translation_events WHERE job_id = ?').bind(job.id),
    db.prepare('DELETE FROM translation_usage WHERE job_id = ?').bind(job.id),
    db.prepare('DELETE FROM translation_jobs WHERE id = ?').bind(job.id),
  ]);
}

async function admTranslationJobDelete(env, user, req, jobId) {
  const db = env.DB;
  const job = await db.prepare(`SELECT j.*, m.ark, m.title_ar
    FROM translation_jobs j LEFT JOIN materials m ON m.id = j.material_id WHERE j.id = ?`).bind(jobId).first();
  // الحذف idempotent: قد تبقى صفوف قديمة في تبويب الإدارة بعد تنظيفها من جلسة أخرى.
  // في هذه الحالة نعيد نجاحًا حتى لا يظل الزر عالقًا بسبب 404 غير مؤثر.
  if (!job) return json({ ok: true, id: jobId, missing: true });
  await deleteTranslationJobRecord(env, job);
  await audit(db, {
    userId: user.id,
    action: 'translation_job.delete',
    target: String(job.ark || job.material_id || job.id),
    detail: `حذف وظيفة ${job.id} (${job.status})`,
    ip: clientIp(req),
  });
  return json({ ok: true, id: job.id });
}

async function admTranslationJobCancel(env, user, req, jobId) {
  const db = env.DB;
  const job = await db.prepare('SELECT id, status, material_id, output_key FROM translation_jobs WHERE id = ?').bind(jobId).first();
  if (!job) return json({ ok: true, id: jobId, missing: true });
  const active = new Set(['QUEUED', 'ANALYZING', 'EXTRACTING', 'OCR_PROCESSING', 'TRANSLATING', 'REBUILDING', 'UPLOADING']);
  if (!active.has(String(job.status))) return json({ ok: true, id: job.id, status: job.status, unchanged: true });
  await db.prepare("UPDATE translation_jobs SET status = 'CANCELLED', current_stage = 'CANCELLED', error_code = 'CANCELLED_BY_ADMIN', error_message = 'ألغتها الإدارة', updated_at = datetime('now') WHERE id = ?").bind(job.id).run();
  if (env.TRANSLATION_SERVICE_URL) {
    try {
      const headers = {};
      if (env.TRANSLATION_SERVICE_TOKEN) headers['X-Sidjil-Service-Token'] = env.TRANSLATION_SERVICE_TOKEN;
      await fetch(`${String(env.TRANSLATION_SERVICE_URL).replace(/\/$/, '')}/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST', headers });
    } catch { /* يبقى الإلغاء المحلي نافذًا حتى لو تعذر الوصول للخدمة */ }
  }
  await audit(db, { userId: user.id, action: 'translation_job.cancel', target: String(job.id), detail: 'إلغاء وظيفة ترجمة', ip: clientIp(req) });
  return json({ ok: true, id: job.id, status: 'CANCELLED' });
}

async function admTranslationJobRetry(env, user, req, jobId) {
  const db = env.DB;
  const job = await db.prepare(`SELECT j.*, m.id AS material_id FROM translation_jobs j
    LEFT JOIN materials m ON m.id = j.material_id WHERE j.id = ?`).bind(jobId).first();
  if (!job) return json({ ok: true, id: jobId, missing: true });
  if (!['FAILED', 'CANCELLED'].includes(String(job.status))) {
    return json({ ok: true, id: job.id, status: job.status, unchanged: true });
  }
  if (!env.TRANSLATION_SERVICE_URL) return err('خدمة معالجة المستند غير مهيأة', 503, 'SERVICE_NOT_CONFIGURED');
  const fingerprint = `${job.fingerprint}|retry|${Date.now()}`;
  const newId = crypto.randomUUID();
  await db.prepare(`INSERT INTO translation_jobs
    (id, material_id, file_id, user_id, content_hash, fingerprint, source_language, target_language,
     engine, engine_version, pdf_engine, pdf_engine_version, output_mode, ocr_mode, input_key, status, current_stage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ollama', 'qwen3:8b', 'sidjil-pdf', 'v4', ?, ?, ?, 'QUEUED', 'QUEUED')`)
    .bind(newId, job.material_id, job.file_id, job.user_id, job.content_hash, fingerprint,
      job.source_language, job.target_language, job.output_mode, job.ocr_mode, job.input_key).run();
  const base = String(env.TRANSLATION_SERVICE_URL).replace(/\/$/, '');
  const payload = {
    jobId: newId, materialId: job.material_id, fileId: job.file_id, inputKey: job.input_key,
    contentHash: job.content_hash, fingerprint, source: job.source_language, target: job.target_language,
    mode: job.output_mode, ocr: job.ocr_mode,
    inputUrl: new URL(`/api/v1/translate/internal/jobs/${newId}/input`, req.url).toString(),
    outputUrl: new URL(`/api/v1/translate/internal/jobs/${newId}/output`, req.url).toString(),
    callback: new URL(`/api/v1/translate/internal/jobs/${newId}`, req.url).toString(),
  };
  const headers = { 'content-type': 'application/json' };
  if (env.TRANSLATION_SERVICE_TOKEN) headers['X-Sidjil-Service-Token'] = env.TRANSLATION_SERVICE_TOKEN;
  try {
    const response = await fetch(`${base}/jobs`, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`service ${response.status}`);
  } catch (error) {
    await db.prepare(`UPDATE translation_jobs SET status = 'FAILED', current_stage = 'FAILED',
      error_code = 'SERVICE_UNAVAILABLE', error_message = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(String(error.message).slice(0, 500), newId).run();
    return err('تعذر إعادة إرسال الترجمة إلى الخدمة', 503, 'SERVICE_UNAVAILABLE');
  }
  await audit(db, { userId: user.id, action: 'translation_job.retry', target: String(jobId), detail: `إعادة إنشاء الوظيفة ${newId}`, ip: clientIp(req) });
  return json({ ok: true, previousId: jobId, id: newId, status: 'QUEUED' }, 202);
}

async function admTranslationJobsCleanup(env, user, req, body) {
  const db = env.DB;
  const days = Math.min(3650, Math.max(1, asInt(body?.beforeDays) || 30));
  const includeFailed = body?.includeFailed !== false;
  const cutoff = `-${days} days`;
  const statuses = includeFailed ? ['COMPLETED', 'FAILED', 'CANCELLED'] : ['COMPLETED'];
  const placeholders = statuses.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT * FROM translation_jobs
    WHERE status IN (${placeholders}) AND updated_at < datetime('now', ?)
    ORDER BY updated_at ASC LIMIT 500`).bind(...statuses, cutoff).all();
  const jobs = rows.results || [];
  for (const job of jobs) await deleteTranslationJobRecord(env, job);
  // كاش النصوص لا يرتبط بوظيفة بعينها؛ نحذف القديم فقط ضمن نفس سياسة التنظيف.
  const cache = await db.prepare("DELETE FROM translation_text_cache WHERE created_at < datetime('now', ?) ").bind(cutoff).run();
  await audit(db, {
    userId: user.id,
    action: 'translation_job.cleanup',
    target: 'translation_jobs',
    detail: `حذف ${jobs.length} وظيفة قديمة و${Number(cache?.meta?.changes || 0)} من الكاش (أقدم من ${days} يومًا)`,
    ip: clientIp(req),
  });
  return json({ ok: true, deletedJobs: jobs.length, deletedCache: Number(cache?.meta?.changes || 0), beforeDays: days });
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
  'translations',
  'translation_segments',
  'translation_jobs',
  'translation_text_cache',
  'translation_usage',
  'translation_events',
  'translation_settings',
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
