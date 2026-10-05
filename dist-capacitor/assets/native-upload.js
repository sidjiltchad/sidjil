import { getCsrfToken } from './api-client.js';
import { isNativeApp } from './environment.js';
import { resolveAppUrl } from './api-base.js';

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ACCEPTED = new Map([
  ['pdf', { mime: 'application/pdf', kind: 'content-file' }],
  ['docx', { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'content-file' }],
  ['jpg', { mime: 'image/jpeg', kind: 'content-image' }],
  ['jpeg', { mime: 'image/jpeg', kind: 'content-image' }],
  ['png', { mime: 'image/png', kind: 'content-image' }],
  ['webp', { mime: 'image/webp', kind: 'content-image' }],
  ['gif', { mime: 'image/gif', kind: 'content-image' }],
  ['tif', { mime: 'image/tiff', kind: 'content-image' }],
  ['tiff', { mime: 'image/tiff', kind: 'content-image' }],
  ['heic', { mime: 'image/heic', kind: 'content-image' }],
]);

export class UploadError extends Error {
  constructor(message, { code = 'UPLOAD_ERROR', status = 0, details = null } = {}) {
    super(message);
    this.name = 'UploadError'; this.code = code; this.status = status; this.details = details;
  }
}

function extension(name) { return String(name || '').split(/[\\/]/).pop().split('.').pop().toLowerCase(); }
function safeName(name) {
  return String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
}
function errorForStatus(status, details) {
  if (status === 401) return new UploadError('انتهت جلسة الباحث. سجّل الدخول من جديد.', { code: 'AUTH_REQUIRED', status, details });
  if (status === 403) return new UploadError('ليس لديك صلاحية لرفع هذا الملف.', { code: 'FORBIDDEN', status, details });
  if (status === 413) return new UploadError('حجم الملف يتجاوز الحد الأقصى المسموح به (100 ميغابايت).', { code: 'TOO_LARGE', status, details });
  if (status === 415) return new UploadError('نوع الملف غير مدعوم.', { code: 'UNSUPPORTED_MEDIA', status, details });
  if (status === 422) return new UploadError(details?.error || 'بيانات الملف غير صالحة.', { code: 'VALIDATION_ERROR', status, details });
  if (status >= 500) return new UploadError('تعذر حفظ الملف الآن. حاول مرة أخرى.', { code: 'SERVER_ERROR', status, details });
  return new UploadError(details?.error || `فشل رفع الملف (${status}).`, { code: 'HTTP_ERROR', status, details });
}

export function validateUploadFile(file, { kind = '' } = {}) {
  if (!file || typeof file.name !== 'string' || typeof file.size !== 'number') throw new UploadError('اختر ملفًا صالحًا.', { code: 'INVALID_FILE' });
  if (!file.size) throw new UploadError('لا يمكن رفع ملف فارغ.', { code: 'EMPTY_FILE' });
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('حجم الملف يتجاوز الحد الأقصى المسموح به (100 ميغابايت).', { code: 'TOO_LARGE' });
  const ext = extension(file.name);
  const rule = ACCEPTED.get(ext);
  if (!rule) throw new UploadError('الصيغ المدعومة: PDF وDOCX وJPG وPNG وWebP.', { code: 'UNSUPPORTED_MEDIA' });
  if (kind === 'cover' && !rule.mime.startsWith('image/')) throw new UploadError('الغلاف يجب أن يكون صورة.', { code: 'VALIDATION_ERROR' });
  if (kind === 'content-file' && rule.mime.startsWith('image/')) throw new UploadError('ملف المضمون يجب أن يكون PDF أو DOCX.', { code: 'VALIDATION_ERROR' });
  const browserDocxZip = ext === 'docx' && file.type === 'application/zip';
  if (file.type && file.type !== rule.mime && file.type !== 'application/octet-stream' && !browserDocxZip) {
    throw new UploadError('نوع الملف المعلن لا يطابق امتداده.', { code: 'MIME_MISMATCH' });
  }
  return { filename: safeName(file.name), extension: ext, mime: rule.mime, kind: kind || rule.kind, size: file.size };
}

function uploadKey(materialId, file, kind) { return `${materialId}:${kind}:${file.name}:${file.size}:${file.lastModified || 0}`; }

function parseResponse(xhr) {
  let data = null;
  try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = null; }
  if (xhr.status < 200 || xhr.status >= 300) throw errorForStatus(xhr.status, data);
  if (!data || typeof data !== 'object') throw new UploadError('استجابة الرفع غير صالحة.', { code: 'INVALID_RESPONSE', status: xhr.status });
  return data;
}

export function createNativeUploadClient({ xhrFactory = () => new XMLHttpRequest(), native = isNativeApp() } = {}) {
  const running = new Map();
  const states = new Map();
  const controllers = new Map();

  function uploadFile(materialId, file, options = {}) {
    const id = String(materialId || '').match(/^\d+$/)?.[0] || '';
    if (!id) return Promise.reject(new UploadError('معرف المادة غير صالح.', { code: 'MATERIAL_REQUIRED' }));
    let validation;
    try { validation = validateUploadFile(file, options); } catch (error) { return Promise.reject(error); }
    const key = uploadKey(id, file, validation.kind);
    if (running.has(key)) return running.get(key).promise;
    states.set(key, { state: 'validating', materialId: id, filename: validation.filename, size: validation.size, kind: validation.kind });
    const promise = new Promise((resolve, reject) => {
      const xhr = xhrFactory();
      const form = new FormData();
      form.append('file', file, validation.filename || file.name);
      form.append('kind', validation.kind);
      const timeout = setTimeout(() => { try { xhr.abort(); } catch {} }, Number(options.timeoutMs || 120000));
      const finish = (fn, value, state) => { clearTimeout(timeout); states.set(key, { ...states.get(key), state }); running.delete(key); controllers.delete(key); fn(value); };
      states.set(key, { ...states.get(key), state: 'uploading' });
      xhr.open('POST', resolveAppUrl(`/api/v1/admin/materials/${id}/files`), true);
      xhr.withCredentials = true;
      xhr.responseType = 'text';
      xhr.setRequestHeader('Accept', 'application/json');
      const csrf = getCsrfToken(); if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.upload?.addEventListener?.('progress', event => { if (event.lengthComputable) options.onProgress?.(event.loaded / event.total, event.loaded, event.total); });
      xhr.addEventListener('load', () => { try { finish(resolve, parseResponse(xhr), 'success'); } catch (error) { finish(reject, error, 'error'); } });
      xhr.addEventListener('error', () => finish(reject, new UploadError('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.', { code: 'NETWORK_ERROR' }), 'error'));
      xhr.addEventListener('timeout', () => finish(reject, new UploadError('انتهت مهلة رفع الملف.', { code: 'TIMEOUT' }), 'error'));
      xhr.addEventListener('abort', () => finish(reject, new UploadError('أُلغي رفع الملف.', { code: 'CANCELLED' }), 'cancelled'));
      controllers.set(key, xhr);
      try { xhr.send(form); } catch (error) { finish(reject, new UploadError(error?.message || 'تعذر بدء الرفع.', { code: 'NETWORK_ERROR' }), 'error'); }
    });
    running.set(key, { promise, file, materialId: id, kind: validation.kind });
    return promise;
  }

  function cancelUpload(materialId, file, options = {}) {
    const key = uploadKey(String(materialId || ''), file, options.kind || validateUploadFile(file, options).kind);
    const xhr = controllers.get(key); if (xhr) xhr.abort();
    return Boolean(xhr);
  }

  function retryUpload(materialId, file, options = {}) { return uploadFile(materialId, file, options); }
  function getState(materialId, file, options = {}) {
    let kind = options.kind;
    if (!kind && file) { try { kind = validateUploadFile(file, options).kind; } catch { kind = ''; } }
    return states.get(uploadKey(String(materialId || ''), file || { name: '', size: 0 }, kind || 'content-file')) || null;
  }
  return { uploadFile, cancelUpload, retryUpload, validateUploadFile, getState, get running() { return running; }, get states() { return states; }, native: Boolean(native) };
}

export { ACCEPTED };
