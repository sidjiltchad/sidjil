/* SIDJIL — قارئ مساحة الباحث للـ PDF وWord. */
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
const PDF_OPTIONS = { cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', disableFontFace: false, useSystemFonts: true, isEvalSupported: true };
function apiFallback(path, method = 'GET', body = undefined) {
  const origin = globalThis.__SIDJIL_READER_API_ORIGIN__ || globalThis.location?.origin || '';
  const token = document.querySelector('meta[name="csrf-token"]')?.content || '';
  return fetch(new URL(path, origin || globalThis.location?.href || undefined), {
    method, credentials: 'include',
    headers: { 'Accept': 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { 'X-CSRF-Token': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'تعذّر تنفيذ الطلب'); return data; });
}
const api = (...args) => (typeof window.api === 'function' ? window.api(...args) : apiFallback(...args));
const toast = (message, ok = true) => (typeof window.toast === 'function' ? window.toast(message, ok) : undefined);
const LANG_NAMES = { ar: 'العربية', fr: 'الفرنسية', en: 'الإنجليزية' };

function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fileIdFromUrl(url) { const m = String(url || '').match(/\/file\/(\d+)/); return m ? Number(m[1]) : null; }
function csrfToken() { return document.querySelector('meta[name="csrf-token"]')?.content || ''; }
async function waitForDocxReader(timeout = 15000) {
  if (window.SidjilDocxReader?.mount) return window.SidjilDocxReader;
  return new Promise((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => { if (window.SidjilDocxReader?.mount) { clearInterval(timer); resolve(window.SidjilDocxReader); } else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('تعذّر تحميل قارئ Word')); } }, 100); });
}

export async function mount(container, options = {}) {
  const { url, materialId, materialTitle = '', fileId = fileIdFromUrl(url), originalDownload = url, translations = [], fileActions = null, logoUrl = `${location.origin}/sidjil-logo.png`, onClose } = options;
  if (!container || !url) throw new Error('ملف القراءة غير محدد');
  container.innerHTML = ''; container.className = 'rpdf-reader-root'; document.body.classList.add('rpdf-reader-open');
  container.innerHTML = `
    <div class="rpdf-reader-overlay" data-rpdf-overlay role="dialog" aria-modal="true" aria-label="قارئ المادة">
      <div class="rpdf-reader-surface" data-rpdf-surface>
        <div class="rpdf-reader-grab" data-rpdf-grab aria-label="اسحب للأسفل لإغلاق القارئ"><span></span></div>
        <div class="rpdf-reader-tabs" data-rpdf-tabs role="tablist" aria-label="لغة القراءة">
          <div class="rpdf-reader-tab-slot">
            <a class="rpdf-reader-tab-download" data-rpdf-tab-download="original" aria-label="تحميل الأصل" title="تحميل الأصل" href="#" download>↓</a>
            <button type="button" class="rpdf-reader-tab is-active" data-rpdf-tab="original" role="tab" aria-selected="true">الأصل</button>
          </div>
          <div class="rpdf-reader-tab-slot">
            <a class="rpdf-reader-tab-download" data-rpdf-tab-download="translation" aria-label="تصدير الترجمة PDF" title="تصدير الترجمة PDF" href="#" hidden>↓</a>
            <button type="button" class="rpdf-reader-tab" data-rpdf-tab="translation" role="tab" aria-selected="false">الترجمة</button>
          </div>
        </div>
        <div class="rpdf-reader-stage" data-rpdf-stage>
          <section class="rpdf-pane rpdf-original-pane" data-rpdf-original-pane aria-label="الملف الأصلي"><div class="rpdf-pane-scroll" data-rpdf-original-scroll tabindex="0"><div class="rpdf-pdf-pages" data-rpdf-pages></div></div></section>
          <section class="rpdf-pane rpdf-translation-pane" data-rpdf-translation-pane hidden aria-label="الترجمة"><div class="rpdf-pane-scroll rpdf-docx-scroll" data-rpdf-translation-scroll tabindex="0"><div class="rpdf-docxview" data-rpdf-docxview></div></div></section>
        </div>
        <div class="rpdf-reader-controls" data-rpdf-controls aria-hidden="true">
          <button type="button" data-rpdf-request aria-label="طلب ترجمة" title="طلب ترجمة" hidden>✉️</button>
          <button type="button" class="rpdf-reader-minimize" data-rpdf-minimize aria-label="تصغير القارئ" title="تصغير القارئ">⊟</button>
          <button type="button" data-rpdf-close aria-label="إغلاق القارئ" title="إغلاق">✕</button>
        </div>
        <div class="rpdf-reader-lang-menu" data-rpdf-lang-menu hidden></div>
        <button type="button" class="rpdf-quote-btn" data-rpdf-quote hidden>💬 ناقش هذا المقطع</button>
        <form class="rpdf-composer" data-rpdf-composer hidden><div class="rpdf-quote-preview" data-rpdf-quote-preview></div><div class="post-form-row"><div class="field"><label>نوع المشاركة</label><select name="kind"><option value="critique" selected>نقد</option><option value="comment">تعليق</option><option value="review">مراجعة</option><option value="idea">فكرة</option><option value="text">تلخيص / وصف</option></select></div><div class="field"><label>العنوان</label><input name="title" required maxlength="200"></div></div><div class="field"><label>النص</label><textarea name="body" rows="4" required maxlength="20000" placeholder="اكتب نقدك أو تعليقك على المقطع المحدد…"></textarea></div><div class="composer-footer"><span class="muted small">سيُنشر النقاش مرتبطًا بالمادة ورقم الصفحة.</span><button class="btn btn-primary" type="submit">نشر النقاش</button><button class="btn btn-ghost" type="button" data-rpdf-composer-close>إلغاء</button></div></form>
        <div class="rpdf-error" data-rpdf-error hidden>تعذّر تحميل الملف. <button type="button" data-rpdf-retry>إعادة المحاولة</button></div>
      </div>
    </div>`;

  const overlay = container.querySelector('[data-rpdf-overlay]'), surface = container.querySelector('[data-rpdf-surface]'), stage = container.querySelector('[data-rpdf-stage]');
  const originalScroll = container.querySelector('[data-rpdf-original-scroll]'), translationScroll = container.querySelector('[data-rpdf-translation-scroll]'), pagesEl = container.querySelector('[data-rpdf-pages]');
  const originalPane = container.querySelector('[data-rpdf-original-pane]'), translationPane = container.querySelector('[data-rpdf-translation-pane]'), docxView = container.querySelector('[data-rpdf-docxview]'), errorEl = container.querySelector('[data-rpdf-error]'), controls = container.querySelector('[data-rpdf-controls]');
  const originalTab = container.querySelector('[data-rpdf-tab="original"]'), translationTab = container.querySelector('[data-rpdf-tab="translation"]'), originalDownloadLink = container.querySelector('[data-rpdf-tab-download="original"]'), translationDownloadLink = container.querySelector('[data-rpdf-tab-download="translation"]'), requestButton = container.querySelector('[data-rpdf-request]'), minimizeButton = container.querySelector('[data-rpdf-minimize]');
  const state = { doc: null, translationDoc: null, pagesObserver: null, currentObserver: null, cancelled: false, minimized: false, zoom: 1, renderedZoom: 1, activeTranslation: null, viewMode: 0, currentPage: 1, controlsTimer: null, docxHandles: {}, quote: null, pointers: new Map(), pinchDistance: 0, pinchZoom: 1, lastTap: 0 };
  const trs = Array.isArray(translations) ? translations.filter((x) => x?.translation_file_id) : [];
  let fullscreenTarget = null;

  function enterFullscreen() {
    const target = surface;
    if (!target || fullscreenTarget || document.fullscreenElement || typeof target.requestFullscreen !== 'function') return;
    fullscreenTarget = target;
    try {
      const result = target.requestFullscreen({ navigationUI: 'hide' });
      if (result?.catch) result.catch(() => { fullscreenTarget = null; });
    } catch { fullscreenTarget = null; }
  }

  function exitFullscreen() {
    if (fullscreenTarget && document.fullscreenElement === fullscreenTarget && typeof document.exitFullscreen === 'function') document.exitFullscreen().catch(() => {});
    fullscreenTarget = null;
  }

  function setControlsVisible(visible = true) { controls.classList.toggle('is-visible', visible); controls.setAttribute('aria-hidden', visible ? 'false' : 'true'); surface.classList.toggle('is-ui-visible', visible); if (!visible) { const menu = container.querySelector('[data-rpdf-lang-menu]'); if (menu) menu.hidden = true; } clearTimeout(state.controlsTimer); if (visible) state.controlsTimer = setTimeout(() => setControlsVisible(false), 3000); }
  function interaction() { setControlsVisible(true); }
  function setMinimized(minimized) {
    state.minimized = !!minimized;
    surface.classList.toggle('is-minimized', state.minimized);
    if (minimizeButton) {
      minimizeButton.textContent = state.minimized ? '⤢' : '⊟';
      minimizeButton.setAttribute('aria-label', state.minimized ? 'تكبير القارئ' : 'تصغير القارئ');
      minimizeButton.title = state.minimized ? 'تكبير القارئ' : 'تصغير القارئ';
    }
    if (state.minimized) exitFullscreen();
    else enterFullscreen();
    setControlsVisible(true);
  }
  function updateLayout() {
    const hasTranslation = !!state.activeTranslation;
    originalPane.hidden = hasTranslation;
    translationPane.hidden = !hasTranslation;
    originalTab.classList.toggle('is-active', !hasTranslation);
    translationTab.classList.toggle('is-active', hasTranslation);
    originalTab.setAttribute('aria-selected', hasTranslation ? 'false' : 'true');
    translationTab.setAttribute('aria-selected', hasTranslation ? 'true' : 'false');
  }
  function setDirection(lang) { const rtl = lang === 'ar'; translationPane.dir = rtl ? 'rtl' : 'ltr'; docxView.dir = rtl ? 'rtl' : 'ltr'; docxView.lang = lang || ''; translationTab.textContent = `الترجمة · ${LANG_NAMES[lang] || lang}`; }
  function exportTranslationPdf() {
    if (!state.activeTranslation || !docxView || !docxView.textContent.trim()) { toast('لم تكتمل الترجمة بعد', false); return; }
    const popup = window.open('', '_blank');
    if (!popup) { toast('اسمح بفتح نافذة التصدير لإنشاء PDF', false); return; }
    const lang = state.activeTranslation.target_lang || 'ar';
    const rtl = lang === 'ar';
    const title = escapeHtml(materialTitle || 'ترجمة سِجِل');
    const content = docxView.innerHTML;
    const logo = logoUrl;
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="${escapeHtml(lang)}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${title}</title><style>
      @page{size:auto;margin:18mm 16mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#172033}
      body{font-family:"Noto Naskh Arabic","Noto Sans Arabic",Tahoma,Arial,sans-serif;line-height:1.9;font-size:16px;direction:${rtl ? 'rtl' : 'ltr'}}
      main{position:relative;z-index:1;max-width:190mm;margin:0 auto;white-space:normal;overflow-wrap:anywhere}
      main h1,main h2,main h3,main h4{font-weight:800;line-height:1.45;margin:1.3em 0 .55em;break-after:avoid}
      main p{margin:.55em 0;text-align:justify}main table{max-width:100%;border-collapse:collapse}main img{max-width:100%;height:auto}
      .watermark{position:fixed;z-index:0;inset:0;display:grid;place-items:center;pointer-events:none}
      .watermark img{width:50%;max-width:105mm;height:auto;opacity:.16}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.watermark{position:fixed}}
    </style></head><body><div class="watermark"><img src="${logo}" alt=""></div><main>${content}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));</script></body></html>`);
    popup.document.close();
  }
  function setPage(page) { if (state.doc) state.currentPage = Math.min(state.doc.numPages, Math.max(1, page)); }
  function clearRenderedPages() { pagesEl.querySelectorAll('.rpdf-page').forEach((box) => { const canvas = box.querySelector('canvas'); const text = box.querySelector('.rpdf-textlayer'); if (canvas) { canvas.width = 0; canvas.height = 0; canvas.removeAttribute('data-rendered'); } if (text) text.replaceChildren(); }); }
  async function renderPage(pageNo, box) {
    if (!state.doc || state.cancelled || !box || box.dataset.loading === '1' || box.dataset.rendered === '1') return;
    box.dataset.loading = '1';
    try {
      const page = await state.doc.getPage(pageNo), base = page.getViewport({ scale: 1 }), available = Math.max(280, originalScroll.clientWidth - 28), viewport = page.getViewport({ scale: Math.min(2.5, Math.max(.35, available / base.width)) }), dpr = window.devicePixelRatio || 1;
      const canvas = box.querySelector('canvas'), text = box.querySelector('.rpdf-textlayer'); canvas.setAttribute('dir', 'ltr'); canvas.style.direction = 'ltr'; canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr); canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`; text.style.width = `${Math.floor(viewport.width)}px`; text.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d'); ctx.direction = 'ltr'; await page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise; text.replaceChildren(); const textContent = await page.getTextContent(); await pdfjsLib.renderTextLayer({ container: text, viewport, textContent }).promise; box.dataset.loading = '0'; box.dataset.rendered = '1';
    } catch { box.dataset.loading = '0'; }
  }
  function buildPages() {
    pagesEl.replaceChildren(); if (!state.doc) return;
    for (let i = 1; i <= state.doc.numPages; i += 1) { const box = document.createElement('div'); box.className = 'rpdf-page'; box.dataset.page = String(i); box.innerHTML = '<canvas></canvas><div class="rpdf-textlayer"></div>'; pagesEl.appendChild(box); }
    const boxes = [...pagesEl.querySelectorAll('.rpdf-page')]; state.pagesObserver?.disconnect(); state.pagesObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) renderPage(Number(entry.target.dataset.page), entry.target); }), { root: originalScroll, rootMargin: '900px 0px' }); state.currentObserver?.disconnect(); state.currentObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting && entry.intersectionRatio >= .35) setPage(Number(entry.target.dataset.page)); }), { root: originalScroll, threshold: [.35, .7] }); boxes.forEach((box) => { state.pagesObserver.observe(box); state.currentObserver.observe(box); }); if (boxes[0]) renderPage(1, boxes[0]); setPage(1);
  }
  function rerenderAfterZoom(force = false) { if (!force && Math.abs(state.zoom - state.renderedZoom) < .02) return; state.renderedZoom = state.zoom; pagesEl.style.zoom = String(state.zoom); docxView.style.zoom = String(state.zoom); docxView.style.setProperty('--reader-word-scale', String(state.zoom)); }
  function showOriginal() { state.activeTranslation = null; state.viewMode = 0; updateLayout(); translationPane.hidden = true; originalScroll.focus({ preventScroll: true }); setControlsVisible(true); }
  async function loadPdfTranslation(item, pdfUrl) {
    docxView.replaceChildren(); docxView.className = 'rpdf-pdf-pages rpdf-translation-pages';
    state.translationDoc = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: true, ...PDF_OPTIONS }).promise;
    for (let i = 1; i <= state.translationDoc.numPages; i += 1) {
      const box = document.createElement('div'); box.className = 'rpdf-page'; box.dataset.page = String(i); box.innerHTML = '<canvas></canvas><div class="rpdf-textlayer"></div>'; docxView.appendChild(box);
      const page = await state.translationDoc.getPage(i), base = page.getViewport({ scale: 1 }), available = Math.max(280, translationScroll.clientWidth - 28), viewport = page.getViewport({ scale: Math.min(2.5, Math.max(.35, available / base.width)) }), dpr = window.devicePixelRatio || 1;
      const canvas = box.querySelector('canvas'), text = box.querySelector('.rpdf-textlayer'); canvas.setAttribute('dir', 'ltr'); canvas.style.direction = 'ltr'; canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr); canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`; text.style.width = `${Math.floor(viewport.width)}px`; text.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d'); ctx.direction = 'ltr'; await page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise; const textContent = await page.getTextContent(); await pdfjsLib.renderTextLayer({ container: text, viewport, textContent }).promise;
    }
  }
  async function loadTranslation(item) {
    const base = globalThis.__SIDJIL_READER_API_ORIGIN__ || globalThis.location?.origin || '';
    const docxUrl = new URL(`/file/${item.translation_file_id}`, base || globalThis.location?.href || undefined).toString(); setDirection(item.target_lang || 'ar'); translationPane.hidden = false; docxView.classList.add('is-loading');
    if (state.docxHandles[docxUrl]) { docxView.classList.remove('is-loading'); return; }
    docxView.innerHTML = '<p class="docx-loading muted">جارٍ تحميل الترجمة…</p>';
    try { if (/pdf/i.test(`${item.translation_mime || ''} ${item.translation_filename || ''}`)) await loadPdfTranslation(item, docxUrl); else { const reader = await waitForDocxReader(); state.docxHandles[docxUrl] = await reader.mount(docxView, { url: docxUrl, lang: item.target_lang || 'ar', textOnly: true }); } docxView.classList.remove('is-loading'); }
    catch { docxView.classList.remove('is-loading'); docxView.innerHTML = `<p class="docx-error">تعذّر عرض الترجمة داخل المتصفح. <button type="button" data-rpdf-translation-retry>إعادة المحاولة</button></p>`; docxView.querySelector('[data-rpdf-translation-retry]')?.addEventListener('click', () => { delete state.docxHandles[docxUrl]; loadTranslation(item); }); }
  }
  async function selectTranslation(item) { if (!item) return; state.activeTranslation = item; state.viewMode = 1; const base = globalThis.__SIDJIL_READER_API_ORIGIN__ || globalThis.location?.origin || ''; translationDownloadLink.href = /pdf/i.test(`${item.translation_mime || ''} ${item.translation_filename || ''}`) ? `${new URL(`/file/${item.translation_file_id}`, base || globalThis.location?.href || undefined).toString()}?download=1&watermark=1` : '#'; translationDownloadLink.hidden = false; updateLayout(); await loadTranslation(item); setControlsVisible(true); }
  function showLanguageMenu() { const menu = container.querySelector('[data-rpdf-lang-menu]'); menu.replaceChildren(); if (trs.length <= 1) { selectTranslation(trs[0]); return; } trs.forEach((item) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = LANG_NAMES[item.target_lang] || item.target_lang; b.addEventListener('click', () => { menu.hidden = true; selectTranslation(item); }); menu.appendChild(b); }); menu.hidden = false; setControlsVisible(true); }
  async function requestTranslation() { if (!materialId || requestButton.disabled) return; requestButton.disabled = true; try { const base = globalThis.__SIDJIL_READER_API_ORIGIN__ || globalThis.location?.origin || ''; const response = await fetch(new URL('/api/v1/translation-requests', base || globalThis.location?.href || undefined), { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', ...(csrfToken() ? { 'X-CSRF-Token': csrfToken() } : {}) }, body: JSON.stringify({ material_id: Number(materialId), source_file_id: Number(fileId) || null }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'تعذّر إرسال طلب الترجمة'); requestButton.textContent = '✓'; requestButton.title = data.duplicate ? 'طلب الترجمة مسجل مسبقًا' : 'تم إرسال الطلب'; } catch (error) { requestButton.disabled = false; toast(error.message || 'تعذّر إرسال الطلب', false); } }
  originalScroll.addEventListener('scroll', interaction, { passive: true }); translationScroll.addEventListener('scroll', interaction, { passive: true });
  const wakeReader = (event) => { if (event.target.closest('button,a,.rpdf-reader-controls,.rpdf-reader-lang-menu')) return; interaction(); if (!state.minimized) enterFullscreen(); };
  surface.addEventListener('pointerdown', wakeReader, { passive: true });
  surface.addEventListener('touchstart', wakeReader, { passive: true });
  stage.addEventListener('pointerup', (event) => { if (event.target.closest('button,a,.rpdf-reader-controls,.rpdf-reader-lang-menu')) return; const now = Date.now(); if (now - state.lastTap < 320) { state.zoom = state.zoom === 1 ? 2 : 1; rerenderAfterZoom(true); } state.lastTap = now; interaction(); });
  stage.addEventListener('pointerdown', (event) => { state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (state.pointers.size === 2) { const [a, b] = [...state.pointers.values()]; state.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); state.pinchZoom = state.zoom; } });
  stage.addEventListener('pointermove', (event) => { if (!state.pointers.has(event.pointerId)) return; state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (state.pointers.size === 2) { const [a, b] = [...state.pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y); if (state.pinchDistance > 0) { state.zoom = Math.max(.5, Math.min(4, state.pinchZoom * distance / state.pinchDistance)); rerenderAfterZoom(); } } });
  stage.addEventListener('pointerup', (event) => { state.pointers.delete(event.pointerId); if (state.pointers.size < 2) rerenderAfterZoom(true); }); stage.addEventListener('pointercancel', (event) => state.pointers.delete(event.pointerId));
  container.querySelector('[data-rpdf-grab]').addEventListener('pointerdown', (event) => { event.preventDefault(); const startY = event.clientY, startTime = Date.now(); const move = (e) => { surface.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`; }; const end = (e) => { const dy = Math.max(0, e.clientY - startY), velocity = dy / Math.max(1, Date.now() - startTime); surface.style.transform = ''; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); if (dy > window.innerHeight * .25 || velocity > 1.1) close(); }; document.addEventListener('pointermove', move); document.addEventListener('pointerup', end, { once: true }); });
  container.querySelector('[data-rpdf-close]').addEventListener('click', close); if (minimizeButton) minimizeButton.addEventListener('click', () => setMinimized(!state.minimized)); overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); }); controls.addEventListener('pointerdown', (event) => event.stopPropagation()); originalTab.addEventListener('click', showOriginal); translationTab.addEventListener('click', () => { if (trs.length) showLanguageMenu(); }); requestButton.addEventListener('click', requestTranslation);
  function hideQuote() { container.querySelector('[data-rpdf-quote]').hidden = true; state.quote = null; }
  stage.addEventListener('mouseup', () => setTimeout(() => { const selection = window.getSelection(), text = selection?.toString().trim(); if (!text || text.length < 4 || !selection || !container.contains(selection.anchorNode)) return hideQuote(); const rect = selection.getRangeAt(0).getBoundingClientRect(), stageRect = stage.getBoundingClientRect(), quote = container.querySelector('[data-rpdf-quote]'); state.quote = { text: text.slice(0, 2000), page: String(state.currentPage) }; quote.style.top = `${Math.max(8, rect.bottom - stageRect.top + 8)}px`; quote.style.insetInlineStart = `${Math.max(8, rect.left - stageRect.left)}px`; quote.hidden = false; }, 30));
  container.querySelector('[data-rpdf-quote]').addEventListener('click', () => { if (!state.quote) return; const composer = container.querySelector('[data-rpdf-composer]'); composer.hidden = false; composer.querySelector('[name=title]').value = `نقد مقطع من «${String(materialTitle).slice(0, 60)}» — ص ${state.quote.page}`; container.querySelector('[data-rpdf-quote-preview]').innerHTML = `<strong>المقطع المحدد (ص ${escapeHtml(state.quote.page)}):</strong><p>«${escapeHtml(state.quote.text.slice(0, 400))}»</p>`; composer.querySelector('[name=body]').focus(); });
  container.querySelector('[data-rpdf-composer-close]')?.addEventListener('click', () => { container.querySelector('[data-rpdf-composer]').hidden = true; });
  container.querySelector('[data-rpdf-composer]').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type=submit]'), fd = new FormData(form); submit.disabled = true; try { await api('/api/v1/admin/discussions', 'POST', { kind: fd.get('kind') || 'critique', title: String(fd.get('title') || '').trim(), body: String(fd.get('body') || '').trim(), material_id: materialId ? Number(materialId) : null, quote_text: state.quote?.text || null, page_no: state.quote?.page || null }); toast('نُشر النقاش مرتبطًا بالمقطع ورقم الصفحة'); form.hidden = true; form.reset(); hideQuote(); } catch (error) { toast(error.message || 'تعذّر النشر', false); } submit.disabled = false; });
  async function loadPdf() { try { state.doc = await pdfjsLib.getDocument({ url, withCredentials: true, ...PDF_OPTIONS }).promise; if (!state.cancelled) { errorEl.hidden = true; buildPages(); } } catch { errorEl.hidden = false; } }
  function close() { if (state.cancelled) return; state.cancelled = true; state.pagesObserver?.disconnect(); state.currentObserver?.disconnect(); clearTimeout(state.controlsTimer); exitFullscreen(); Object.values(state.docxHandles).forEach((handle) => { try { handle?.destroy?.(); } catch {} }); try { state.translationDoc?.destroy?.(); } catch {} document.body.classList.remove('rpdf-reader-open'); container.remove(); if (window.__sidjilResearcherReaderClose === close) delete window.__sidjilResearcherReaderClose; onClose?.(); }
  container.querySelector('[data-rpdf-retry]').addEventListener('click', () => { errorEl.hidden = true; loadPdf(); });
  originalDownloadLink.href = `${originalDownload || url}${String(originalDownload || url).includes('?') ? '&' : '?'}download=1&watermark=1`;
  if (fileActions?.downloadFile) originalDownloadLink.addEventListener('click', async (event) => {
    event.preventDefault();
    try { await fileActions.downloadFile({ id: fileId, url: originalDownload || url, filename: materialTitle || 'sidjil-original.pdf', mime: 'application/pdf' }, { title: materialTitle, variant: 'original' }); }
    catch (error) { toast(error?.message || 'تعذّر تنزيل الأصل', false); }
  });
  translationTab.disabled = !trs.length;
  if (trs.length) {
    translationDownloadLink.href = '#';
    translationDownloadLink.hidden = false;
    translationDownloadLink.addEventListener('click', async (event) => { if (!state.activeTranslation || !/pdf/i.test(`${state.activeTranslation.translation_mime || ''} ${state.activeTranslation.translation_filename || ''}`)) { event.preventDefault(); exportTranslationPdf(); return; } if (fileActions?.downloadFile) { event.preventDefault(); try { await fileActions.downloadFile({ id: state.activeTranslation.translation_file_id, url: translationDownloadLink.href, filename: state.activeTranslation.translation_filename || 'sidjil-translation.pdf', mime: 'application/pdf' }, { title: materialTitle, variant: 'translation' }); } catch (error) { toast(error?.message || 'تعذّر تنزيل الترجمة', false); } } });
  }
  else requestButton.hidden = !materialId;
  enterFullscreen();
  await loadPdf();
  if (options.initialTranslationId) {
    const initial = trs.find((item) => Number(item.translation_file_id) === Number(options.initialTranslationId));
    if (initial) await selectTranslation(initial);
  }
  setControlsVisible(false); return { destroy: close, close };
}

export async function openResearcherReader(options = {}) {
  if (window.__sidjilResearcherReaderClose) window.__sidjilResearcherReaderClose();
  const root = document.createElement('div'); root.className = 'rpdf-reader-host'; document.body.appendChild(root);
  const sourceUrl = options.url || options.pdf || options.originalUrl || '';
  if (!sourceUrl) {
    root.remove();
    toast('ملف القراءة غير محدد', false);
    return { destroy() {}, close() {} };
  }
  let translations = options.translations;
  if (!Array.isArray(translations) && options.material) { try { const response = await fetch(`/api/v1/materials/${encodeURIComponent(options.material)}/translations`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const data = await response.json(); translations = data.items || []; } catch { translations = []; } }
  const handle = await mount(root, { ...options, url: sourceUrl, materialId: options.material || options.materialId, originalDownload: options.originalDownload || options.pdfDownload || sourceUrl, translations }); window.__sidjilResearcherReaderClose = handle.close; return handle;
}
window.SidjilPdfReader = { mount };
window.SidjilOpenDocumentReader = openResearcherReader;
