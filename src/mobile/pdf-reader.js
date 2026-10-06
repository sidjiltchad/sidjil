/* Capacitor adapter for the canonical Sidjil reader UI. */
import { mount as mountShared } from './researcher-pdf-core.js?v=20261012-unified-reader-controls';
import { resolveAppUrl } from './api-base.js';
import { apiFetch } from './api-client.js';

function isPdf(file) { return /pdf/i.test(`${file?.mime || ''} ${file?.filename || ''}`); }
function fileUrl(file) { if (file?.url) return resolveAppUrl(file.url); if (file?.id) return resolveAppUrl(`/file/${Number(file.id)}`); return ''; }
export function resolveReaderSource(material, source = 'original') {
  if (source === 'translation') { const item = material?.translations?.find(isPdf); return item ? { url: fileUrl(item), label: `الترجمة · ${item.targetLang || ''}`, language: item.targetLang || '' } : null; }
  return material?.original ? { url: fileUrl(material.original), label: 'الأصل', language: material.language || '' } : null;
}
export async function mountPdfReader(container, { material, source = 'original', fileActions = null, onBack } = {}) {
  if (!container || !material) throw new Error('المادة غير محددة');
  const original = material.original || material.readableOriginal;
  const translations = (material.translations || []).filter(item => item?.translationFileId || item?.translation_file_id).map(item => ({
    translation_file_id: Number(item.translationFileId || item.translation_file_id),
    target_lang: item.targetLang || item.target_lang || 'ar',
    translation_mime: item.mime || item.translation_mime || '',
    translation_filename: item.filename || item.translation_filename || '',
  }));
  if (!original?.url && !original?.id) throw new Error('ملف القراءة غير محدد');
  globalThis.__SIDJIL_READER_API_ORIGIN__ = resolveAppUrl('/');
  if (typeof globalThis.api !== 'function') globalThis.api = (path, method = 'GET', body) => apiFetch(path, { method, body });
  const selected = source === 'translation' ? translations.find(item => /pdf/i.test(`${item.translation_mime} ${item.translation_filename}`)) : null;
  return mountShared(container, {
    url: fileUrl(original), originalDownload: fileUrl(original), materialId: material.id,
    materialTitle: material.title, translations, initialTranslationId: selected?.translation_file_id,
    logoUrl: new URL('./sidjil-logo.png', import.meta.url).toString(),
    fileActions, onClose: onBack,
  });
}

