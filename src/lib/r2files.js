// ============================================================
// SIDJIL — الرفع والتقديم من R2 — فريق الخلفية
// المبدأ: الأصل لا يُستبدل أبدًا — أي نسخة جديدة = مفتاح جديد
// ============================================================

import { TYPE_DIRS } from './db.js';
import { addSidjilWatermark } from './pdf-watermark.js';

/** الحد الأقصى لحجم الرفع: 100MB */
export const MAX_UPLOAD = 100 * 1024 * 1024;

const ALLOWED_EXTS = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'gif', 'heic']);

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
  gif: 'image/gif',
  heic: 'image/heic',
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
  if (kind === 'cover') {
    return `covers/${dir}/${ark}/${sha8}-${safe}`;
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

function hasPrefix(bytes, prefix) {
  return prefix.every((value, index) => bytes[index] === value);
}

function validateFileBytes(ext, bytes) {
  if (!bytes.length) throw new Error('لا يمكن رفع ملف فارغ');
  if (ext === 'pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('ملف PDF غير صالح');
  if (ext === 'docx' && !hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) throw new Error('ملف DOCX غير صالح');
  if (ext === 'doc' && !hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw new Error('ملف Word غير صالح');
  if (ext === 'jpg' || ext === 'jpeg') {
    if (!hasPrefix(bytes, [0xff, 0xd8, 0xff])) throw new Error('ملف JPEG غير صالح');
  }
  if (ext === 'png' && !hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47])) throw new Error('ملف PNG غير صالح');
  if (ext === 'gif' && new TextDecoder().decode(bytes.slice(0, 4)) !== 'GIF8') throw new Error('ملف GIF غير صالح');
  if ((ext === 'webp') && (new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP')) throw new Error('ملف WebP غير صالح');
  if (ext === 'tif' || ext === 'tiff') {
    const little = hasPrefix(bytes, [0x49, 0x49, 0x2a, 0x00]);
    const big = hasPrefix(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
    if (!little && !big) throw new Error('ملف TIFF غير صالح');
  }
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
  if (!size) throw new Error('لا يمكن رفع ملف فارغ');
  if (size > MAX_UPLOAD) {
    throw new Error('حجم الملف يتجاوز الحد الأقصى (100MB)');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateFileBytes(ext, bytes);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
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
export async function serveFile(env, fileId, { download = false, admin = false, watermark = false } = {}) {
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

  const contentType = file.mime || obj.httpMetadata?.contentType || 'application/octet-stream';
  let body = obj.body;
  let bodySize = obj.size;
  const isPdf = /^application\/pdf$/i.test(contentType) || /\.pdf$/i.test(file.filename || '');
  if (watermark && isPdf) {
    try {
      const stamped = await addSidjilWatermark(await obj.arrayBuffer());
      body = stamped;
      bodySize = stamped.byteLength;
    } catch {
      return jsonError('تعذّر تجهيز نسخة PDF المصدّرة', 500);
    }
  }

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', watermark ? 'private, no-store' : 'public, max-age=31536000, immutable'); // المفاتيح مُعنوَنة بالبصمة
  if (bodySize != null) headers.set('Content-Length', String(bodySize));
  if (download) {
    const asciiName = safeName(file.filename).replace(/[^\x20-\x7E]/g, '_') || 'file';
    headers.set('Content-Disposition', `attachment; filename="${asciiName}"`);
  }

  return new Response(body, { status: 200, headers });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
