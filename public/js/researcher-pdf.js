/* SIDJIL — قارئ مساحة الباحث للـ PDF وWord. */
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
const PDF_OPTIONS = { cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', disableFontFace: false, useSystemFonts: true, isEvalSupported: true };
const api = (...args) => (typeof window.api === 'function' ? window.api(...args) : null);
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
  const { url, materialId, materialTitle = '', fileId = fileIdFromUrl(url), originalDownload = url, translations = [] } = options;
  if (!container || !url) throw new Error('ملف القراءة غير محدد');
  container.innerHTML = ''; container.className = 'rpdf-reader-root'; document.body.classList.add('rpdf-reader-open');
  container.innerHTML = `
    <div class="rpdf-reader-overlay" data-rpdf-overlay role="dialog" aria-modal="true" aria-label="قارئ المادة">
      <div class="rpdf-reader-surface" data-rpdf-surface>
        <div class="rpdf-reader-grab" data-rpdf-grab aria-label="اسحب للأسفل لإغلاق القارئ"><span></span></div>
        <div class="rpdf-reader-stage" data-rpdf-stage>
          <section class="rpdf-pane rpdf-original-pane" data-rpdf-original-pane aria-label="الملف الأصلي"><div class="rpdf-pane-label">الأصل <span data-rpdf-page>1 / …</span></div><div class="rpdf-pane-scroll" data-rpdf-original-scroll tabindex="0"><div class="rpdf-pdf-pages" data-rpdf-pages></div></div></section>
          <section class="rpdf-pane rpdf-translation-pane" data-rpdf-translation-pane hidden aria-label="الترجمة"><div class="rpdf-pane-label"><span data-rpdf-translation-label>الترجمة</span><span data-rpdf-translation-status></span></div><div class="rpdf-pane-scroll rpdf-docx-scroll" data-rpdf-translation-scroll tabindex="0"><div class="rpdf-docxview" data-rpdf-docxview></div></div></section>
        </div>
        <div class="rpdf-reader-controls" data-rpdf-controls aria-hidden="true">
          <button type="button" data-rpdf-language aria-label="القراءة بلغة أخرى" title="القراءة بلغة أخرى">🌐</button>
          <a data-rpdf-download-original aria-label="تحميل الملف الأصلي" title="تحميل الأصل" href="#" download>⬇️</a>
          <a data-rpdf-download-translation aria-label="تحميل النسخة المترجمة" title="تحميل الترجمة" href="#" download hidden>⬇️🌐</a>
          <button type="button" data-rpdf-dual aria-label="عرض الأصل والترجمة معًا" title="عرض ثنائي" hidden>◐</button>
          <button type="button" data-rpdf-request aria-label="طلب ترجمة" title="طلب ترجمة" hidden>✉️</button>
          <button type="button" data-rpdf-original aria-label="قراءة الأصل" title="قراءة الأصل">📄</button>
          <button type="button" data-rpdf-sync aria-label="مزامنة التمرير" title="مزامنة التمرير" aria-pressed="true">🔗</button>
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
  const originalPane = container.querySelector('[data-rpdf-original-pane]'), translationPane = container.querySelector('[data-rpdf-translation-pane]'), docxView = container.querySelector('[data-rpdf-docxview]'), pageLabel = container.querySelector('[data-rpdf-page]'), errorEl = container.querySelector('[data-rpdf-error]'), controls = container.querySelector('[data-rpdf-controls]');
  const langButton = container.querySelector('[data-rpdf-language]'), originalButton = container.querySelector('[data-rpdf-original]'), dualButton = container.querySelector('[data-rpdf-dual]'), requestButton = container.querySelector('[data-rpdf-request]'), translationDownload = container.querySelector('[data-rpdf-download-translation]'), syncButton = container.querySelector('[data-rpdf-sync]');
  const state = { doc: null, pagesObserver: null, currentObserver: null, cancelled: false, zoom: 1, renderedZoom: 1, activeTranslation: null, dual: false, sync: true, controlsTimer: null, docxHandles: {}, quote: null, pointers: new Map(), pinchDistance: 0, pinchZoom: 1, lastTap: 0 };
  const trs = Array.isArray(translations) ? translations.filter((x) => x?.translation_file_id) : [];

  function setControlsVisible(visible = true) { controls.classList.toggle('is-visible', visible); controls.setAttribute('aria-hidden', visible ? 'false' : 'true'); clearTimeout(state.controlsTimer); if (visible) state.controlsTimer = setTimeout(() => setControlsVisible(false), 3000); }
  function interaction() { setControlsVisible(true); }
  function updateLayout() { const hasTranslation = !!state.activeTranslation; stage.classList.toggle('is-dual', state.dual && hasTranslation); originalPane.hidden = hasTranslation && !state.dual; translationPane.hidden = !hasTranslation; originalButton.classList.toggle('is-active', !hasTranslation || state.dual); dualButton.classList.toggle('is-active', state.dual); }
  function setDirection(lang) { const rtl = lang === 'ar'; translationPane.dir = rtl ? 'rtl' : 'ltr'; docxView.dir = rtl ? 'rtl' : 'ltr'; docxView.lang = lang || ''; container.querySelector('[data-rpdf-translation-label]').textContent = `الترجمة · ${LANG_NAMES[lang] || lang}`; }
  function setPage(page) { if (state.doc) pageLabel.textContent = `${Math.min(state.doc.numPages, Math.max(1, page))} / ${state.doc.numPages}`; }
  function clearRenderedPages() { pagesEl.querySelectorAll('.rpdf-page').forEach((box) => { const canvas = box.querySelector('canvas'); const text = box.querySelector('.rpdf-textlayer'); if (canvas) { canvas.width = 0; canvas.height = 0; canvas.removeAttribute('data-rendered'); } if (text) text.replaceChildren(); }); }
  async function renderPage(pageNo, box) {
    if (!state.doc || state.cancelled || !box || box.dataset.loading === '1' || box.dataset.rendered === '1') return;
    box.dataset.loading = '1';
    try {
      const page = await state.doc.getPage(pageNo), base = page.getViewport({ scale: 1 }), available = Math.max(280, originalScroll.clientWidth - 28), viewport = page.getViewport({ scale: Math.min(4, Math.max(.35, (available / base.width) * state.zoom)) }), dpr = window.devicePixelRatio || 1;
      const canvas = box.querySelector('canvas'), text = box.querySelector('.rpdf-textlayer'); canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr); canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`; text.style.width = `${Math.floor(viewport.width)}px`; text.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d'); ctx.direction = 'ltr'; await page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise; text.replaceChildren(); const textContent = await page.getTextContent(); await pdfjsLib.renderTextLayer({ container: text, viewport, textContent }).promise; box.dataset.loading = '0'; box.dataset.rendered = '1';
    } catch { box.dataset.loading = '0'; }
  }
  function buildPages() {
    pagesEl.replaceChildren(); if (!state.doc) return;
    for (let i = 1; i <= state.doc.numPages; i += 1) { const box = document.createElement('div'); box.className = 'rpdf-page'; box.dataset.page = String(i); box.innerHTML = '<canvas></canvas><div class="rpdf-textlayer"></div>'; pagesEl.appendChild(box); }
    const boxes = [...pagesEl.querySelectorAll('.rpdf-page')]; state.pagesObserver?.disconnect(); state.pagesObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) renderPage(Number(entry.target.dataset.page), entry.target); }), { root: originalScroll, rootMargin: '900px 0px' }); state.currentObserver?.disconnect(); state.currentObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting && entry.intersectionRatio >= .35) setPage(Number(entry.target.dataset.page)); }), { root: originalScroll, threshold: [.35, .7] }); boxes.forEach((box) => { state.pagesObserver.observe(box); state.currentObserver.observe(box); }); if (boxes[0]) renderPage(1, boxes[0]); setPage(1);
  }
  function rerenderAfterZoom(force = false) { if (!force && Math.abs(state.zoom - state.renderedZoom) < .12) return; state.renderedZoom = state.zoom; docxView.style.setProperty('--reader-word-scale', String(state.zoom)); clearRenderedPages(); pagesEl.querySelectorAll('.rpdf-page').forEach((box) => { const rect = box.getBoundingClientRect(), root = originalScroll.getBoundingClientRect(); if (rect.bottom >= root.top - 900 && rect.top <= root.bottom + 900) renderPage(Number(box.dataset.page), box); }); }
  function showOriginal() { state.activeTranslation = null; state.dual = false; updateLayout(); translationDownload.hidden = true; translationPane.hidden = true; originalScroll.focus({ preventScroll: true }); setControlsVisible(true); }
  async function loadTranslation(item) {
    const docxUrl = `/file/${item.translation_file_id}`; setDirection(item.target_lang || 'ar'); translationPane.hidden = false; docxView.classList.add('is-loading');
    if (state.docxHandles[docxUrl]) { docxView.classList.remove('is-loading'); return; }
    docxView.innerHTML = '<p class="docx-loading muted">جارٍ تحميل الترجمة…</p>';
    try { const reader = await waitForDocxReader(); state.docxHandles[docxUrl] = await reader.mount(docxView, { url: docxUrl, lang: item.target_lang || 'ar' }); docxView.classList.remove('is-loading'); }
    catch { docxView.classList.remove('is-loading'); docxView.innerHTML = `<p class="docx-error">تعذّر عرض الترجمة داخل المتصفح. <a href="${escapeHtml(docxUrl)}?download=1">تنزيل ملف الترجمة</a> <button type="button" data-rpdf-translation-retry>إعادة المحاولة</button></p>`; docxView.querySelector('[data-rpdf-translation-retry]')?.addEventListener('click', () => { delete state.docxHandles[docxUrl]; loadTranslation(item); }); }
  }
  async function selectTranslation(item, dual = false) { if (!item) return; state.activeTranslation = item; state.dual = !!dual; updateLayout(); translationDownload.hidden = false; translationDownload.href = `/file/${item.translation_file_id}?download=1`; await loadTranslation(item); setControlsVisible(true); }
  function showLanguageMenu() { const menu = container.querySelector('[data-rpdf-lang-menu]'); menu.replaceChildren(); if (trs.length <= 1) { selectTranslation(trs[0], false); return; } trs.forEach((item) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = LANG_NAMES[item.target_lang] || item.target_lang; b.addEventListener('click', () => { menu.hidden = true; selectTranslation(item, false); }); menu.appendChild(b); }); menu.hidden = false; setControlsVisible(true); }
  async function requestTranslation() { if (!materialId || requestButton.disabled) return; requestButton.disabled = true; try { const response = await fetch('/api/v1/translation-requests', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(csrfToken() ? { 'X-CSRF-Token': csrfToken() } : {}) }, body: JSON.stringify({ material_id: Number(materialId), source_file_id: Number(fileId) || null }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'تعذّر إرسال طلب الترجمة'); requestButton.textContent = '✓'; requestButton.title = data.duplicate ? 'طلب الترجمة مسجل مسبقًا' : 'تم إرسال طلب الترجمة'; } catch (error) { requestButton.disabled = false; toast(error.message || 'تعذّر إرسال الطلب', false); } }
  function syncScroll(source, target) { if (!state.sync || state.cancelled || !target || !state.dual) return; const maxSource = Math.max(1, source.scrollHeight - source.clientHeight), maxTarget = Math.max(0, target.scrollHeight - target.clientHeight); target.scrollTop = Math.max(0, Math.min(1, source.scrollTop / maxSource)) * maxTarget; }
  originalScroll.addEventListener('scroll', () => { interaction(); syncScroll(originalScroll, translationScroll); }, { passive: true }); translationScroll.addEventListener('scroll', () => { interaction(); syncScroll(translationScroll, originalScroll); }, { passive: true });
  stage.addEventListener('pointerup', (event) => { if (event.target.closest('button,a,.rpdf-reader-controls,.rpdf-reader-lang-menu')) return; const now = Date.now(); if (now - state.lastTap < 320) { state.zoom = state.zoom === 1 ? 2 : 1; rerenderAfterZoom(true); } state.lastTap = now; interaction(); });
  stage.addEventListener('pointerdown', (event) => { state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (state.pointers.size === 2) { const [a, b] = [...state.pointers.values()]; state.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); state.pinchZoom = state.zoom; } });
  stage.addEventListener('pointermove', (event) => { if (!state.pointers.has(event.pointerId)) return; state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (state.pointers.size === 2) { const [a, b] = [...state.pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y); if (state.pinchDistance > 0) { state.zoom = Math.max(.5, Math.min(4, state.pinchZoom * distance / state.pinchDistance)); rerenderAfterZoom(); } } });
  stage.addEventListener('pointerup', (event) => { state.pointers.delete(event.pointerId); if (state.pointers.size < 2) rerenderAfterZoom(true); }); stage.addEventListener('pointercancel', (event) => state.pointers.delete(event.pointerId));
  container.querySelector('[data-rpdf-grab]').addEventListener('pointerdown', (event) => { event.preventDefault(); const startY = event.clientY, startTime = Date.now(); const move = (e) => { surface.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`; }; const end = (e) => { const dy = Math.max(0, e.clientY - startY), velocity = dy / Math.max(1, Date.now() - startTime); surface.style.transform = ''; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); if (dy > window.innerHeight * .25 || velocity > 1.1) close(); }; document.addEventListener('pointermove', move); document.addEventListener('pointerup', end, { once: true }); });
  container.querySelector('[data-rpdf-close]').addEventListener('click', close); overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); }); controls.addEventListener('pointerdown', (event) => event.stopPropagation()); langButton.addEventListener('click', showLanguageMenu); originalButton.addEventListener('click', showOriginal); dualButton.addEventListener('click', () => { if (state.activeTranslation) { state.dual = !state.dual; updateLayout(); setControlsVisible(true); } }); syncButton.addEventListener('click', () => { state.sync = !state.sync; syncButton.setAttribute('aria-pressed', state.sync ? 'true' : 'false'); syncButton.textContent = state.sync ? '🔗' : '⛓️‍💥'; setControlsVisible(true); }); requestButton.addEventListener('click', requestTranslation);
  function hideQuote() { container.querySelector('[data-rpdf-quote]').hidden = true; state.quote = null; }
  stage.addEventListener('mouseup', () => setTimeout(() => { const selection = window.getSelection(), text = selection?.toString().trim(); if (!text || text.length < 4 || !selection || !container.contains(selection.anchorNode)) return hideQuote(); const rect = selection.getRangeAt(0).getBoundingClientRect(), stageRect = stage.getBoundingClientRect(), quote = container.querySelector('[data-rpdf-quote]'); state.quote = { text: text.slice(0, 2000), page: pageLabel.textContent.split('/')[0].trim() }; quote.style.top = `${Math.max(8, rect.bottom - stageRect.top + 8)}px`; quote.style.insetInlineStart = `${Math.max(8, rect.left - stageRect.left)}px`; quote.hidden = false; }, 30));
  container.querySelector('[data-rpdf-quote]').addEventListener('click', () => { if (!state.quote) return; const composer = container.querySelector('[data-rpdf-composer]'); composer.hidden = false; composer.querySelector('[name=title]').value = `نقد مقطع من «${String(materialTitle).slice(0, 60)}» — ص ${state.quote.page}`; container.querySelector('[data-rpdf-quote-preview]').innerHTML = `<strong>المقطع المحدد (ص ${escapeHtml(state.quote.page)}):</strong><p>«${escapeHtml(state.quote.text.slice(0, 400))}»</p>`; composer.querySelector('[name=body]').focus(); });
  container.querySelector('[data-rpdf-composer-close]')?.addEventListener('click', () => { container.querySelector('[data-rpdf-composer]').hidden = true; });
  container.querySelector('[data-rpdf-composer]').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type=submit]'), fd = new FormData(form); submit.disabled = true; try { await api('/api/v1/admin/discussions', 'POST', { kind: fd.get('kind') || 'critique', title: String(fd.get('title') || '').trim(), body: String(fd.get('body') || '').trim(), material_id: materialId ? Number(materialId) : null, quote_text: state.quote?.text || null, page_no: state.quote?.page || null }); toast('نُشر النقاش مرتبطًا بالمقطع ورقم الصفحة'); form.hidden = true; form.reset(); hideQuote(); } catch (error) { toast(error.message || 'تعذّر النشر', false); } submit.disabled = false; });
  async function loadPdf() { try { state.doc = await pdfjsLib.getDocument({ url, withCredentials: true, ...PDF_OPTIONS }).promise; if (!state.cancelled) { errorEl.hidden = true; buildPages(); } } catch { errorEl.hidden = false; } }
  function close() { if (state.cancelled) return; state.cancelled = true; state.pagesObserver?.disconnect(); state.currentObserver?.disconnect(); clearTimeout(state.controlsTimer); Object.values(state.docxHandles).forEach((handle) => { try { handle?.destroy?.(); } catch {} }); document.body.classList.remove('rpdf-reader-open'); container.remove(); if (window.__sidjilResearcherReaderClose === close) delete window.__sidjilResearcherReaderClose; }
  container.querySelector('[data-rpdf-retry]').addEventListener('click', () => { errorEl.hidden = true; loadPdf(); });
  container.querySelector('[data-rpdf-download-original]').href = originalDownload || url;
  if (trs.length) { dualButton.hidden = false; translationDownload.hidden = true; langButton.title = trs.length > 1 ? 'اختيار لغة القراءة' : `القراءة بـ${LANG_NAMES[trs[0].target_lang] || trs[0].target_lang}`; } else { requestButton.hidden = !materialId; translationDownload.hidden = true; dualButton.hidden = true; }
  await loadPdf(); setControlsVisible(false); return { destroy: close, close };
}

async function openResearcherReader(options = {}) {
  if (window.__sidjilResearcherReaderClose) window.__sidjilResearcherReaderClose();
  const root = document.createElement('div'); root.className = 'rpdf-reader-host'; document.body.appendChild(root);
  let translations = options.translations;
  if (!Array.isArray(translations) && options.material) { try { const response = await fetch(`/api/v1/materials/${encodeURIComponent(options.material)}/translations`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const data = await response.json(); translations = data.items || []; } catch { translations = []; } }
  const handle = await mount(root, { ...options, materialId: options.material || options.materialId, translations }); window.__sidjilResearcherReaderClose = handle.close; return handle;
}
window.SidjilPdfReader = { mount };
window.SidjilOpenDocumentReader = openResearcherReader;
