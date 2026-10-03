// SIDJIL — ترجمة المحتوى داخل عارض المواد.
// Worker خفيف: النص هنا، أما OCR/PDF وإعادة بناء الملفات ففي خدمة FastAPI منفصلة.
import { getSessionUser, verifyCsrf } from './lib/auth.js';
import { getMaterialFull } from './lib/db.js';

const LANGS = new Set(['ar', 'fr', 'en']);
const JOB_STAGES = new Set(['QUEUED', 'ANALYZING', 'OCR_PROCESSING', 'EXTRACTING', 'TRANSLATING', 'REBUILDING', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELLED']);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}
const fail = (message, status = 400, code) => json({ error: message, ...(code ? { code } : {}) }, status);
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const id = () => crypto.randomUUID();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)))); }
function validLang(v, allowAuto = false) { return (allowAuto && v === 'auto') || LANGS.has(v); }
function pathNorm(p) { return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p; }
function constantTime(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export class TranslationProvider {
  constructor(env) { this.env = env; }
  async translate() { throw new Error('TRANSLATION_PROVIDER_NOT_IMPLEMENTED'); }
}

export class OllamaTranslationProvider extends TranslationProvider {
  async translate({ text, source, target }) {
    const serviceBase = String(this.env.TRANSLATION_SERVICE_URL || '').replace(/\/$/, '');
    if (!serviceBase) throw new Error('TRANSLATION_SERVICE_NOT_CONFIGURED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300000);
    try {
      const body = { q: text, source: source === 'auto' ? 'auto' : source, target, format: 'text' };
      const headers = { 'content-type': 'application/json', accept: 'application/json' };
      if (this.env.TRANSLATION_SERVICE_TOKEN) headers['X-Sidjil-Service-Token'] = this.env.TRANSLATION_SERVICE_TOKEN;
      const res = await fetch(`${serviceBase}/translate`, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) throw new Error(`TRANSLATION_PROVIDER_HTTP_${res.status}`);
      const data = await res.json();
      if (!data || typeof data.translatedText !== 'string') throw new Error('TRANSLATION_PROVIDER_INVALID_RESPONSE');
      return { translatedText: data.translatedText, source: data.detectedLanguage?.language || source, engine: 'ollama', model: data.model || 'qwen3:8b' };
    } finally { clearTimeout(timer); }
  }
}

async function settings(db) {
  const row = await db.prepare('SELECT * FROM translation_settings WHERE id = 1').first();
  return row || { enabled: 1, text_enabled: 1, document_enabled: 0, ocr_enabled: 0, guest_enabled: 1, max_text_chars: 12000, max_pdf_bytes: 52428800, max_pdf_pages: 300, max_active_jobs: 2, cache_enabled: 1, reuse_existing: 1, allow_force_retranslate: 0, maintenance_mode: 0 };
}

async function materialById(db, value, includeUnpublished = false) {
  const s = String(value || '');
  const suffix = includeUnpublished ? '' : " AND publish_status = 'published'";
  if (/^\d+$/.test(s)) return db.prepare(`SELECT * FROM materials WHERE id = ?${suffix}`).bind(Number(s)).first();
  return db.prepare(`SELECT * FROM materials WHERE ark = ?${suffix}`).bind(s).first();
}

async function publishedFile(db, materialId) {
  return db.prepare(`SELECT * FROM files WHERE material_id = ? AND (mime = 'application/pdf' OR filename LIKE '%.pdf') AND kind <> 'thumbnail' ORDER BY id LIMIT 1`).bind(materialId).first();
}

async function logUsage(db, job, event, userId = null) {
  try { await db.prepare('INSERT INTO translation_usage (job_id, event, content_hash, fingerprint, user_id) VALUES (?, ?, ?, ?, ?)').bind(job?.id || null, event, job?.content_hash || null, job?.fingerprint || null, userId).run(); } catch (_) {}
}

async function translationSettings(req, env) {
  const s = await settings(env.DB);
  return json({ enabled: !!s.enabled && !s.maintenance_mode, textEnabled: !!s.text_enabled, documentEnabled: !!s.document_enabled && !!env.TRANSLATION_SERVICE_URL, ocrEnabled: !!s.ocr_enabled && !!env.TRANSLATION_SERVICE_URL, guestEnabled: !!s.guest_enabled, maxTextChars: Number(s.max_text_chars), maxPdfBytes: Number(s.max_pdf_bytes), maxPdfPages: Number(s.max_pdf_pages), supportedLanguages: [...LANGS], sourceLanguages: ['auto', ...LANGS], provider: 'ollama', model: 'qwen3:8b', providerConfigured: !!env.TRANSLATION_SERVICE_URL, documentServiceConfigured: !!env.TRANSLATION_SERVICE_URL });
}

async function translateText(req, env) {
  const s = await settings(env.DB);
  if (!s.enabled || s.maintenance_mode || !s.text_enabled) return fail('ترجمة النصوص غير متاحة حاليًا', 503, 'TRANSLATION_DISABLED');
  const user = await getSessionUser(req, env);
  if (!user && !s.guest_enabled) return fail('تسجيل الدخول مطلوب لاستخدام الترجمة', 401, 'LOGIN_REQUIRED');
  let body; try { body = await req.json(); } catch (_) { return fail('بيانات الطلب غير صالحة'); }
  const text = String(body.text || '').trim();
  const source = String(body.source || 'auto');
  const target = String(body.target || 'ar');
  if (!text) return fail('أدخل نصًا للترجمة');
  if (text.length > Number(s.max_text_chars)) return fail(`النص يتجاوز الحد المسموح (${s.max_text_chars} حرف)`, 413, 'TEXT_TOO_LARGE');
  if (!validLang(source, true) || !validLang(target) || source === target) return fail('لغة المصدر أو الهدف غير صالحة');
  const contentHash = await sha256(text.replace(/\s+/g, ' ').trim());
  const fingerprint = await sha256(`${contentHash}|${source}|${target}|ollama|qwen3:8b|sidjil-qwen-v1|text`);
  const cached = await env.DB.prepare(`SELECT translated_text, source_language, target_language FROM translation_text_cache WHERE fingerprint = ?`).bind(fingerprint).first().catch(() => null);
  if (cached) { await env.DB.prepare('UPDATE translation_text_cache SET access_count = access_count + 1, last_accessed_at = datetime(\'now\') WHERE fingerprint = ?').bind(fingerprint).run().catch(() => {}); return json({ success: true, translatedText: cached.translated_text, source: cached.source_language, target: cached.target_language, cached: true }); }
  try {
    const result = await new OllamaTranslationProvider(env).translate({ text, source, target });
    await env.DB.prepare(`INSERT OR IGNORE INTO translation_text_cache (fingerprint, content_hash, source_language, target_language, engine, engine_version, original_text, translated_text) VALUES (?, ?, ?, ?, 'ollama', 'qwen3:8b', ?, ?)`).bind(fingerprint, contentHash, result.source || source, target, text, result.translatedText).run().catch(() => {});
    return json({ success: true, translatedText: result.translatedText, source: result.source || source, target, cached: false });
  } catch (e) { console.error('translation text provider error', e?.message || e); return fail('تعذر تنفيذ الترجمة الآن. حاول مرة أخرى لاحقًا.', 503, 'TRANSLATION_UNAVAILABLE'); }
}

async function ocrPage(req, env) {
  const s = await settings(env.DB);
  if (!s.enabled || s.maintenance_mode || !s.ocr_enabled) return fail('OCR غير متاح حاليًا', 503, 'OCR_DISABLED');
  const user = await getSessionUser(req, env);
  if (!user && !s.guest_enabled) return fail('تسجيل الدخول مطلوب لاستخدام OCR', 401, 'LOGIN_REQUIRED');
  if (!env.TRANSLATION_SERVICE_URL || !env.TRANSLATION_SERVICE_TOKEN) return fail('خدمة المعالجة غير مهيأة', 503, 'SERVICE_NOT_CONFIGURED');
  const source = String(req.headers.get('X-Sidjil-OCR-Source') || 'auto');
  if (!validLang(source, true)) return fail('لغة OCR غير صالحة');
  const length = Number(req.headers.get('content-length') || 0);
  if (length && length > 8 * 1024 * 1024) return fail('صورة الصفحة تتجاوز الحد المسموح', 413, 'IMAGE_TOO_LARGE');
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > 8 * 1024 * 1024) return fail('صورة الصفحة تتجاوز الحد المسموح', 413, 'IMAGE_TOO_LARGE');
  try {
    const base = String(env.TRANSLATION_SERVICE_URL).replace(/\/$/, '');
    const r = await fetch(`${base}/ocr`, { method: 'POST', headers: { 'content-type': req.headers.get('content-type') || 'image/png', 'content-length': String(bytes.byteLength), 'X-Sidjil-Service-Token': env.TRANSLATION_SERVICE_TOKEN, 'X-Sidjil-OCR-Source': source }, body: bytes });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return fail(data.detail || 'تعذر تشغيل OCR', r.status, 'OCR_FAILED');
    return json({ success: true, text: String(data.text || '') });
  } catch (_) { return fail('تعذر الاتصال بخدمة OCR', 503, 'OCR_UNAVAILABLE'); }
}

async function requestDocumentTranslation(req, env, value) {
  const s = await settings(env.DB);
  if (!s.enabled || s.maintenance_mode || !s.document_enabled) return fail('ترجمة المستندات غير مفعلة بعد', 503, 'DOCUMENT_TRANSLATION_DISABLED');
  const user = await getSessionUser(req, env);
  if (!user && !s.guest_enabled) return fail('تسجيل الدخول مطلوب لطلب ترجمة مستند', 401, 'LOGIN_REQUIRED');
  let body; try { body = await req.json(); } catch (_) { return fail('بيانات الطلب غير صالحة'); }
  const source = String(body.source || 'auto'); const target = String(body.target || 'ar');
  const mode = ['translated', 'bilingual', 'text'].includes(body.mode) ? body.mode : 'translated';
  const ocr = ['auto', 'advanced', 'off'].includes(body.ocr) ? body.ocr : 'auto';
  if (!validLang(source, true) || !validLang(target) || source === target) return fail('لغة المصدر أو الهدف غير صالحة');
  const m = await materialById(env.DB, value, user?.role === 'admin'); if (!m) return fail('المادة غير موجودة', 404);
  const file = await publishedFile(env.DB, m.id); if (!file) return fail('لا يوجد ملف PDF قابل للترجمة لهذه المادة', 400, 'PDF_NOT_FOUND');
  const hash = file.sha256 || await sha256(`${m.id}|${file.r2_key}|${file.size || 0}`);
  const baseFingerprint = await sha256(`${hash}|${source}|${target}|ollama|qwen3:8b|sidjil-qwen-v1|layout-preserving|v3|${mode}|${ocr}`);
  let fingerprint = baseFingerprint;
  const existing = await env.DB.prepare('SELECT * FROM translation_jobs WHERE fingerprint = ?').bind(baseFingerprint).first();
  if (existing && (existing.status === 'COMPLETED' || existing.status === 'QUEUED' || existing.status === 'ANALYZING' || existing.status === 'OCR_PROCESSING' || existing.status === 'EXTRACTING' || existing.status === 'TRANSLATING' || existing.status === 'REBUILDING' || existing.status === 'UPLOADING')) {
    await logUsage(env.DB, existing, existing.status === 'COMPLETED' ? 'cache_hit' : 'job_reused', user?.id);
    return json({ success: true, jobId: existing.id, status: existing.status, reused: true, progress: existing.progress, outputAvailable: existing.status === 'COMPLETED' }, existing.status === 'COMPLETED' ? 200 : 202);
  }
  if (existing && (existing.status === 'FAILED' || existing.status === 'CANCELLED')) {
    fingerprint = await sha256(`${baseFingerprint}|retry|${Date.now()}`);
  }
  const jobId = id();
  const inputKey = file.r2_key;
  try {
    await env.DB.prepare(`INSERT INTO translation_jobs (id, material_id, file_id, user_id, content_hash, fingerprint, source_language, target_language, engine, engine_version, pdf_engine, pdf_engine_version, output_mode, ocr_mode, input_key, status, current_stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ollama', 'qwen3:8b', 'sidjil-pdf', 'v3', ?, ?, ?, 'QUEUED', 'QUEUED')`).bind(jobId, m.id, file.id, user?.id || null, hash, fingerprint, source, target, mode, ocr, inputKey).run();
  } catch (e) {
    // UNIQUE fingerprint هو قفل deduplication؛ سباق الطلبات يعيد الـJob الفائز.
    const winner = await env.DB.prepare('SELECT * FROM translation_jobs WHERE fingerprint = ?').bind(fingerprint).first();
    if (winner) { await logUsage(env.DB, winner, 'job_reused', user?.id); return json({ success: true, jobId: winner.id, status: winner.status, reused: true, progress: winner.progress, outputAvailable: winner.status === 'COMPLETED' }, winner.status === 'COMPLETED' ? 200 : 202); }
    throw e;
  }
  await logUsage(env.DB, { id: jobId, content_hash: hash, fingerprint }, 'cache_miss', user?.id);
  if (env.TRANSLATION_SERVICE_URL) {
    const payload = { jobId, materialId: m.id, fileId: file.id, inputKey, contentHash: hash, fingerprint, source, target, mode, ocr,
      inputUrl: new URL(`/api/v1/translate/internal/jobs/${jobId}/input`, req.url).toString(),
      outputUrl: new URL(`/api/v1/translate/internal/jobs/${jobId}/output`, req.url).toString(),
      callback: new URL(`/api/v1/translate/internal/jobs/${jobId}`, req.url).toString() };
    const headers = { 'content-type': 'application/json' }; if (env.TRANSLATION_SERVICE_TOKEN) headers['X-Sidjil-Service-Token'] = env.TRANSLATION_SERVICE_TOKEN;
    try { const r = await fetch(`${String(env.TRANSLATION_SERVICE_URL).replace(/\/$/, '')}/jobs`, { method: 'POST', headers, body: JSON.stringify(payload) }); if (!r.ok) throw new Error(`service ${r.status}`); } catch (e) { await env.DB.prepare(`UPDATE translation_jobs SET status = 'FAILED', current_stage = 'FAILED', error_code = 'SERVICE_UNAVAILABLE', error_message = 'خدمة معالجة المستند غير متاحة', updated_at = datetime('now') WHERE id = ?`).bind(jobId).run(); return fail('تعذر إرسال المستند إلى خدمة المعالجة حاليًا.', 503, 'SERVICE_UNAVAILABLE'); }
  } else {
    await env.DB.prepare(`UPDATE translation_jobs SET status = 'FAILED', current_stage = 'FAILED', error_code = 'SERVICE_NOT_CONFIGURED', error_message = 'Translation service is not configured', updated_at = datetime('now') WHERE id = ?`).bind(jobId).run();
    return fail('خدمة ترجمة المستندات لم تُفعّل بعد. ترجمة النصوص متاحة الآن.', 503, 'SERVICE_NOT_CONFIGURED');
  }
  return json({ success: true, jobId, status: 'QUEUED', reused: false, progress: 0 }, 202);
}

async function listJobs(req, env) {
  const user = await getSessionUser(req, env); if (!user) return fail('تسجيل الدخول مطلوب', 401, 'LOGIN_REQUIRED');
  const rows = await env.DB.prepare(`SELECT id, material_id, file_id, source_language, target_language, output_mode, ocr_mode, status, progress, current_stage, error_code, created_at, updated_at, completed_at, output_mime, output_size FROM translation_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(user.id).all();
  return json({ jobs: rows.results || [] });
}

async function jobDetail(req, env, jobId) {
  const user = await getSessionUser(req, env);
  const job = await env.DB.prepare('SELECT * FROM translation_jobs WHERE id = ?').bind(jobId).first(); if (!job) return fail('الطلب غير موجود', 404);
  if (job.user_id && (!user || (user.id !== job.user_id && !['admin', 'super_admin'].includes(user.role)))) return fail('غير مصرح', 403);
  return json({ job: { ...job, output_key: undefined, input_key: undefined } });
}

async function downloadJob(req, env, jobId) {
  const user = await getSessionUser(req, env);
  const job = await env.DB.prepare('SELECT * FROM translation_jobs WHERE id = ?').bind(jobId).first(); if (!job) return fail('الطلب غير موجود', 404);
  if (job.user_id && (!user || (user.id !== job.user_id && !['admin', 'super_admin'].includes(user.role)))) return fail('غير مصرح', 403);
  if (job.status !== 'COMPLETED' || !job.output_key) return fail('الترجمة لم تكتمل بعد', 409);
  const obj = await env.FILES.get(job.output_key); if (!obj) return fail('ملف الترجمة غير موجود', 404);
  await env.DB.prepare('UPDATE translation_jobs SET access_count = access_count + 1, last_accessed_at = datetime(\'now\') WHERE id = ?').bind(jobId).run();
  const mime = job.output_mime || obj.httpMetadata?.contentType || 'application/pdf';
  const ext = mime.includes('text/plain') ? 'txt' : 'pdf';
  const h = new Headers({ 'content-type': mime, 'content-disposition': `attachment; filename="sidjil-translation.${ext}"`, 'cache-control': 'private, no-store' }); if (obj.size != null) h.set('content-length', String(obj.size));
  return new Response(obj.body, { headers: h });
}

async function internalUpdate(req, env, jobId) {
  if (!env.TRANSLATION_SERVICE_TOKEN || !constantTime(req.headers.get('X-Sidjil-Service-Token'), env.TRANSLATION_SERVICE_TOKEN)) return fail('غير مصرح', 401);
  let body; try { body = await req.json(); } catch (_) { return fail('بيانات غير صالحة'); }
  const status = String(body.status || ''); const progress = Math.max(0, Math.min(100, Number(body.progress) || 0)); const stage = JOB_STAGES.has(body.currentStage) ? body.currentStage : status;
  if (!JOB_STAGES.has(status)) return fail('حالة غير صالحة');
  const fields = ['status = ?', 'progress = ?', 'current_stage = ?', 'processed_pages = COALESCE(?, processed_pages)', 'page_count = COALESCE(?, page_count)', 'ocr_used = COALESCE(?, ocr_used)', 'updated_at = datetime(\'now\')']; const binds = [status, progress, stage, body.processedPages ?? null, body.pageCount ?? null, body.ocrUsed ?? null];
  if (body.outputKey) { fields.push('output_key = ?', 'output_mime = ?', 'output_size = ?'); binds.push(String(body.outputKey), body.outputMime || 'application/pdf', body.outputSize || null); }
  if (body.errorCode) { fields.push('error_code = ?', 'error_message = ?'); binds.push(String(body.errorCode), String(body.errorMessage || '')); }
  if (status === 'COMPLETED') fields.push("completed_at = datetime('now')");
  binds.push(jobId); await env.DB.prepare(`UPDATE translation_jobs SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
  await env.DB.prepare('INSERT INTO translation_events (job_id, stage, progress, detail) VALUES (?, ?, ?, ?)').bind(jobId, stage, progress, body.detail || null).run().catch(() => {});
  return json({ success: true });
}

async function internalInput(req, env, jobId) {
  if (!env.TRANSLATION_SERVICE_TOKEN || !constantTime(req.headers.get('X-Sidjil-Service-Token'), env.TRANSLATION_SERVICE_TOKEN)) return fail('غير مصرح', 401);
  const job = await env.DB.prepare('SELECT input_key FROM translation_jobs WHERE id = ?').bind(jobId).first();
  if (!job?.input_key) return fail('ملف الإدخال غير موجود', 404);
  const obj = await env.FILES.get(job.input_key);
  if (!obj) return fail('ملف الإدخال غير موجود', 404);
  const h = new Headers({ 'cache-control': 'private, no-store', 'content-type': obj.httpMetadata?.contentType || 'application/pdf' });
  if (obj.size != null) h.set('content-length', String(obj.size));
  return new Response(obj.body, { headers: h });
}

async function internalOutput(req, env, jobId) {
  if (!env.TRANSLATION_SERVICE_TOKEN || !constantTime(req.headers.get('X-Sidjil-Service-Token'), env.TRANSLATION_SERVICE_TOKEN)) return fail('غير مصرح', 401);
  const job = await env.DB.prepare('SELECT fingerprint FROM translation_jobs WHERE id = ?').bind(jobId).first();
  if (!job?.fingerprint) return fail('الطلب غير موجود', 404);
  const len = Number(req.headers.get('content-length') || 0);
  const max = Number((await settings(env.DB)).max_pdf_bytes || 52428800) * 2;
  if (len && len > max) return fail('ملف الإخراج يتجاوز الحد المسموح', 413, 'OUTPUT_TOO_LARGE');
  const mime = String(req.headers.get('content-type') || 'application/pdf').split(';')[0].toLowerCase();
  const ext = mime.includes('text/plain') ? 'txt' : 'pdf';
  const key = `translations/shared/${job.fingerprint}/translated.${ext}`;
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > max) return fail('ملف الإخراج يتجاوز الحد المسموح', 413, 'OUTPUT_TOO_LARGE');
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
  return json({ success: true, outputKey: key, outputMime: mime, outputSize: bytes.byteLength });
}

export async function routeTranslationApi(req, env) {
  const path = pathNorm(new URL(req.url).pathname);
  if (path === '/api/v1/translate/settings' && req.method === 'GET') return translationSettings(req, env);
  if (path === '/api/v1/translate/text' && req.method === 'POST') return translateText(req, env);
  if (path === '/api/v1/translate/ocr-page' && req.method === 'POST') return ocrPage(req, env);
  if (path === '/api/v1/translate/document' && req.method === 'POST') return fail('استخدم ترجمة المادة من عارضها', 410, 'USE_DOCUMENT_TRANSLATION');
  let m = path.match(/^\/api\/v1\/documents\/([^/]+)\/translations$/);
  if (m && req.method === 'GET') {
    const material = await materialById(env.DB, decodeURIComponent(m[1])); if (!material) return fail('المادة غير موجودة', 404);
    const rows = await env.DB.prepare(`SELECT id, source_language, target_language, output_mode, ocr_mode, status, progress, created_at, completed_at, output_mime, output_size FROM translation_jobs WHERE material_id = ? AND status = 'COMPLETED' ORDER BY completed_at DESC`).bind(material.id).all(); return json({ translations: rows.results || [] });
  }
  if (m && req.method === 'POST') return requestDocumentTranslation(req, env, decodeURIComponent(m[1]));
  m = path.match(/^\/api\/v1\/translate\/jobs\/([^/]+)\/download$/); if (m && req.method === 'GET') return downloadJob(req, env, decodeURIComponent(m[1]));
  m = path.match(/^\/api\/v1\/translate\/jobs\/([^/]+)$/); if (m && req.method === 'GET') return jobDetail(req, env, decodeURIComponent(m[1]));
  if (path === '/api/v1/translate/jobs' && req.method === 'GET') return listJobs(req, env);
  m = path.match(/^\/api\/v1\/translate\/internal\/jobs\/([^/]+)$/); if (m && req.method === 'PATCH') return internalUpdate(req, env, decodeURIComponent(m[1]));
  m = path.match(/^\/api\/v1\/translate\/internal\/jobs\/([^/]+)\/input$/); if (m && req.method === 'GET') return internalInput(req, env, decodeURIComponent(m[1]));
  m = path.match(/^\/api\/v1\/translate\/internal\/jobs\/([^/]+)\/output$/); if (m && req.method === 'PUT') return internalOutput(req, env, decodeURIComponent(m[1]));
  return null;
}
