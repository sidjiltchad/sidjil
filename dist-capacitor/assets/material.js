import { apiFetch } from './api-client.js';
import { resolveAppUrl } from './api-base.js';

const LANGUAGES = new Set(['ar', 'fr', 'en']);

function text(value) { return value == null ? '' : String(value); }
function number(value) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 0; }

export function normalizeMaterialId(value) {
  const id = String(value ?? '').match(/^\d+$/)?.[0] || '';
  return id && Number(id) > 0 ? id : '';
}

export function safeFileUrl(value) {
  const raw = text(value).trim();
  const match = raw.match(/^\/file\/(\d+)(?:\?[^#]*)?$/);
  if (!match) return '';
  return resolveAppUrl(`/file/${Number(match[1])}`);
}

function fileUrl(id) { return number(id) ? `/file/${number(id)}` : ''; }
function fileInfo(file) {
  if (!file || !number(file.id)) return null;
  return { id: number(file.id), filename: text(file.filename), mime: text(file.mime), kind: text(file.kind), size: number(file.size), url: fileUrl(file.id) };
}

export function isPdfFile(file) { return /pdf/i.test(`${file?.mime || ''} ${file?.filename || ''}`); }
export function isDocxFile(file) { return /docx|wordprocessingml\.document/i.test(`${file?.mime || ''} ${file?.filename || ''}`); }
function isReadable(file) { return isPdfFile(file) || isDocxFile(file); }

export function normalizeMaterialResponse(data, requestedId = '') {
  const source = data && typeof data === 'object' ? data : {};
  const id = number(source.id) || number(requestedId);
  const files = Array.isArray(source.files) ? source.files.map(fileInfo).filter(Boolean) : [];
  const readableFiles = files.filter(isReadable);
  const original = readableFiles.find(file => !/translation|ترجم/i.test(file.kind + ' ' + file.filename))
    || files.find(file => !/translation|ترجم/i.test(file.kind + ' ' + file.filename))
    || files[0] || null;
  const translations = Array.isArray(source.file_translations)
    ? source.file_translations.map(item => {
      const translationId = number(item.translation_file_id);
      const lang = text(item.target_lang).toLowerCase();
      if (!translationId || !LANGUAGES.has(lang)) return null;
      return { id: number(item.id), sourceFileId: number(item.source_file_id), sourceLang: text(item.source_lang), targetLang: lang, translationFileId: translationId, filename: text(item.translation_filename), mime: text(item.translation_mime), size: number(item.translation_size), url: fileUrl(translationId) };
    }).filter(Boolean)
    : [];
  const thumbnail = files.find(file => file.kind === 'cover' || file.kind === 'thumbnail' || file.mime.startsWith('image/')) || null;
  const title = text(source.title_ar || source.title_orig || source.ark || 'مادة من الأرشيف');
  return {
    id, ark: text(source.ark), title, titleOriginal: text(source.title_orig), type: text(source.type), materialLevel: text(source.material_level), language: text(source.language),
    year: source.year == null ? '' : text(source.year), dateText: text(source.date_text), author: text(source.author), photographer: text(source.photographer), archiveRef: text(source.archive_ref),
    description: text(source.description), summary: text(source.summary), fullText: text(source.full_text), sourceName: text(source.source?.name_ar || source.source?.name || source.source_name_ar || source.source_name), placeName: text(source.place?.name_ar || source.place_name),
    files, original, readableOriginal: readableFiles.find(file => file.id === original?.id) || null, translations, thumbnail: thumbnail ? { ...thumbnail, url: fileUrl(thumbnail.id) } : null,
  };
}

export function createMaterialClient({ request = apiFetch } = {}) {
  const cache = new Map();
  async function getMaterial(value, { force = false } = {}) {
    const id = normalizeMaterialId(value);
    if (!id) throw new TypeError('معرف المادة غير صالح');
    if (!force && cache.has(id)) return cache.get(id);
    const promise = request(`/api/v1/materials/${id}/details`, { method: 'GET' }).then(data => {
      const normalized = normalizeMaterialResponse(data, id);
      cache.set(id, normalized);
      return normalized;
    });
    cache.set(id, promise);
    try { return await promise; } catch (error) { cache.delete(id); throw error; }
  }
  return { getMaterial, clear(id) { cache.delete(normalizeMaterialId(id)); }, clearAll() { cache.clear(); } };
}
