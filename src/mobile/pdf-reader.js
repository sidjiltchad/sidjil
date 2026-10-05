import * as pdfjsLib from './pdfjs/pdf.min.mjs';
import { resolveAppUrl } from './api-base.js';

const PDF_OPTIONS = {
  cMapUrl: new URL('./pdfjs/cmaps/', import.meta.url).toString(),
  cMapPacked: true,
  standardFontDataUrl: new URL('./pdfjs/standard_fonts/', import.meta.url).toString(),
  disableFontFace: false,
  useSystemFonts: true,
  isEvalSupported: true,
  withCredentials: true,
};
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).toString();

function isPdf(item) { return String(item?.mime || item?.filename || '').toLowerCase().includes('pdf'); }
function readerSource(material, source) {
  if (source === 'translation') {
    const item = material?.translations?.find(entry => isPdf(entry));
    return item ? { url: resolveAppUrl(item.url), label: `الترجمة · ${item.targetLang || ''}`, language: item.targetLang || '' } : null;
  }
  return material?.original?.url ? { url: resolveAppUrl(material.original.url), label: 'الأصل', language: material.language || '' } : null;
}
export function resolveReaderSource(material, source = 'original') { return readerSource(material, source); }

export async function mountPdfReader(container, { material, source = 'original', fileActions = null, onBack } = {}) {
  if (!container || !material) throw new Error('المادة غير محددة');
  let currentSource = source === 'translation' ? 'translation' : 'original';
  let generation = 0;
  let pdf = null;
  let loadTask = null;
  let renderTask = null;
  let currentPage = 1;
  let zoom = 1;
  let destroyed = false;
  container.replaceChildren();
  container.className = 'mobile-reader-view';

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
  [['download', 'حفظ'], ['share', 'مشاركة'], ['open', 'فتح خارجيًا']].forEach(([action, label]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.fileAction = action; fileBar.append(button); actionButtons.set(action, button); });
  fileBar.append(fileStatus); 
  const status = document.createElement('div'); status.className = 'mobile-reader-status'; status.setAttribute('role', 'status');
  const stage = document.createElement('div'); stage.className = 'mobile-reader-stage'; stage.dir = 'rtl';
  const pageWrap = document.createElement('div'); pageWrap.className = 'mobile-reader-page-wrap'; pageWrap.dir = 'ltr';
  const canvas = document.createElement('canvas'); canvas.className = 'mobile-reader-canvas'; canvas.dir = 'ltr'; canvas.style.direction = 'ltr';
  pageWrap.append(canvas); stage.append(pageWrap); container.append(toolbar, fileBar, status, stage);
  const zoomBar = document.createElement('div'); zoomBar.className = 'mobile-reader-zoom';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '‹'; previous.setAttribute('aria-label', 'الصفحة السابقة');
  const next = document.createElement('button'); next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', 'الصفحة التالية');
  const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'تصغير');
  const pageLabel = document.createElement('span'); pageLabel.className = 'mobile-reader-page-label';
  const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'تكبير');
  const fullscreen = document.createElement('button'); fullscreen.type = 'button'; fullscreen.textContent = '⛶'; fullscreen.setAttribute('aria-label', 'ملء الشاشة');
  zoomBar.append(previous, minus, pageLabel, plus, next, fullscreen); container.append(zoomBar);

  function setStatus(message, error = false) { status.textContent = message; status.classList.toggle('is-error', error); status.hidden = !message; }
  function setActiveTabs() { originalTab.classList.toggle('is-active', currentSource === 'original'); translationTab.classList.toggle('is-active', currentSource === 'translation'); }
  function updateHeading() { heading.textContent = `${material.title} · ${currentSource === 'translation' ? 'الترجمة' : 'الأصل'}`; }
  function selectedFile() { if (currentSource === 'translation') return material.translations.find(item => isPdf(item)) || null; return material.original || null; }
  function updateFileActions() { const file = selectedFile(); fileBar.hidden = !fileActions || !file; actionButtons.forEach(button => { button.disabled = !file; }); }
  async function runFileAction(action) { const file = selectedFile(); if (!file || !fileActions || actionButtons.get(action)?.disabled) return; const button = actionButtons.get(action); button.disabled = true; fileStatus.textContent = action === 'download' ? 'جارٍ الحفظ…' : action === 'share' ? 'جارٍ تجهيز المشاركة…' : 'جارٍ تجهيز الفتح…'; try { const fn = action === 'download' ? fileActions.downloadFile : action === 'share' ? fileActions.shareFile : fileActions.openFile; const result = await fn(file, { title: material.title, variant: currentSource, onProgress: value => { if (value != null) fileStatus.textContent = `جارٍ تجهيز الملف… ${Math.round(value * 100)}%`; } }); fileStatus.textContent = action === 'download' ? `تم حفظ ${result.filename}.` : action === 'share' ? 'تم فتح المشاركة.' : 'تم فتح قائمة التطبيقات.'; } catch (error) { fileStatus.textContent = error?.message || 'تعذر تنفيذ العملية.'; } finally { button.disabled = false; } }
  function cleanupDocument() { try { renderTask?.cancel?.(); } catch {} try { loadTask?.destroy?.(); } catch {} try { pdf?.destroy?.(); } catch {} renderTask = null; loadTask = null; pdf = null; }
  function resizeCanvas(viewport) {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`;
  }
  async function render() {
    if (!pdf || destroyed) return;
    const generationAtStart = generation;
    renderTask?.cancel?.();
    const page = await pdf.getPage(currentPage);
    if (destroyed || generationAtStart !== generation) return;
    const base = page.getViewport({ scale: 1 });
    const maxWidth = Math.max(280, stage.clientWidth - 24);
    const fit = Math.min(1.8, Math.max(.35, maxWidth / base.width));
    const viewport = page.getViewport({ scale: fit * zoom });
    resizeCanvas(viewport);
    canvas.setAttribute('dir', 'ltr'); canvas.style.direction = 'ltr';
    const ctx = canvas.getContext('2d', { alpha: false }); ctx.direction = 'ltr';
    renderTask = page.render({ canvasContext: ctx, viewport, background: '#fff', transform: (globalThis.devicePixelRatio || 1) > 1 ? [Math.min(2, globalThis.devicePixelRatio || 1), 0, 0, Math.min(2, globalThis.devicePixelRatio || 1), 0, 0] : undefined });
    try { await renderTask.promise; } catch (error) { if (error?.name !== 'RenderingCancelledException') throw error; }
    if (!destroyed && generationAtStart === generation) pageLabel.textContent = `صفحة ${currentPage} / ${pdf.numPages}`;
  }
  async function openSource(nextSource) {
    const selected = readerSource(material, nextSource);
    currentSource = nextSource;
    generation += 1; const generationAtStart = generation; currentPage = 1; zoom = 1; setActiveTabs(); updateHeading(); updateFileActions(); cleanupDocument();
    if (!selected) { setStatus(nextSource === 'translation' ? 'لا توجد ترجمة PDF متاحة لهذه المادة.' : 'ملف PDF الأصلي غير متاح.', true); return; }
    setStatus('جارٍ تحميل الملف…');
    try {
      loadTask = pdfjsLib.getDocument({ url: selected.url, ...PDF_OPTIONS });
      pdf = await loadTask.promise;
      if (destroyed || generationAtStart !== generation) return;
      setStatus(''); stage.lang = selected.language || ''; stage.dir = selected.language === 'ar' ? 'rtl' : 'ltr';
      await render();
    } catch (error) {
      if (destroyed || generationAtStart !== generation) return;
      setStatus(error?.name === 'PasswordException' ? 'الملف محمي بكلمة مرور.' : 'تعذر تحميل هذا الملف داخل القارئ.', true);
    }
  }
  back.addEventListener('click', () => onBack?.());
  originalTab.addEventListener('click', () => openSource('original'));
  translationTab.addEventListener('click', () => openSource('translation'));
  minus.addEventListener('click', () => { zoom = Math.max(.5, zoom - .1); render().catch(() => {}); });
  plus.addEventListener('click', () => { zoom = Math.min(3, zoom + .1); render().catch(() => {}); });
  previous.addEventListener('click', () => { if (pdf && currentPage > 1) { currentPage -= 1; render().catch(() => {}); } });
  next.addEventListener('click', () => { if (pdf && currentPage < pdf.numPages) { currentPage += 1; render().catch(() => {}); } });
  actionButtons.forEach((button, action) => button.addEventListener('click', () => runFileAction(action)));
  fullscreen.addEventListener('click', () => { const target = container.closest('.mobile-reader-host-view') || container; if (!document.fullscreenElement) target.requestFullscreen?.({ navigationUI: 'hide' }).catch?.(() => {}); else document.exitFullscreen?.().catch?.(() => {}); });
  stage.addEventListener('wheel', event => { if (!event.ctrlKey) return; event.preventDefault(); zoom = Math.max(.5, Math.min(3, zoom + (event.deltaY < 0 ? .1 : -.1))); render().catch(() => {}); }, { passive: false });
  const onResize = () => render().catch(() => {}); globalThis.addEventListener?.('resize', onResize);
  translationTab.disabled = !material.translations.some(isPdf);
  updateFileActions();
  await openSource(currentSource);
  return { destroy() { destroyed = true; generation += 1; globalThis.removeEventListener?.('resize', onResize); cleanupDocument(); container.replaceChildren(); }, setSource: openSource };
}
