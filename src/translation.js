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


// ---------- مسرد المصطلحات: حماية المصطلحات قبل الترجمة واستعادتها بعدها ----------
async function loadGlossary(db, source, target) {
  try {
    const rows = await db.prepare(
      'SELECT source_term, target_term FROM glossary WHERE source_lang = ? AND target_lang = ? ORDER BY length(source_term) DESC LIMIT 500'
    ).bind(source, target).all();
    return rows.results || [];
  } catch { return []; }
}
function protectGlossaryTerms(text, terms) {
  let out = String(text);
  const map = [];
  terms.forEach((t, i) => {
    const src = String(t.source_term || '');
    if (src && out.includes(src)) {
      out = out.split(src).join(`\uE000${i}\uE001`);
      map[i] = String(t.target_term || src);
    }
  });
  return { text: out, map };
}
function restoreGlossaryTerms(text, map) {
  let out = String(text);
  map.forEach((target, i) => {
    if (target !== undefined) out = out.split(`\uE000${i}\uE001`).join(target);
  });
  return out;
}

// Preserve data that must survive translation byte-for-byte. Translation
// models sometimes omit years, page numbers, archive references or URLs when
// they are embedded in prose. Private-use markers keep those tokens out of
// the model's linguistic decisions and are restored after the response.
function protectImmutableTokens(text) {
  const map = [];
  const pattern = /(https?:\/\/[^\s]+|[\p{N}]+(?:[\s./:–—-]+[\p{N}]+)*)/gu;
  const protectedText = String(text).replace(pattern, (token) => {
    const index = map.push(token) - 1;
    return `\uE100${index}\uE101`;
  });
  return { text: protectedText, map };
}

function restoreImmutableTokens(text, map) {
  let out = String(text);
  map.forEach((token, index) => {
    out = out.split(`\uE100${index}\uE101`).join(token);
  });
  return out;
}
async function glossaryFingerprint(db, source, target) {
  const terms = await loadGlossary(db, source, target);
  if (!terms.length) return 'noglossary';
  return sha256(terms.map(t => `${t.source_term}=${t.target_term}`).join('|'));
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
  if (user && !verifyCsrf(user, req)) return fail('رمز CSRF غير صالح أو مفقود', 403, 'CSRF_INVALID');
  if (!user && !s.guest_enabled) return fail('تسجيل الدخول مطلوب لاستخدام الترجمة', 401, 'LOGIN_REQUIRED');
  let body; try { body = await req.json(); } catch (_) { return fail('بيانات الطلب غير صالحة'); }
  const text = String(body.text || '').trim();
  const source = String(body.source || 'auto');
  const target = String(body.target || 'ar');
  if (!text) return fail('أدخل نصًا للترجمة');
  if (text.length > Number(s.max_text_chars)) return fail(`النص يتجاوز الحد المسموح (${s.max_text_chars} حرف)`, 413, 'TEXT_TOO_LARGE');
  if (!validLang(source, true) || !validLang(target) || source === target) return fail('لغة المصدر أو الهدف غير صالحة');
  const contentHash = await sha256(text.replace(/\s+/g, ' ').trim());
  const glossFp = await glossaryFingerprint(env.DB, source, target);
  const fingerprint = await sha256(`${contentHash}|${source}|${target}|ollama|qwen3:8b|sidjil-qwen-v1|text|${glossFp}`);
  const cached = await env.DB.prepare(`SELECT translated_text, source_language, target_language FROM translation_text_cache WHERE fingerprint = ?`).bind(fingerprint).first().catch(() => null);
  if (cached) { await env.DB.prepare('UPDATE translation_text_cache SET access_count = access_count + 1, last_accessed_at = datetime(\'now\') WHERE fingerprint = ?').bind(fingerprint).run().catch(() => {}); return json({ success: true, translatedText: cached.translated_text, source: cached.source_language, target: cached.target_language, cached: true }); }
  try {
    const glossaryTerms = await loadGlossary(env.DB, source, target);
    const protected_ = protectGlossaryTerms(text, glossaryTerms);
    const result = await new OllamaTranslationProvider(env).translate({ text: protected_.text, source, target });
    result.translatedText = restoreGlossaryTerms(result.translatedText, protected_.map);
    await env.DB.prepare(`INSERT OR IGNORE INTO translation_text_cache (fingerprint, content_hash, source_language, target_language, engine, engine_version, original_text, translated_text) VALUES (?, ?, ?, ?, 'ollama', 'qwen3:8b', ?, ?)`).bind(fingerprint, contentHash, result.source || source, target, text, result.translatedText).run().catch(() => {});
    return json({ success: true, translatedText: result.translatedText, source: result.source || source, target, cached: false });
  } catch (e) { console.error('translation text provider error', e?.message || e); return fail('تعذر تنفيذ الترجمة الآن. حاول مرة أخرى لاحقًا.', 503, 'TRANSLATION_UNAVAILABLE'); }
}

async function ocrPage(req, env) {
  const s = await settings(env.DB);
  if (!s.enabled || s.maintenance_mode || !s.ocr_enabled) return fail('OCR غير متاح حاليًا', 503, 'OCR_DISABLED');
  const user = await getSessionUser(req, env);
  if (user && !verifyCsrf(user, req)) return fail('رمز CSRF غير صالح أو مفقود', 403, 'CSRF_INVALID');
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
  if (user && !verifyCsrf(user, req)) return fail('رمز CSRF غير صالح أو مفقود', 403, 'CSRF_INVALID');
  if (!user && !s.guest_enabled) return fail('تسجيل الدخول مطلوب لطلب ترجمة مستند', 401, 'LOGIN_REQUIRED');
  let body; try { body = await req.json(); } catch (_) { return fail('بيانات الطلب غير صالحة'); }
  const source = String(body.source || 'auto'); const target = String(body.target || 'ar');
  const mode = ['translated', 'bilingual', 'text'].includes(body.mode) ? body.mode : 'translated';
  const ocr = ['auto', 'advanced', 'off'].includes(body.ocr) ? body.ocr : 'auto';
  if (!validLang(source, true) || !validLang(target) || source === target) return fail('لغة المصدر أو الهدف غير صالحة');
  const m = await materialById(env.DB, value, user?.role === 'admin'); if (!m) return fail('المادة غير موجودة', 404);
  const file = await publishedFile(env.DB, m.id); if (!file) return fail('لا يوجد ملف PDF قابل للترجمة لهذه المادة', 400, 'PDF_NOT_FOUND');
  const hash = file.sha256 || await sha256(`${m.id}|${file.r2_key}|${file.size || 0}`);
  // v4 invalidates cached document exports created before the selectable-text
  // reader and SIDJIL watermark were introduced.
  const baseFingerprint = await sha256(`${hash}|${source}|${target}|ollama|qwen3:8b|sidjil-qwen-v1|layout-preserving|v4|${mode}|${ocr}`);
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
    await env.DB.prepare(`INSERT INTO translation_jobs (id, material_id, file_id, user_id, content_hash, fingerprint, source_language, target_language, engine, engine_version, pdf_engine, pdf_engine_version, output_mode, ocr_mode, input_key, status, current_stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ollama', 'qwen3:8b', 'sidjil-pdf', 'v4', ?, ?, ?, 'QUEUED', 'QUEUED')`).bind(jobId, m.id, file.id, user?.id || null, hash, fingerprint, source, target, mode, ocr, inputKey).run();
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

function pageLanguageDirection(lang) {
  return String(lang || '').toLowerCase() === 'ar' ? 'rtl' : 'ltr';
}

async function ensureTranslationDocument(db, material, file, source, target, mode, pageCount, userId) {
  let document = await db.prepare('SELECT * FROM translation_documents WHERE material_id = ? AND source_file_id = ? AND source_language = ? AND target_language = ? AND output_mode = ?')
    .bind(material.id, file.id, source, target, mode).first();
  if (!document) {
    const documentId = id();
    await db.prepare(`INSERT OR IGNORE INTO translation_documents
      (id, material_id, source_file_id, source_language, target_language, output_mode, status, page_count, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?)`)
      .bind(documentId, material.id, file.id, source, target, mode, Number(pageCount) || null, userId || null).run();
    document = await db.prepare('SELECT * FROM translation_documents WHERE material_id = ? AND source_file_id = ? AND source_language = ? AND target_language = ? AND output_mode = ?')
      .bind(material.id, file.id, source, target, mode).first();
  }
  return document;
}

// A browser can be closed while a page request is in flight.  Keep completed
// pages intact, release only the interrupted work, and expose a resumable
// state instead of leaving the document apparently running forever.
async function recoverStaleTranslationDocuments(db) {
  try {
    const stale = await db.prepare(`SELECT id FROM translation_documents
      WHERE status IN ('RUNNING', 'QUEUED')
        AND COALESCE(heartbeat_at, updated_at) < datetime('now', '-20 minutes')
      LIMIT 50`).all();
    const rows = stale.results || [];
    for (const row of rows) {
      await db.batch([
        db.prepare(`UPDATE translation_pages SET status = 'pending', progress = 0,
          error_code = 'STALE_HEARTBEAT', error_message = 'أعيد فتح الصفحة للاستئناف بعد انقطاع الجلسة',
          updated_at = datetime('now') WHERE document_id = ? AND status = 'processing'`).bind(row.id),
        db.prepare(`UPDATE translation_documents SET status = 'PAUSED',
          error_code = 'STALE_HEARTBEAT', error_message = 'توقفت مؤقتًا بسبب انقطاع الجلسة ويمكن استئنافها',
          last_error_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status IN ('RUNNING','QUEUED')`).bind(row.id),
      ]);
    }
    return rows.length;
  } catch (_) {
    // The additive migration may not have reached a local preview yet. The
    // request remains usable there; production runs with the new columns.
    return 0;
  }
}

async function touchTranslationDocument(db, documentId, fields = {}) {
  const sets = ['updated_at = datetime(\'now\')', 'heartbeat_at = datetime(\'now\')'];
  const binds = [];
  if (fields.status) { sets.push('status = ?'); binds.push(fields.status); }
  if (fields.errorCode !== undefined) { sets.push('error_code = ?'); binds.push(fields.errorCode); }
  if (fields.errorMessage !== undefined) { sets.push('error_message = ?'); binds.push(fields.errorMessage); }
  if (fields.completedAt) sets.push('completed_at = datetime(\'now\')');
  binds.push(documentId);
  await db.prepare(`UPDATE translation_documents SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
}

async function refreshTranslationProgress(db, documentId, pageCount = null) {
  const complete = await db.prepare("SELECT COUNT(*) AS c FROM translation_pages WHERE document_id = ? AND status = 'completed'").bind(documentId).first();
  const failed = await db.prepare("SELECT COUNT(*) AS c FROM translation_pages WHERE document_id = ? AND status = 'failed'").bind(documentId).first();
  const document = await db.prepare('SELECT page_count, status FROM translation_documents WHERE id = ?').bind(documentId).first();
  const count = Number(document?.page_count || pageCount || 0);
  const completedPages = Number(complete?.c || 0);
  const progress = count > 0 ? Math.min(100, Math.round((completedPages / count) * 100)) : 0;
  const status = document?.status === 'CANCELLED' ? 'CANCELLED' : (count > 0 && completedPages >= count ? 'COMPLETED' : (Number(failed?.c || 0) ? 'PAUSED' : 'RUNNING'));
  await db.prepare(`UPDATE translation_documents SET status = ?, completed_pages = ?, progress = ?,
    updated_at = datetime('now'), heartbeat_at = datetime('now'),
    completed_at = CASE WHEN ? = 'COMPLETED' THEN datetime('now') ELSE completed_at END
    WHERE id = ?`).bind(status, completedPages, progress, status, documentId).run();
  return { status, completedPages, progress };
}

function batchPageMarker(index) {
  return `SIDJIL_PAGE_BREAK_${String.fromCharCode(65 + index)}`;
}

async function pageTranslationBatch(req, env, value) {
  const s = await settings(env.DB);
  if (!s.enabled || s.maintenance_mode || !s.text_enabled) return fail('الترجمة غير متاحة حاليًا', 503, 'TRANSLATION_DISABLED');
  const user = await getSessionUser(req, env);
  if (user && !verifyCsrf(user, req)) return fail('رمز CSRF غير صالح أو مفقود', 403, 'CSRF_INVALID');
  if (!user && !s.guest_enabled) return fail('تسجيل الدخول مطلوب لاستخدام الترجمة', 401, 'LOGIN_REQUIRED');
  await recoverStaleTranslationDocuments(env.DB);
  let body;
  try { body = await req.json(); } catch (_) { return fail('بيانات الطلب غير صالحة'); }
  const source = String(body.source || 'auto');
  const target = String(body.target || 'ar');
  const mode = ['translated', 'bilingual', 'text'].includes(body.mode) ? body.mode : 'text';
  if (!validLang(source, true) || !validLang(target) || source === target) return fail('لغة المصدر أو الهدف غير صالحة');
  if (!Array.isArray(body.pages) || body.pages.length < 1 || body.pages.length > 4) return fail('عدد صفحات الدفعة غير صالح', 400, 'INVALID_BATCH_SIZE');
  const pages = body.pages.map((item) => ({
    page_number: Number(item?.page_number),
    source_text: String(item?.source_text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
  }));
  if (pages.some((item) => !Number.isInteger(item.page_number) || item.page_number < 1 || item.page_number > 3000)) return fail('رقم الصفحة غير صالح', 400, 'INVALID_PAGE');
  if (new Set(pages.map((item) => item.page_number)).size !== pages.length) return fail('تكرار رقم الصفحة في الدفعة', 400, 'DUPLICATE_PAGE');
  const maxPageChars = Number(s.max_text_chars || 12000);
  if (pages.some((item) => item.source_text.length > maxPageChars)) return fail('نص إحدى الصفحات يتجاوز الحد المسموح', 413, 'PAGE_TOO_LARGE');
  const pendingInput = pages.filter((item) => item.source_text);
  if (!pendingInput.length) return fail('نص الصفحات فارغ', 400, 'EMPTY_PAGE');
  const batchChars = pendingInput.reduce((sum, item) => sum + item.source_text.length, 0);
  if (batchChars > Math.min(maxPageChars * 2, 18000)) return fail('حجم دفعة الصفحات كبير', 413, 'BATCH_TOO_LARGE');
  const material = await materialById(env.DB, value);
  if (!material) return fail('المادة غير موجودة', 404, 'MATERIAL_NOT_FOUND');
  const file = await publishedFile(env.DB, material.id);
  if (!file) return fail('لا يوجد ملف PDF لهذه المادة', 400, 'PDF_NOT_FOUND');
  const document = await ensureTranslationDocument(env.DB, material, file, source, target, mode, body.page_count, user?.id);
  if (!document) return fail('تعذر إنشاء سجل الترجمة', 500, 'TRANSLATION_DOCUMENT_CREATE_FAILED');
  if (['PAUSED', 'CANCELLED'].includes(String(document.status))) return fail('ترجمة هذا المستند متوقفة', 409, 'TRANSLATION_PAUSED');

  const results = [];
  const pending = [];
  for (const item of pages) {
    const sourceHash = await sha256(`${file.sha256 || file.r2_key}|${item.page_number}|${item.source_text}`);
    const row = await env.DB.prepare('SELECT * FROM translation_pages WHERE document_id = ? AND page_number = ?').bind(document.id, item.page_number).first();
    if (row?.status === 'completed' && row.source_hash === sourceHash && row.translated_text) {
      results.push({ page_number: item.page_number, source_hash: sourceHash, translated_text: row.translated_text, status: 'completed', progress: 100, direction: row.direction || pageLanguageDirection(target), cached: true });
    } else if (item.source_text) {
      pending.push({ ...item, sourceHash });
    }
  }
  if (pending.length) {
    const combined = pending.map((item, index) => `${batchPageMarker(index)}\n${item.source_text}`).join('\n\n');
    const immutable = protectImmutableTokens(combined);
    const glossaryTerms = await loadGlossary(env.DB, source, target);
    const protected_ = protectGlossaryTerms(immutable.text, glossaryTerms);
    try {
      const result = await new OllamaTranslationProvider(env).translate({ text: protected_.text, source, target });
      const translated = restoreImmutableTokens(restoreGlossaryTerms(result.translatedText, protected_.map), immutable.map);
      const segments = pending.map((item, index) => {
        const marker = batchPageMarker(index);
        const start = translated.indexOf(marker);
        if (start < 0) return null;
        const nextMarkers = pending.slice(index + 1).map((_, nextIndex) => translated.indexOf(batchPageMarker(index + nextIndex + 1), start + marker.length)).filter((position) => position >= 0);
        const end = nextMarkers.length ? Math.min(...nextMarkers) : translated.length;
        return { item, text: translated.slice(start + marker.length, end).trim() };
      });
      if (segments.some((segment) => !segment || !segment.text)) throw new Error('BATCH_PAGE_MARKER_LOST');
      for (const segment of segments) {
        const { item, text } = segment;
        await env.DB.prepare(`INSERT OR REPLACE INTO translation_pages
          (document_id, page_number, source_hash, source_text, translated_text, direction, status, progress, error_code, error_message, updated_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, 'completed', 100, NULL, NULL, datetime('now'), datetime('now'))`)
          .bind(document.id, item.page_number, item.sourceHash, item.source_text, text, pageLanguageDirection(target)).run();
        await env.DB.prepare(`INSERT OR REPLACE INTO translation_page_segments
          (page_id, sequence_number, source_text, translated_text, kind, direction)
          SELECT id, 1, ?, ?, 'page', ? FROM translation_pages WHERE document_id = ? AND page_number = ?`)
          .bind(item.source_text, text, pageLanguageDirection(target), document.id, item.page_number).run().catch(() => {});
        results.push({ page_number: item.page_number, source_hash: item.sourceHash, translated_text: text, status: 'completed', progress: 100, direction: pageLanguageDirection(target), cached: false });
      }
    } catch (e) {
      // The client can fall back to the single-page route if a model ever
      // drops a batch marker; no partially translated page is persisted.
      return fail('تعذر ترجمة دفعة الصفحات الآن', 503, 'PAGE_BATCH_UNAVAILABLE');
    }
  }
  results.sort((a, b) => a.page_number - b.page_number);
  const complete = await env.DB.prepare("SELECT COUNT(*) AS c FROM translation_pages WHERE document_id = ? AND status = 'completed'").bind(document.id).first();
  const completedPages = Number(complete?.c || 0);
  const pageCount = Number(document.page_count || body.page_count || 0);
  const progress = pageCount > 0 ? Math.min(100, Math.round((completedPages / pageCount) * 100)) : 0;
  await env.DB.prepare(`UPDATE translation_documents SET status = ?, completed_pages = ?, progress = ?, page_count = COALESCE(page_count, ?), updated_at = datetime('now'), heartbeat_at = datetime('now'), error_code = NULL, error_message = NULL WHERE id = ?`)
    .bind(pageCount > 0 && completedPages >= pageCount ? 'COMPLETED' : 'RUNNING', completedPages, progress, pageCount || null, document.id).run();
  return json({ success: true, cached: results.every((item) => item.cached), documentId: document.id, pages: results, direction: pageLanguageDirection(target) });
}

async function pageTranslation(req, env, value, pageNumber) {
  const s = await settings(env.DB);
  if (!s.enabled || s.maintenance_mode || !s.text_enabled) return fail('الترجمة غير متاحة حاليًا', 503, 'TRANSLATION_DISABLED');
  const user = await getSessionUser(req, env);
  if (user && !verifyCsrf(user, req)) return fail('رمز CSRF غير صالح أو مفقود', 403, 'CSRF_INVALID');
  if (!user && !s.guest_enabled) return fail('تسجيل الدخول مطلوب لاستخدام الترجمة', 401, 'LOGIN_REQUIRED');
  await recoverStaleTranslationDocuments(env.DB);
  const page = Number(pageNumber);
  if (!Number.isInteger(page) || page < 1 || page > 3000) return fail('رقم الصفحة غير صالح', 400, 'INVALID_PAGE');
  let body;
  try { body = await req.json(); } catch (_) { return fail('بيانات الطلب غير صالحة'); }
  const sourceText = String(body.source_text || '').replace(/\r\n/g, '\n').trim();
  const source = String(body.source || 'auto');
  const target = String(body.target || 'ar');
  const mode = ['translated', 'bilingual', 'text'].includes(body.mode) ? body.mode : 'translated';
  if (!sourceText) return fail('نص الصفحة فارغ', 400, 'EMPTY_PAGE');
  if (sourceText.length > Number(s.max_text_chars || 12000)) return fail('نص الصفحة يتجاوز الحد المسموح', 413, 'PAGE_TOO_LARGE');
  if (!validLang(source, true) || !validLang(target) || source === target) return fail('لغة المصدر أو الهدف غير صالحة');
  const material = await materialById(env.DB, value);
  if (!material) return fail('المادة غير موجودة', 404, 'MATERIAL_NOT_FOUND');
  const file = await publishedFile(env.DB, material.id);
  if (!file) return fail('لا يوجد ملف PDF لهذه المادة', 400, 'PDF_NOT_FOUND');
  const sourceHash = await sha256(`${file.sha256 || file.r2_key}|${page}|${sourceText}`);
  const docFingerprint = await sha256(`${material.id}|${file.id}|${source}|${target}|${mode}`);
  let document = await env.DB.prepare('SELECT * FROM translation_documents WHERE material_id = ? AND source_file_id = ? AND source_language = ? AND target_language = ? AND output_mode = ?')
    .bind(material.id, file.id, source, target, mode).first();
  if (!document) {
    const documentId = id();
    await env.DB.prepare(`INSERT OR IGNORE INTO translation_documents
      (id, material_id, source_file_id, source_language, target_language, output_mode, status, page_count, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?)`)
      .bind(documentId, material.id, file.id, source, target, mode, Number(body.page_count) || null, user?.id || null).run();
    document = await env.DB.prepare('SELECT * FROM translation_documents WHERE material_id = ? AND source_file_id = ? AND source_language = ? AND target_language = ? AND output_mode = ?')
      .bind(material.id, file.id, source, target, mode).first();
  }
  if (!document) return fail('تعذر إنشاء سجل الترجمة', 500, 'TRANSLATION_DOCUMENT_CREATE_FAILED');
  if (['PAUSED', 'CANCELLED'].includes(String(document.status))) return fail('ترجمة هذا المستند متوقفة', 409, 'TRANSLATION_PAUSED');
  let row = await env.DB.prepare('SELECT * FROM translation_pages WHERE document_id = ? AND page_number = ?').bind(document.id, page).first();
  if (row?.status === 'completed' && row.source_hash === sourceHash && row.translated_text) {
    return json({ success: true, cached: true, documentId: document.id, page: { ...row, source_text: undefined }, direction: pageLanguageDirection(target) });
  }
  if (!row) {
    await env.DB.prepare(`INSERT INTO translation_pages (document_id, page_number, source_hash, source_text, status, progress)
      VALUES (?, ?, ?, ?, 'processing', 10)`).bind(document.id, page, sourceHash, sourceText).run();
  } else {
    await env.DB.prepare(`UPDATE translation_pages SET source_hash = ?, source_text = ?, translated_text = NULL,
      status = 'processing', progress = 10, attempts = attempts + 1, error_code = NULL, error_message = NULL,
      updated_at = datetime('now'), completed_at = NULL WHERE id = ?`).bind(sourceHash, sourceText, row.id).run();
  }
  try {
    const immutable = protectImmutableTokens(sourceText);
    const glossaryTerms = await loadGlossary(env.DB, source, target);
    const protected_ = protectGlossaryTerms(immutable.text, glossaryTerms);
    const result = await new OllamaTranslationProvider(env).translate({ text: protected_.text, source, target });
    const withGlossary = restoreGlossaryTerms(result.translatedText, protected_.map);
    const translatedText = restoreImmutableTokens(withGlossary, immutable.map);
    const latest = await env.DB.prepare('SELECT id FROM translation_pages WHERE document_id = ? AND page_number = ?').bind(document.id, page).first();
    if (!latest) return fail('تعذر حفظ صفحة الترجمة', 500, 'PAGE_NOT_FOUND');
    await env.DB.prepare(`UPDATE translation_pages SET translated_text = ?, direction = ?, status = 'completed', progress = 100,
      updated_at = datetime('now'), completed_at = datetime('now'), error_code = NULL, error_message = NULL WHERE id = ?`)
      .bind(translatedText, pageLanguageDirection(target), latest.id).run();
    const complete = await env.DB.prepare("SELECT COUNT(*) AS c FROM translation_pages WHERE document_id = ? AND status = 'completed'").bind(document.id).first();
    const completedPages = Number(complete?.c || 0);
    const pageCount = Number(document.page_count || body.page_count || 0);
    const progress = pageCount > 0 ? Math.min(100, Math.round((completedPages / pageCount) * 100)) : 0;
     await env.DB.prepare(`UPDATE translation_documents SET status = ?, completed_pages = ?, progress = ?,
      page_count = COALESCE(page_count, ?), updated_at = datetime('now'), completed_at = CASE WHEN ? > 0 AND ? >= ? THEN datetime('now') ELSE completed_at END
       , heartbeat_at = datetime('now'), error_code = NULL, error_message = NULL WHERE id = ?`)
      .bind(pageCount > 0 && completedPages >= pageCount ? 'COMPLETED' : 'RUNNING', completedPages, progress, pageCount || null, completedPages, completedPages, pageCount || 0, document.id).run();
    await env.DB.prepare(`INSERT OR REPLACE INTO translation_page_segments
      (page_id, sequence_number, source_text, translated_text, kind, direction)
      SELECT id, 1, ?, ?, 'page', ? FROM translation_pages WHERE document_id = ? AND page_number = ?`)
      .bind(sourceText, translatedText, pageLanguageDirection(target), document.id, page).run().catch(() => {});
    return json({ success: true, cached: false, documentId: document.id, page: { page_number: page, source_hash: sourceHash, translated_text: translatedText, status: 'completed', progress: 100, direction: pageLanguageDirection(target) }, direction: pageLanguageDirection(target) });
  } catch (e) {
    await env.DB.prepare(`UPDATE translation_pages SET status = 'failed', progress = 0, error_code = ?, error_message = ?, updated_at = datetime('now') WHERE document_id = ? AND page_number = ?`)
      .bind('PAGE_TRANSLATION_FAILED', String(e?.message || 'تعذر تنفيذ الترجمة').slice(0, 500), document.id, page).run().catch(() => {});
    await touchTranslationDocument(env.DB, document.id, { status: 'PAUSED', errorCode: 'PAGE_TRANSLATION_FAILED', errorMessage: String(e?.message || 'تعذر تنفيذ الترجمة').slice(0, 500) }).catch(() => {});
    return fail('تعذر ترجمة هذه الصفحة الآن. حاول مرة أخرى لاحقًا.', 503, 'PAGE_TRANSLATION_UNAVAILABLE');
  }
}

async function getTranslatedPage(req, env, value, pageNumber) {
  await recoverStaleTranslationDocuments(env.DB);
  const page = Number(pageNumber);
  if (!Number.isInteger(page) || page < 1) return fail('رقم الصفحة غير صالح', 400, 'INVALID_PAGE');
  const material = await materialById(env.DB, value);
  if (!material) return fail('المادة غير موجودة', 404, 'MATERIAL_NOT_FOUND');
  const url = new URL(req.url);
  const source = String(url.searchParams.get('source') || 'auto');
  const target = String(url.searchParams.get('target') || 'ar');
  const mode = ['translated', 'bilingual', 'text'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'translated';
  const file = await publishedFile(env.DB, material.id);
  if (!file) return fail('لا يوجد ملف PDF لهذه المادة', 400, 'PDF_NOT_FOUND');
  const document = await env.DB.prepare('SELECT id, status, page_count, progress, completed_pages FROM translation_documents WHERE material_id = ? AND source_file_id = ? AND source_language = ? AND target_language = ? AND output_mode = ?')
    .bind(material.id, file.id, source, target, mode).first();
  if (!document) return json({ success: true, page: null, document: null });
  const row = await env.DB.prepare('SELECT page_number, source_hash, translated_text, direction, status, progress, error_code FROM translation_pages WHERE document_id = ? AND page_number = ?').bind(document.id, page).first();
  return json({ success: true, document, page: row || null });
}

async function translationDocumentControl(req, env, documentId, action) {
  const user = await getSessionUser(req, env);
  if (!user) return fail('تسجيل الدخول مطلوب', 401, 'LOGIN_REQUIRED');
  if (!verifyCsrf(user, req)) return fail('رمز CSRF غير صالح أو مفقود', 403, 'CSRF_INVALID');
  await recoverStaleTranslationDocuments(env.DB);
  const row = await env.DB.prepare('SELECT id, created_by, status FROM translation_documents WHERE id = ?').bind(documentId).first();
  if (!row) return fail('وثيقة الترجمة غير موجودة', 404);
  const isAdmin = ['admin', 'super_admin'].includes(String(user.role));
  if (!isAdmin && row.created_by && Number(row.created_by) !== Number(user.id)) return fail('غير مصرح بالتحكم في هذه الترجمة', 403, 'FORBIDDEN');
  if (!['pause', 'resume', 'retry', 'cancel'].includes(action)) return fail('إجراء غير صالح', 400);
  if (action === 'pause') {
    await env.DB.batch([
      env.DB.prepare("UPDATE translation_documents SET status = 'PAUSED', error_code = NULL, error_message = NULL, updated_at = datetime('now'), heartbeat_at = datetime('now') WHERE id = ?").bind(documentId),
      env.DB.prepare("UPDATE translation_pages SET status = 'pending', progress = 0, updated_at = datetime('now') WHERE document_id = ? AND status = 'processing'").bind(documentId),
    ]);
    return json({ success: true, status: 'PAUSED' });
  }
  if (action === 'cancel') {
    await env.DB.prepare("UPDATE translation_documents SET status = 'CANCELLED', error_code = 'CANCELLED_BY_USER', error_message = 'ألغيت الترجمة من المستخدم', updated_at = datetime('now'), heartbeat_at = datetime('now') WHERE id = ?").bind(documentId).run();
    return json({ success: true, status: 'CANCELLED' });
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE translation_pages SET status = 'pending', progress = 0,
      error_code = NULL, error_message = NULL, updated_at = datetime('now')
      WHERE document_id = ? AND status IN ('failed', 'processing')`).bind(documentId),
    env.DB.prepare(`UPDATE translation_documents SET status = 'RUNNING', attempts = attempts + 1,
      error_code = NULL, error_message = NULL, last_error_at = NULL, completed_at = NULL,
      updated_at = datetime('now'), heartbeat_at = datetime('now') WHERE id = ?`).bind(documentId),
  ]);
  const progress = await refreshTranslationProgress(env.DB, documentId);
  return json({ success: true, status: progress.status, progress: progress.progress, retried: true });
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
  const existing = await env.DB.prepare('SELECT status FROM translation_jobs WHERE id = ?').bind(jobId).first();
  if (!existing) return fail('الطلب غير موجود', 404);
  if (existing.status === 'CANCELLED') return json({ success: true, ignored: true });
  let body; try { body = await req.json(); } catch (_) { return fail('بيانات غير صالحة'); }
  const status = String(body.status || ''); const progress = Math.max(0, Math.min(100, Number(body.progress) || 0)); const stage = JOB_STAGES.has(body.currentStage) ? body.currentStage : status;
  if (!JOB_STAGES.has(status)) return fail('حالة غير صالحة');
  // لا تسمح callback قديمًا بإرجاع وظيفة مكتملة أو فاشلة إلى حالة تشغيلية.
  if (existing.status === 'COMPLETED' && status !== 'COMPLETED') return json({ success: true, ignored: true, reason: 'already_completed' });
  if (existing.status === 'FAILED' && !['FAILED', 'COMPLETED'].includes(status)) return json({ success: true, ignored: true, reason: 'already_failed' });
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
  const job = await env.DB.prepare('SELECT fingerprint, status FROM translation_jobs WHERE id = ?').bind(jobId).first();
  if (!job?.fingerprint) return fail('الطلب غير موجود', 404);
  if (job.status === 'CANCELLED') return fail('وظيفة الترجمة أُلغيت', 410, 'JOB_CANCELLED');
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
  let manualMatch = path.match(/^\/api\/v1\/manual-translations\/([0-9a-f-]+)\/file$/i);
  if (manualMatch && req.method === 'GET') {
    const format = new URL(req.url).searchParams.get('format') === 'docx' ? 'docx' : 'pdf';
    const row = await env.DB.prepare(`SELECT mt.* FROM manual_translations mt
      JOIN materials m ON m.id = mt.material_id
      WHERE mt.id = ? AND m.publish_status = 'published'`).bind(manualMatch[1]).first();
    if (!row) return fail('الترجمة غير موجودة', 404);
    const key = format === 'docx' ? row.docx_key : row.pdf_key;
    const filename = format === 'docx' ? row.docx_filename : row.pdf_filename;
    const object = await env.FILES.get(key, req.headers.has('range') && format === 'pdf' ? { range: req.headers } : undefined);
    if (!object) return fail('ملف الترجمة غير موجود', 404);
    const disposition = format === 'pdf' && !new URL(req.url).searchParams.has('download') ? 'inline' : 'attachment';
    const headers = new Headers({ 'content-type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' });
    if (object.size != null) headers.set('content-length', String(object.size));
    if (object.range) { headers.set('content-range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${format === 'pdf' ? row.pdf_size : row.docx_size}`); headers.set('accept-ranges', 'bytes'); return new Response(object.body, { status: 206, headers }); }
    return new Response(object.body, { headers });
  }
  manualMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/manual-translations$/);
  if (manualMatch && req.method === 'GET') {
    const material = await materialById(env.DB, decodeURIComponent(manualMatch[1]));
    if (!material) return fail('المادة غير موجودة', 404);
    const rows = await env.DB.prepare(`SELECT id, source_language, target_language, note, created_at
      FROM manual_translations WHERE material_id = ? ORDER BY created_at DESC`).bind(material.id).all();
    return json({ translations: rows.results || [] });
  }
  if (path === '/api/v1/translate/settings' && req.method === 'GET') return translationSettings(req, env);
  if (path === '/api/v1/translate/text' && req.method === 'POST') return translateText(req, env);
  if (path === '/api/v1/translate/ocr-page' && req.method === 'POST') return ocrPage(req, env);
  if (path === '/api/v1/translate/document' && req.method === 'POST') return fail('استخدم ترجمة المادة من عارضها', 410, 'USE_DOCUMENT_TRANSLATION');
  let batchMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/pages\/translate-batch$/);
  if (batchMatch && req.method === 'POST') return pageTranslationBatch(req, env, decodeURIComponent(batchMatch[1]));
  let pageMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/pages\/(\d+)\/translate$/);
  if (pageMatch && req.method === 'POST') return pageTranslation(req, env, decodeURIComponent(pageMatch[1]), pageMatch[2]);
  pageMatch = path.match(/^\/api\/v1\/documents\/([^/]+)\/pages\/(\d+)$/);
  if (pageMatch && req.method === 'GET') return getTranslatedPage(req, env, decodeURIComponent(pageMatch[1]), pageMatch[2]);
  let controlMatch = path.match(/^\/api\/v1\/translate\/documents\/([^/]+)\/(pause|resume|retry|cancel)$/);
  if (controlMatch && req.method === 'POST') return translationDocumentControl(req, env, decodeURIComponent(controlMatch[1]), controlMatch[2]);
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
