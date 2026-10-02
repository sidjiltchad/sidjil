// ============================================================
// SIDJIL — الرفع والتقديم من R2 — فريق الخلفية
// المبدأ: الأصل لا يُستبدل أبدًا — أي نسخة جديدة = مفتاح جديد
// ============================================================

import { TYPE_DIRS } from './db.js';

/** الحد الأقصى لحجم الرفع: 100MB */
export const MAX_UPLOAD = 100 * 1024 * 1024;

const ALLOWED_EXTS = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif']);

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
};

/**
 * تنظيف اسم الملف: إزالة المسارات، إزالة accents اللاتينية،
 * الإبقاء على الحروف العربية (Unicode)، استبدال الباقي بـ _.
 */
export function safeName(name) {
  let s = String(name || '').split(/[\\/]/).pop().trim();
  s = s
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '') // لاتينية U+0300–U+036F + عربية U+064B–U+065F,U+0670
    .replace(/[^\p{L}\p{N}._()\- ]/gu, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[.\-_]+|[.\-_]+$/g, '');
  if (!s) s = 'file';
  return s.slice(0, 120);
}

/**
 * r2KeyFor({ark, type, kind, versionType, filename, sha8})
 * kind: 'original' | 'attachment' | 'derived' | 'thumbnail'
 */
export function r2KeyFor({ ark, type, kind, versionType, filename, sha8 }) {
  const dir = TYPE_DIRS[type] || 'documents';
  const safe = safeName(filename || 'file');
  if (kind === 'derived') {
    return `derived/images/${ark}/${versionType}-${sha8}.jpg`;
  }
  if (kind === 'thumbnail') {
    return `thumbnails/${ark}/thumb-480.jpg`;
  }
  if (kind === 'attachment') {
    return `originals/${dir}/${ark}/att-${sha8}-${safe}`;
  }
  // original
  return `originals/${dir}/${ark}/${sha8}-${safe}`;
}

function hexSha256(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * putUpload(env, {materialId, ark, type}, file, kind='original')
 * - يتحقق من الامتداد والحجم
 * - يحسب sha256 ثم يرفع إلى R2 ثم يُدخل صف files
 * @returns {Promise<object>} صف الملف المُدخل
 */
export async function putUpload(env, { materialId, ark, type }, file, kind = 'original') {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('ملف غير صالح');
  }
  const filename = safeName(file.name || 'file');
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error('نوع الملف غير مسموح: ' + (ext || '؟') + ' — المسموح: pdf, doc, docx, jpg, jpeg, png, webp, tiff');
  }
  const size = file.size || 0;
  if (size > MAX_UPLOAD) {
    throw new Error('حجم الملف يتجاوز الحد الأقصى (100MB)');
  }

  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = hexSha256(digest);
  const sha8 = sha256.slice(0, 8);
  const key = r2KeyFor({ ark, type, kind, filename, sha8 });
  const mime = file.type || MIME_BY_EXT[ext] || 'application/octet-stream';

  await env.FILES.put(key, file, {
    httpMetadata: { contentType: mime },
  });

  const res = await env.DB
    .prepare(
      `INSERT INTO files (material_id, kind, filename, mime, size, sha256, r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(materialId, kind, filename, mime, size, sha256, key)
    .run();

  return await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(res.meta.last_row_id).first();
}

/**
 * serveFile(env, fileId, {download=false, admin=false})
 * - يجلب الملف من D1 ثم يبثه من R2
 * - يتحقق أن المادة منشورة (published) ما لم تكن الجلسة إدارية
 * - download=1 → Content-Disposition: attachment
 */
export async function serveFile(env, fileId, { download = false, admin = false } = {}) {
  const file = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first();
  if (!file) {
    return jsonError('الملف غير موجود', 404);
  }

  if (!admin) {
    const mat = await env.DB
      .prepare('SELECT publish_status, full_text FROM materials WHERE id = ?')
      .bind(file.material_id)
      .first();
    if (!mat || mat.publish_status !== 'published') {
      return jsonError('الملف غير متاح', 403);
    }
    const textualOriginal = /(?:docx?|txt|md)$/i.test(file.filename || '')
      || /^(text\/plain|text\/markdown|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i.test(file.mime || '');
    if (textualOriginal && mat.full_text) {
      return jsonError('هذا المستند متاح كنص موثق داخل المنصة', 403);
    }
  }

  const obj = await env.FILES.get(file.r2_key);
  if (!obj) {
    return jsonError('الملف غير موجود في التخزين', 404);
  }

  const headers = new Headers();
  const contentType = file.mime || obj.httpMetadata?.contentType || 'application/octet-stream';
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable'); // المفاتيح مُعنوَنة بالبصمة
  if (obj.size != null) headers.set('Content-Length', String(obj.size));
  if (download) {
    const asciiName = safeName(file.filename).replace(/[^\x20-\x7E]/g, '_') || 'file';
    headers.set('Content-Disposition', `attachment; filename="${asciiName}"`);
  }

  return new Response(obj.body, { status: 200, headers });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
