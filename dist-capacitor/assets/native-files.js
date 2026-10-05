import { isNativeApp } from './environment.js';
import { resolveAppUrl } from './api-base.js';

const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024;
const DIRECTORY_DATA = 'DATA';
const DIRECTORY_CACHE = 'CACHE';
const running = new Map();

export class NativeFileError extends Error {
  constructor(message, { code = 'FILE_ERROR', status = 0 } = {}) { super(message); this.name = 'NativeFileError'; this.code = code; this.status = status; }
}

function text(value) { return value == null ? '' : String(value); }
function fileId(value) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : 0; }
export function trustedFileUrl(value) {
  const raw = text(value).trim();
  if (/^javascript:|^data:|^blob:|^file:/i.test(raw)) return '';
  const match = raw.match(/^(?:https:\/\/app\.sidjil\.org)?\/file\/(\d+)(?:\?[^#]*)?$/i);
  return match ? resolveAppUrl(`/file/${Number(match[1])}`) : '';
}

const MIME_EXTENSIONS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};
function extensionFor(file) {
  const filename = text(file?.filename).toLowerCase();
  const ext = filename.match(/\.([a-z0-9]{1,8})$/)?.[1];
  return ext || MIME_EXTENSIONS[text(file?.mime).toLowerCase()] || 'bin';
}
export function sanitizeFilename(value, fallback = 'sidjil-file') {
  let safe = text(value).normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-').replace(/\.\.+/g, '.').replace(/^[.\-]+/, '').replace(/\s+/g, ' ').trim().replace(/[. \-]+$/g, '').slice(0, 100);
  if (!safe || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) safe = fallback;
  return safe;
}
export function buildFilename(file, { title = '', variant = 'original' } = {}) {
  const id = fileId(file?.id || file?.translationFileId) || 'file';
  const base = sanitizeFilename(title || text(file?.filename).replace(/\.[^.]+$/, '') || `sidjil-${id}`, `sidjil-${id}`);
  const language = variant === 'translation' && text(file?.targetLang) ? sanitizeFilename(file.targetLang, 'translated') : '';
  const suffix = variant === 'translation' ? `${language}-translation` : 'original';
  return `${base}-${suffix}.${extensionFor(file)}`;
}
function pathFor(file, options) { return `sidjil/${options.persistent === false ? 'tmp' : 'downloads'}/${fileId(file?.id || file?.translationFileId)}-${buildFilename(file, options)}`; }
function plugin(name) {
  const capacitor = globalThis.Capacitor;
  if (!capacitor) return null;
  return capacitor.Plugins?.[name] || capacitor.registerPlugin?.(name) || null;
}
function requireFilesystem() { const value = plugin('Filesystem'); if (!value) throw new NativeFileError('إضافة حفظ الملفات غير متاحة.', { code: 'PLUGIN_UNAVAILABLE' }); return value; }
function requireShare() { const value = plugin('Share'); if (!value) throw new NativeFileError('إضافة المشاركة غير متاحة.', { code: 'PLUGIN_UNAVAILABLE' }); return value; }

function classifyResponse(response) {
  if (response.status === 401) throw new NativeFileError('انتهت جلسة الباحث. سجّل الدخول من جديد.', { code: 'AUTH_REQUIRED', status: 401 });
  if (response.status === 403) throw new NativeFileError('لا تملك صلاحية الوصول إلى هذا الملف.', { code: 'FORBIDDEN', status: 403 });
  if (response.status === 404) throw new NativeFileError('الملف غير موجود.', { code: 'NOT_FOUND', status: 404 });
  if (response.status >= 500) throw new NativeFileError('تعذر تجهيز الملف من الخادم.', { code: 'SERVER_ERROR', status: response.status });
  if (!response.ok) throw new NativeFileError(`تعذر تحميل الملف (${response.status}).`, { code: 'HTTP_ERROR', status: response.status });
  const contentType = text(response.headers.get('content-type')).toLowerCase();
  if (!contentType || contentType.includes('text/html')) throw new NativeFileError('استجابة الملف غير صالحة.', { code: 'INVALID_CONTENT' });
}
export function validateFileResponse(response, file = null) { classifyResponse(response); if (file) validateMime(response, file); return true; }
function validateMime(response, file) {
  const actual = text(response.headers.get('content-type')).split(';')[0].trim().toLowerCase();
  const expected = text(file?.mime).split(';')[0].trim().toLowerCase();
  if (!expected || !actual || actual === 'application/octet-stream') return;
  if (expected === 'application/pdf' && actual !== 'application/pdf') throw new NativeFileError('نوع الملف لا يطابق ملف PDF المطلوب.', { code: 'MIME_MISMATCH' });
  if (expected.startsWith('image/') && !actual.startsWith('image/')) throw new NativeFileError('نوع الملف لا يطابق الصورة المطلوبة.', { code: 'MIME_MISMATCH' });
  if (expected.includes('wordprocessingml') && actual !== expected) throw new NativeFileError('نوع الملف لا يطابق ملف Word المطلوب.', { code: 'MIME_MISMATCH' });
}

async function readBinary(response, onProgress) {
  const length = Number(response.headers.get('content-length')) || 0;
  if (length > MAX_DOWNLOAD_BYTES) throw new NativeFileError('الملف أكبر من الحد المدعوم على الجهاز.', { code: 'TOO_LARGE' });
  const reader = response.body?.getReader?.();
  if (!reader) { const buffer = await response.arrayBuffer(); if (!buffer.byteLength) throw new NativeFileError('الملف فارغ.', { code: 'EMPTY_FILE' }); onProgress?.(1); return new Uint8Array(buffer); }
  const chunks = []; let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (part.value?.byteLength) { total += part.value.byteLength; if (total > MAX_DOWNLOAD_BYTES) { await reader.cancel().catch(() => {}); throw new NativeFileError('الملف أكبر من الحد المدعوم على الجهاز.', { code: 'TOO_LARGE' }); } chunks.push(part.value); onProgress?.(length ? Math.min(1, total / length) : null); }
  }
  if (!total) throw new NativeFileError('الملف فارغ.', { code: 'EMPTY_FILE' });
  const result = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } onProgress?.(1); return result;
}
function toBase64(bytes) { let output = ''; const step = 0x8000; for (let i = 0; i < bytes.length; i += step) output += String.fromCharCode(...bytes.subarray(i, i + step)); return btoa(output); }

async function fetchFile(file, onProgress) {
  const baseUrl = trustedFileUrl(file?.url);
  const isPdf = /^application\/pdf$/i.test(text(file?.mime)) || /\.pdf$/i.test(text(file?.filename));
  const url = baseUrl ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}download=1${isPdf ? '&watermark=1' : ''}` : '';
  if (!url) throw new NativeFileError('رابط الملف غير موثوق.', { code: 'UNTRUSTED_URL' });
  let response;
  try { response = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: text(file?.mime) || 'application/octet-stream' } }); }
  catch { throw new NativeFileError('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.', { code: 'NETWORK_ERROR' }); }
  classifyResponse(response);
  validateMime(response, file);
  return readBinary(response, onProgress);
}

async function exists(fs, path, directory, expectedSize = 0) {
  try { const info = await fs.stat({ path, directory }); return !expectedSize || Number(info.size || 0) === expectedSize ? info : null; } catch { return null; }
}
async function uriFor(fs, path, directory) { return (await fs.getUri({ path, directory })).uri; }

export function createNativeFilesClient() {
  async function save(file, { title = '', variant = 'original', persistent = true, onProgress } = {}) {
    const id = fileId(file?.id || file?.translationFileId); if (!id) throw new NativeFileError('معرف الملف غير صالح.', { code: 'INVALID_FILE' });
    const filename = buildFilename(file, { title, variant }); const path = pathFor(file, { title, variant, persistent });
    if (!isNativeApp()) { const url = trustedFileUrl(file.url); if (!url) throw new NativeFileError('رابط الملف غير صالح.', { code: 'UNTRUSTED_URL' }); const anchor = document.createElement('a'); anchor.href = `${url}${url.includes('?') ? '&' : '?'}download=1`; anchor.download = filename; anchor.rel = 'noopener'; anchor.click(); return { native: false, url, filename, mime: text(file.mime) || 'application/octet-stream', persistent }; }
    const fs = requireFilesystem();
    const cached = await exists(fs, path, persistent ? DIRECTORY_DATA : DIRECTORY_CACHE, Number(file.size) || 0);
    if (cached) return { native: true, path, uri: await uriFor(fs, path, persistent ? DIRECTORY_DATA : DIRECTORY_CACHE), filename, mime: text(file.mime) || 'application/octet-stream', persistent, cached: true };
    const bytes = await fetchFile(file, onProgress); const base64 = toBase64(bytes); const partial = `${path}.part`;
    try { await fs.deleteFile({ path: partial, directory: persistent ? DIRECTORY_DATA : DIRECTORY_CACHE }).catch(() => {}); await fs.writeFile({ path: partial, data: base64, directory: persistent ? DIRECTORY_DATA : DIRECTORY_CACHE, recursive: true }); await fs.rename({ from: partial, to: path, directory: persistent ? DIRECTORY_DATA : DIRECTORY_CACHE }); }
    catch (error) { await fs.deleteFile({ path: partial, directory: persistent ? DIRECTORY_DATA : DIRECTORY_CACHE }).catch(() => {}); throw new NativeFileError('تعذر حفظ الملف على الجهاز.', { code: 'WRITE_FAILED' }); }
    return { native: true, path, uri: await uriFor(fs, path, persistent ? DIRECTORY_DATA : DIRECTORY_CACHE), filename, mime: text(file.mime) || 'application/octet-stream', persistent, cached: false };
  }
  function key(file, variant) { return `${fileId(file?.id || file?.translationFileId)}:${variant}`; }
  async function downloadFile(file, options = {}) { const cacheKey = key(file, options.variant || 'original'); if (!running.has(cacheKey)) { const promise = save(file, { ...options, persistent: true }).finally(() => running.delete(cacheKey)); running.set(cacheKey, promise); } return running.get(cacheKey); }
  async function temporaryFile(file, options = {}) { return save(file, { ...options, persistent: false }); }
  async function shareFile(file, options = {}) {
    if (!isNativeApp()) { if (navigator.share) return navigator.share({ title: options.title || 'سِجِل', url: trustedFileUrl(file?.url) }); throw new NativeFileError('المشاركة غير متاحة في هذا المتصفح.', { code: 'SHARE_UNAVAILABLE' }); }
    const local = await temporaryFile(file, options); const share = requireShare(); const can = await share.canShare?.(); if (can && can.value === false) throw new NativeFileError('المشاركة غير متاحة على هذا الجهاز.', { code: 'SHARE_UNAVAILABLE' });
    await share.share({ title: options.title || local.filename, files: [local.uri], dialogTitle: 'مشاركة ملف سِجِل' }); return local;
  }
  async function openFile(file, options = {}) {
    if (!isNativeApp()) { const url = trustedFileUrl(file?.url); if (!url) throw new NativeFileError('رابط الملف غير صالح.', { code: 'UNTRUSTED_URL' }); globalThis.open?.(url, '_blank', 'noopener'); return { native: false, url }; }
    const local = await temporaryFile(file, options); const share = requireShare(); await share.share({ title: options.title || local.filename, files: [local.uri], dialogTitle: 'فتح باستخدام تطبيق مناسب' }); return local;
  }
  async function cleanupTemporaryFiles(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    if (!isNativeApp()) return { deleted: 0 };
    const fs = requireFilesystem(); let listing; try { listing = await fs.readdir({ path: 'sidjil/tmp', directory: DIRECTORY_CACHE }); } catch { return { deleted: 0 }; }
    let deleted = 0; for (const entry of listing.files || []) { if (entry.type !== 'file' || !entry.name) continue; try { const info = await fs.stat({ path: `sidjil/tmp/${entry.name}`, directory: DIRECTORY_CACHE }); if (Date.now() - Number(info.mtime || Date.now()) > maxAgeMs) { await fs.deleteFile({ path: `sidjil/tmp/${entry.name}`, directory: DIRECTORY_CACHE }); deleted += 1; } } catch {} }
    return { deleted };
  }
  return { downloadFile, saveFile: downloadFile, temporaryFile, shareFile, openFile, cleanupTemporaryFiles, get running() { return running; } };
}
