import { resolveAppUrl } from './api-base.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
let librariesPromise = null;

export class DocxReaderError extends Error {
  constructor(message, { code = 'DOCX_ERROR', status = 0 } = {}) {
    super(message);
    this.name = 'DocxReaderError';
    this.code = code;
    this.status = status;
  }
}

function isDocx(file) {
  return /docx|wordprocessingml\.document/i.test(String(file?.mime || file?.filename || ''));
}

function loadScript(url, ready, label) {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-sidjil-vendor="${label}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new DocxReaderError('تعذر تحميل موارد قارئ Word', { code: 'ASSET_ERROR' })), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.sidjilVendor = label;
    script.addEventListener('load', () => ready() ? resolve() : reject(new DocxReaderError('مكتبة قارئ Word غير مكتملة', { code: 'ASSET_ERROR' })), { once: true });
    script.addEventListener('error', () => reject(new DocxReaderError('تعذر تحميل موارد قارئ Word', { code: 'ASSET_ERROR' })), { once: true });
    document.head.appendChild(script);
  });
}

export function ensureDocxLibraries() {
  if (!librariesPromise) {
    const jszipUrl = new URL('./vendor/jszip/jszip.min.js', import.meta.url).toString();
    const docxUrl = new URL('./vendor/docx-preview/docx-preview.min.js', import.meta.url).toString();
    librariesPromise = loadScript(jszipUrl, () => Boolean(globalThis.JSZip), 'jszip')
      .then(() => loadScript(docxUrl, () => typeof globalThis.docx?.renderAsync === 'function', 'docx-preview'))
      .catch(error => { librariesPromise = null; throw error; });
  }
  return librariesPromise;
}

function parseStatus(status) {
  if (status === 401) return new DocxReaderError('انتهت جلسة الباحث. سجّل الدخول من جديد.', { code: 'AUTH_REQUIRED', status });
  if (status === 403) return new DocxReaderError('ليس لديك صلاحية لقراءة هذا الملف.', { code: 'FORBIDDEN', status });
  if (status === 404) return new DocxReaderError('ملف Word غير موجود.', { code: 'NOT_FOUND', status });
  if (status >= 500) return new DocxReaderError('تعذر تجهيز ملف Word من الخادم.', { code: 'SERVER_ERROR', status });
  return new DocxReaderError(`تعذر تحميل ملف Word (${status}).`, { code: 'HTTP_ERROR', status });
}

function trustedUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:https:\/\/app\.sidjil\.org)?\/file\/(\d+)$/i);
  return match ? resolveAppUrl(`/file/${Number(match[1])}`) : '';
}

async function fetchDocx(file) {
  const url = trustedUrl(file?.url);
  if (!url) throw new DocxReaderError('مصدر ملف Word غير موثوق.', { code: 'UNTRUSTED_SOURCE' });
  let response;
  try {
    response = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: DOCX_MIME } });
  } catch {
    throw new DocxReaderError('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.', { code: 'NETWORK_ERROR' });
  }
  if (!response.ok) throw parseStatus(response.status);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new DocxReaderError('استجابة ملف Word غير صالحة.', { code: 'INVALID_CONTENT', status: response.status });
  }
  const buffer = await response.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 4));
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new DocxReaderError('الملف ليس DOCX صالحًا أو أنه تالف.', { code: 'INVALID_DOCX' });
  }
  return new Blob([buffer], { type: DOCX_MIME });
}

function setDirection(container, language) {
  const lang = String(language || '').toLowerCase();
  container.lang = lang || 'und';
  container.dir = lang === 'ar' ? 'rtl' : lang === 'fr' || lang === 'en' ? 'ltr' : 'auto';
}

export async function mountWordReader(container, { material, source = 'original', fileActions = null, onBack, onSourceChange } = {}) {
  if (!container || !material) throw new DocxReaderError('المادة غير محددة', { code: 'MATERIAL_REQUIRED' });
  let currentSource = source === 'translation' ? 'translation' : 'original';
  let destroyed = false;
  let renderContainer = null;
  let renderGeneration = 0;

  container.replaceChildren();
  container.className = 'mobile-reader-view mobile-word-reader';

  const toolbar = document.createElement('div'); toolbar.className = 'mobile-reader-toolbar';
  const back = document.createElement('button'); back.type = 'button'; back.className = 'mobile-reader-back'; back.textContent = '‹'; back.setAttribute('aria-label', 'العودة إلى تفاصيل المادة');
  const heading = document.createElement('strong'); heading.className = 'mobile-reader-title';
  const tabs = document.createElement('div'); tabs.className = 'mobile-reader-tabs';
  const originalTab = document.createElement('button'); originalTab.type = 'button'; originalTab.textContent = 'الأصل';
  const translationTab = document.createElement('button'); translationTab.type = 'button'; translationTab.textContent = 'الترجمة';
  tabs.append(originalTab, translationTab); toolbar.append(back, heading, tabs);

  const fileBar = document.createElement('div'); fileBar.className = 'mobile-reader-file-actions';
  const fileStatus = document.createElement('span'); fileStatus.className = 'mobile-reader-file-status'; fileStatus.setAttribute('role', 'status');
  const actionButtons = new Map();
  [['download', 'حفظ'], ['share', 'مشاركة'], ['open', 'فتح خارجيًا']].forEach(([action, label]) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.fileAction = action;
    fileBar.append(button); actionButtons.set(action, button);
  });
  fileBar.append(fileStatus);
  const status = document.createElement('div'); status.className = 'mobile-reader-status'; status.setAttribute('role', 'status');
  const stage = document.createElement('div'); stage.className = 'mobile-word-stage';
  const content = document.createElement('div'); content.className = 'mobile-word-document';
  stage.append(content);
  container.append(toolbar, fileBar, status, stage);

  function setStatus(message, error = false) { status.textContent = message || ''; status.classList.toggle('is-error', error); status.hidden = !message; }
  function selectedFile() {
    if (currentSource === 'translation') return material.translations.find(item => isDocx(item)) || null;
    return isDocx(material.original) ? material.original : null;
  }
  function sourceAvailable(value) {
    return value === 'original' ? Boolean(material.original) : material.translations.length > 0;
  }
  function updateChrome() {
    const file = selectedFile();
    originalTab.classList.toggle('is-active', currentSource === 'original');
    translationTab.classList.toggle('is-active', currentSource === 'translation');
    originalTab.disabled = !sourceAvailable('original');
    translationTab.disabled = !sourceAvailable('translation');
    heading.textContent = `${material.title} · ${currentSource === 'translation' ? 'الترجمة' : 'الأصل'}`;
    setDirection(content, currentSource === 'translation' ? (file?.targetLang || '') : (material.language || ''));
    actionButtons.forEach(button => { button.disabled = !fileActions || !file; });
  }
  async function runFileAction(action) {
    const file = selectedFile();
    if (!file || !fileActions) return;
    const button = actionButtons.get(action); button.disabled = true;
    fileStatus.textContent = action === 'download' ? 'جارٍ حفظ الملف…' : action === 'share' ? 'جارٍ تجهيز المشاركة…' : 'جارٍ تجهيز الفتح الخارجي…';
    try {
      const handler = action === 'download' ? fileActions.downloadFile : action === 'share' ? fileActions.shareFile : fileActions.openFile;
      const result = await handler(file, { title: material.title, variant: currentSource, onProgress: value => { if (value != null) fileStatus.textContent = `جارٍ تجهيز الملف… ${Math.round(value * 100)}%`; } });
      fileStatus.textContent = action === 'download' ? (result.native ? `تم حفظ ${result.filename}.` : 'بدأ تنزيل الملف.') : action === 'share' ? 'تم فتح المشاركة.' : 'تم فتح قائمة التطبيقات.';
    } catch (error) { fileStatus.textContent = error?.message || 'تعذر تنفيذ العملية.'; }
    finally { button.disabled = false; }
  }
  async function renderSource(nextSource) {
    const generation = ++renderGeneration;
    currentSource = nextSource === 'translation' ? 'translation' : 'original';
    updateChrome();
    const file = selectedFile();
    content.replaceChildren();
    if (!file) { setStatus('لا يوجد ملف Word لهذا العرض.', true); return; }
    setStatus('جارٍ تحميل مستند Word…');
    try {
      await ensureDocxLibraries();
      const blob = await fetchDocx(file);
      if (destroyed || generation !== renderGeneration) return;
      renderContainer = content;
      await globalThis.docx.renderAsync(blob, content, null, {
        className: 'sidjil-docx', inWrapper: true, breakPages: true,
        ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true,
        renderFootnotes: true, renderEndnotes: true, useBase64URL: false,
      });
      if (destroyed || generation !== renderGeneration) return;
      setStatus('');
    } catch (error) {
      if (destroyed || generation !== renderGeneration) return;
      content.replaceChildren();
      setStatus(error?.message || 'تعذر عرض مستند Word.', true);
    }
  }
  function switchSource(value) {
    if (!sourceAvailable(value) || value === currentSource) return;
    if (typeof onSourceChange === 'function') onSourceChange(value);
    else renderSource(value).catch(() => {});
  }
  back.addEventListener('click', () => onBack?.());
  originalTab.addEventListener('click', () => switchSource('original'));
  translationTab.addEventListener('click', () => switchSource('translation'));
  actionButtons.forEach((button, action) => button.addEventListener('click', () => runFileAction(action)));
  updateChrome();
  await renderSource(currentSource);
  return {
    destroy() { destroyed = true; renderGeneration += 1; renderContainer = null; content.replaceChildren(); container.replaceChildren(); },
    setSource: switchSource,
  };
}

export const DOCX_MIME_TYPE = DOCX_MIME;
