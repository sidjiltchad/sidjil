import { putUpload, safeName } from './lib/r2files.js';
import { audit, rebuildSearchBlob } from './lib/db.js';

const FILE_LANGS = ['ar', 'fr', 'en', 'undetermined'];
const TRANSLATABLE_WHERE = `f.kind IN ('original','attachment') AND (f.mime = 'application/pdf' OR f.mime LIKE '%word%' OR lower(f.filename) LIKE '%.pdf' OR lower(f.filename) LIKE '%.doc' OR lower(f.filename) LIKE '%.docx')`;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
const err = (message, status = 400) => json({ error: message }, status);
const clientIp = (req) => req.headers.get('CF-Connecting-IP') || (req.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || '';
const allowedTargets = (lang) => lang === 'fr' ? ['ar'] : lang === 'ar' ? ['fr'] : lang === 'en' ? ['ar', 'fr'] : [];

async function setLang(db, id, lang) {
  await db.prepare('INSERT INTO file_languages (file_id, lang, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(file_id) DO UPDATE SET lang = excluded.lang, updated_at = datetime(\'now\')').bind(id, lang).run().catch(() => {});
  await db.prepare('UPDATE files SET lang = ? WHERE id = ?').bind(lang, id).run().catch(() => {});
}

export async function translationOverview(env, url) {
  const db = env.DB, sp = url.searchParams;
  const schema = await db.prepare('PRAGMA table_info(files)').all().catch(() => ({ results: [] }));
  const hasLegacyLang = (schema.results || []).some((c) => c.name === 'lang');
  const langExpr = hasLegacyLang ? "COALESCE(fl.lang, f.lang, 'undetermined')" : "COALESCE(fl.lang, 'undetermined')";
  const page = Math.max(1, parseInt(sp.get('page'), 10) || 1), perPage = Math.min(100, Math.max(1, parseInt(sp.get('perPage'), 10) || 30));
  const q = (sp.get('q') || '').trim(), lang = sp.get('lang') || '', status = sp.get('status') || 'all';
  const where = [TRANSLATABLE_WHERE], binds = [];
  if (FILE_LANGS.includes(lang)) { where.push(`${langExpr} = ?`); binds.push(lang); }
  if (q) { where.push('(f.filename LIKE ? OR m.title_ar LIKE ? OR m.title_orig LIKE ? OR m.ark LIKE ?)'); const like = `%${q}%`; binds.push(like, like, like, like); }
  if (status === 'awaiting') where.push("NOT EXISTS (SELECT 1 FROM file_translations ft WHERE ft.source_file_id = f.id AND ft.status = 'ready')");
  if (status === 'ready') where.push("EXISTS (SELECT 1 FROM file_translations ft WHERE ft.source_file_id = f.id AND ft.status = 'ready')");
  const from = `FROM files f JOIN materials m ON m.id = f.material_id LEFT JOIN file_languages fl ON fl.file_id = f.id WHERE ${where.join(' AND ')}`;
  const [itemsRes, countRow, stats, requests] = await Promise.all([
    db.prepare(`SELECT f.id, f.material_id, f.filename, f.mime, f.size, ${langExpr} AS lang, f.kind, f.created_at, m.ark, m.title_ar, m.title_orig ${from} ORDER BY m.updated_at DESC, f.id DESC LIMIT ? OFFSET ?`).bind(...binds, perPage, (page - 1) * perPage).all(),
    db.prepare(`SELECT COUNT(*) AS c ${from}`).bind(...binds).first(),
    db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${langExpr}='undetermined' THEN 1 ELSE 0 END) AS undetermined, SUM(CASE WHEN EXISTS (SELECT 1 FROM file_translations ft WHERE ft.source_file_id=f.id AND ft.status='ready') THEN 1 ELSE 0 END) AS ready FROM files f LEFT JOIN file_languages fl ON fl.file_id=f.id WHERE ${TRANSLATABLE_WHERE}`).first(),
    db.prepare("SELECT COUNT(*) AS c FROM translation_requests WHERE status='new'").first().catch(() => ({ c: 0 })),
  ]);
  const ids = (itemsRes.results || []).map((x) => x.id); let counterparts = new Map();
  if (ids.length) { const cp = await db.prepare(`SELECT ft.*, tf.filename AS t_filename, tf.size AS t_size FROM file_translations ft LEFT JOIN files tf ON tf.id=ft.translation_file_id WHERE ft.source_file_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all().catch(() => ({ results: [] })); for (const x of cp.results || []) { if (!counterparts.has(x.source_file_id)) counterparts.set(x.source_file_id, []); counterparts.get(x.source_file_id).push(x); } }
  return json({ items: (itemsRes.results || []).map((x) => ({ ...x, counterparts: counterparts.get(x.id) || [] })), total: Number(countRow?.c || 0), page, perPage, stats: { total: Number(stats?.total || 0), ready: Number(stats?.ready || 0), awaiting: Number(stats?.total || 0) - Number(stats?.ready || 0), undetermined: Number(stats?.undetermined || 0), newRequests: Number(requests?.c || 0) }, allowedTargets: { fr: ['ar'], ar: ['fr'], en: ['ar', 'fr'] } });
}

export async function translationUpload(env, user, req) {
  let form; try { form = await req.formData(); } catch { return err('نموذج الرفع غير صالح'); }
  const sourceFileId = parseInt(form.get('source_file_id'), 10), sourceLang = String(form.get('source_lang') || ''), targetLang = String(form.get('target_lang') || ''), file = form.get('file');
  const searchText = String(form.get('search_text') || '').trim().slice(0, 2_000_000);
  if (!Number.isFinite(sourceFileId) || !['ar','fr','en'].includes(sourceLang) || !allowedTargets(sourceLang).includes(targetLang)) return err('تحقق من الملف واتجاه الترجمة');
  if (!file || typeof file.arrayBuffer !== 'function' || !/\.docx$/i.test(file.name || '')) return err('ارفع ملف Word بصيغة DOCX');
  if (file.size > 25 * 1024 * 1024) return err('الحد الأقصى 25 ميغابايت', 413);
  const src = await env.DB.prepare('SELECT f.*, m.ark, m.type FROM files f JOIN materials m ON m.id=f.material_id WHERE f.id=?').bind(sourceFileId).first();
  if (!src || !['original','attachment'].includes(src.kind)) return err('الملف الأصل غير موجود أو غير صالح', 404);
  const existing = await env.DB.prepare('SELECT ft.*, f.r2_key FROM file_translations ft LEFT JOIN files f ON f.id=ft.translation_file_id WHERE ft.source_file_id=? AND ft.target_lang=?').bind(src.id, targetLang).first().catch(() => null);
  if (existing?.r2_key) await env.FILES.delete(existing.r2_key).catch(() => {});
  if (existing?.translation_file_id) await env.DB.prepare('DELETE FROM files WHERE id=?').bind(existing.translation_file_id).run().catch(() => {});
  let row; try { row = await putUpload(env, { materialId: src.material_id, ark: src.ark, type: src.type }, file, 'translation'); } catch (e) { return err(e.message || 'فشل الرفع'); }
  await setLang(env.DB, src.id, sourceLang); await setLang(env.DB, row.id, targetLang);
  await env.DB.prepare(`INSERT INTO file_translations (material_id, source_file_id, source_lang, target_lang, translation_file_id, status, search_text, updated_at) VALUES (?, ?, ?, ?, ?, 'ready', ?, datetime('now')) ON CONFLICT(source_file_id,target_lang) DO UPDATE SET translation_file_id=excluded.translation_file_id, source_lang=excluded.source_lang, status='ready', search_text=excluded.search_text, updated_at=datetime('now')`).bind(src.material_id, src.id, sourceLang, targetLang, row.id, searchText).run();
  await rebuildSearchBlob(env.DB, src.material_id).catch(() => {});
  await env.DB.prepare("UPDATE translation_requests SET status='done' WHERE source_file_id=? AND status='new'").bind(src.id).run().catch(() => {});
  await audit(env.DB, { userId: user.id, action: 'translation.upload', target: src.ark, detail: `${safeName(src.filename)} → ${targetLang}`, ip: clientIp(req) });
  return json({ ok: true, file: row, sourceLang, targetLang }, 201);
}

export async function translationFileLang(env, user, req, fileId, body) {
  const lang = String(body?.lang || ''); if (!FILE_LANGS.includes(lang)) return err('اللغة غير صالحة');
  const f = await env.DB.prepare('SELECT id FROM files WHERE id=?').bind(fileId).first(); if (!f) return err('الملف غير موجود', 404);
  await setLang(env.DB, fileId, lang); await audit(env.DB, { userId: user.id, action: 'translation.set_lang', target: `file:${fileId}`, detail: lang, ip: clientIp(req) }); return json({ ok: true, lang });
}

export async function translationDelete(env, user, req, id) {
  const ft = await env.DB.prepare('SELECT ft.*, f.r2_key, f.filename, m.ark FROM file_translations ft LEFT JOIN files f ON f.id=ft.translation_file_id LEFT JOIN materials m ON m.id=ft.material_id WHERE ft.id=?').bind(id).first(); if (!ft) return err('النظير غير موجود', 404);
  if (ft.r2_key) await env.FILES.delete(ft.r2_key).catch(() => {}); if (ft.translation_file_id) await env.DB.prepare('DELETE FROM files WHERE id=?').bind(ft.translation_file_id).run().catch(() => {}); await env.DB.prepare('DELETE FROM file_translations WHERE id=?').bind(id).run(); await rebuildSearchBlob(env.DB, ft.material_id).catch(() => {}); await audit(env.DB, { userId: user.id, action: 'translation.delete', target: ft.ark || String(id), detail: `${ft.filename || ''} (${ft.target_lang})`, ip: clientIp(req) }); return json({ ok: true });
}

export async function translationRequests(env, url) {
  const status = url.searchParams.get('status') || 'new', where = status === 'all' ? '' : 'WHERE r.status=?', binds = status === 'all' ? [] : [status];
  const rows = await env.DB.prepare(`SELECT r.*, m.ark, m.title_ar, m.title_orig, f.filename AS source_filename,
    COALESCE(NULLIF(r.requester_name, ''), u.display_name, u.username, 'زائر الموقع') AS requester_display_name,
    COALESCE(NULLIF(r.requester_email, ''), u.email, '') AS requester_contact_email,
    u.username AS requester_username
    FROM translation_requests r JOIN materials m ON m.id=r.material_id
    LEFT JOIN files f ON f.id=r.source_file_id
    LEFT JOIN admin_users u ON u.id=r.requester_id
    ${where} ORDER BY r.created_at DESC LIMIT 200`).bind(...binds).all().catch(() => ({ results: [] })); return json({ items: rows.results || [] });
}

export async function translationRequestUpdate(env, user, req, id, body) {
  const status = String(body?.status || ''); if (!['new','done','dismissed'].includes(status)) return err('الحالة غير صالحة'); const row = await env.DB.prepare('SELECT id FROM translation_requests WHERE id=?').bind(id).first(); if (!row) return err('الطلب غير موجود', 404); await env.DB.prepare('UPDATE translation_requests SET status=? WHERE id=?').bind(status, id).run(); await audit(env.DB, { userId: user.id, action: 'translation.request_update', target: `request:${id}`, detail: status, ip: clientIp(req) }); return json({ ok: true, status });
}
