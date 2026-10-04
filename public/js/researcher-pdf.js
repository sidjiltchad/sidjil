/* قارئ PDF لمساحة الباحث: تمرير مستمر، تحديد نص، ترجمة المقطع وتعليق موضعي. */
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
const PDF_RENDER_OPTIONS = {
  cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true,
  standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
  disableFontFace: false, useSystemFonts: true,
};
async function requestJson(path, method = 'GET', body) {
  const opts = { method, credentials: 'same-origin', headers: { accept: 'application/json' } };
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || sessionStorage.getItem('csrfToken') || '';
  if (method !== 'GET' && method !== 'HEAD' && csrf) opts.headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const response = await fetch(path, opts);
  let payload = null;
  try { payload = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(payload?.error || `خطأ في الخادم (${response.status})`);
  return payload || {};
}
const api = (...args) => typeof window.api === 'function' ? window.api(...args) : requestJson(...args);
const toast = (...args) => (window.toast ? window.toast(...args) : alert(args[0]));
const esc = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export async function mount(container, { url, materialId, materialTitle }) {
  container.innerHTML = '';
  container.classList.add('rpdf');
  container.innerHTML = `
    <div class="rpdf-toolbar" dir="ltr" role="toolbar" aria-label="أدوات قراءة PDF">
      <button type="button" data-rpdf-prev aria-label="الصفحة السابقة">‹</button>
      <span class="rpdf-num"><b data-rpdf-num>1</b> / <span data-rpdf-count>…</span></span>
      <button type="button" data-rpdf-next aria-label="الصفحة التالية">›</button>
      <span class="rpdf-sep"></span>
      <button type="button" data-rpdf-zoom-out aria-label="تصغير">−</button>
      <button type="button" data-rpdf-zoom-in aria-label="تكبير">+</button>
      <button type="button" data-rpdf-fit>ملاءمة العرض</button>
      <button type="button" data-rpdf-live-translation aria-pressed="false">ترجمة الصفحات</button>
      <label class="rpdf-target-label">إلى <select data-rpdf-target aria-label="لغة الترجمة"><option value="ar" selected>العربية</option><option value="fr">Français</option><option value="en">English</option></select></label>
      <span class="rpdf-translation-progress" data-rpdf-translation-progress hidden>0%</span>
      <button type="button" data-rpdf-full aria-pressed="false">ملء الشاشة</button>
    </div>
    <div class="rpdf-stage" data-rpdf-stage tabindex="0" aria-label="صفحات المستند، مرر للأعلى أو الأسفل">
      <div class="rpdf-pages" data-rpdf-pages></div>
    </div>
    <div class="rpdf-selection-actions" data-rpdf-actions hidden>
      <span data-rpdf-selection-label>مقطع محدد</span>
      <button type="button" data-rpdf-translate>ترجمة المقطع</button>
      <button type="button" data-rpdf-quote>التعليق على المقطع</button>
      <button type="button" data-rpdf-clear>إلغاء التحديد</button>
    </div>
    <form class="rpdf-composer" data-rpdf-composer hidden>
      <div class="rpdf-quote-preview" data-rpdf-quote-preview></div>
      <div class="post-form-row"><div class="field"><label>نوع المشاركة</label><select name="kind"><option value="comment">تعليق</option><option value="review">مراجعة</option><option value="critique" selected>نقد</option><option value="idea">فكرة</option><option value="text">تلخيص / وصف</option></select></div>
      <div class="field"><label>العنوان</label><input name="title" required maxlength="200"></div></div>
      <div class="field"><label>نص التعليق</label><textarea name="body" rows="3" required maxlength="20000" placeholder="اكتب تعليقك على المقطع المحدد…"></textarea></div>
      <div class="composer-footer"><span class="muted small">سيُحفظ النص المحدد ورقم الصفحة وموضعه الدقيق.</span><button class="btn btn-primary" type="submit">نشر التعليق</button><button class="btn btn-ghost" type="button" data-rpdf-composer-close>إلغاء</button></div>
    </form>
    <div class="rpdf-error" data-rpdf-error hidden>تعذّر تحميل الملف.</div>`;

  const stage = container.querySelector('[data-rpdf-stage]');
  const pages = container.querySelector('[data-rpdf-pages]');
  const countEl = container.querySelector('[data-rpdf-count]');
  const numEl = container.querySelector('[data-rpdf-num]');
  const error = container.querySelector('[data-rpdf-error]');
  const liveTranslationButton = container.querySelector('[data-rpdf-live-translation]');
  const targetSelect = container.querySelector('[data-rpdf-target]');
  const translationProgress = container.querySelector('[data-rpdf-translation-progress]');
  const actions = container.querySelector('[data-rpdf-actions]');
  const composer = container.querySelector('[data-rpdf-composer]');
  const quotePreview = container.querySelector('[data-rpdf-quote-preview]');
  const selectionLabel = container.querySelector('[data-rpdf-selection-label]');
  const state = { doc: null, page: 1, scale: 1, fit: true, cancelled: false, quote: null, observer: null, pinch: null, tapAt: 0, translation: false, target: 'ar', translationRequests: new Map(), translatedPages: new Set() };

  function pageScale(page) {
    if (state.fit) {
      const base = page.getViewport({ scale: 1 });
      const available = stage.clientWidth > 900 ? (stage.clientWidth - 52) / 2 : stage.clientWidth - 28;
      state.scale = Math.min(2.5, Math.max(.35, available / base.width));
    }
    return page.getViewport({ scale: state.scale });
  }

  function makePage(pageNumber) {
    const article = document.createElement('article');
    article.className = 'rpdf-page'; article.dataset.rpdfPage = String(pageNumber); article.setAttribute('dir', 'ltr');
    article.setAttribute('aria-label', `صفحة ${pageNumber}`);
    const sourcePane = document.createElement('div'); sourcePane.className = 'rpdf-source-pane';
    const sourceLabel = document.createElement('div'); sourceLabel.className = 'rpdf-pane-label'; sourceLabel.textContent = `الأصل · الصفحة ${pageNumber}`;
    const canvas = document.createElement('canvas'); canvas.dataset.rpdfCanvas = '';
    const layer = document.createElement('div'); layer.className = 'rpdf-textlayer'; layer.dataset.rpdfText = '';
    sourcePane.append(sourceLabel, canvas, layer);
    const translatedPane = document.createElement('section'); translatedPane.className = 'rpdf-translation-pane'; translatedPane.dataset.rpdfTranslation = '';
    translatedPane.hidden = true;
    translatedPane.innerHTML = `<div class="rpdf-pane-label"><span>الترجمة · الصفحة ${pageNumber}</span><span data-rpdf-page-state>جاهزة</span></div><div class="rpdf-translation-body" data-rpdf-translation-body dir="rtl"><span class="rpdf-translation-placeholder">فعّل ترجمة الصفحات لعرض ترجمة هذه الصفحة.</span></div>`;
    article.append(sourcePane, translatedPane); pages.appendChild(article);
    return article;
  }

  function pageSourceText(textContent) {
    const parts = [];
    (textContent?.items || []).forEach((item) => {
      const value = String(item.str || '').replace(/\s+/g, ' ').trim();
      if (!value) return;
      const previous = parts.length ? parts[parts.length - 1] : null;
      if (previous && (item.hasEOL || /[.!؟:؛]$/.test(previous))) parts.push('\n');
      else if (previous) parts.push(' ');
      parts.push(value);
    });
    return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function updateTranslationProgress() {
    if (!state.translation || !state.doc) { translationProgress.hidden = true; return; }
    const done = state.translatedPages.size;
    translationProgress.hidden = false;
    translationProgress.textContent = `${Math.round((done / state.doc.numPages) * 100)}%`;
  }

  async function translatePage(article, sourceText) {
    if (!state.translation || !sourceText || state.cancelled) return;
    const pageNo = Number(article.dataset.rpdfPage);
    const target = state.target;
    const key = `${pageNo}:${target}`;
    if (state.translationRequests.has(key)) return state.translationRequests.get(key);
    const pane = article.querySelector('[data-rpdf-translation]');
    const body = article.querySelector('[data-rpdf-translation-body]');
    const status = article.querySelector('[data-rpdf-page-state]');
    pane.hidden = false;
    status.textContent = 'جارٍ الترجمة…';
    body.classList.add('is-loading');
    body.innerHTML = '<span class="rpdf-translation-placeholder">جارٍ ترجمة الصفحة…</span>';
    const task = (async () => {
      try {
        const query = `?source=auto&target=${encodeURIComponent(target)}&mode=translated`;
        const cached = await requestJson(`/api/v1/documents/${encodeURIComponent(materialId)}/pages/${pageNo}${query}`);
        let result = cached?.page?.status === 'completed' && cached.page.translated_text
          ? cached
          : await requestJson(`/api/v1/documents/${encodeURIComponent(materialId)}/pages/${pageNo}/translate`, 'POST', {
            source_text: sourceText, source: 'auto', target, mode: 'translated', page_count: state.doc.numPages,
          });
        const translated = result?.page?.translated_text || '';
        if (!translated) throw new Error('لم يصل نص مترجم لهذه الصفحة');
        if (state.target !== target) return;
        body.textContent = translated;
        body.dir = result?.page?.direction === 'ltr' || target === 'en' || target === 'fr' ? 'ltr' : 'rtl';
        body.lang = target;
        body.classList.remove('is-loading');
        status.textContent = result?.cached ? 'محفوظة' : 'مترجمة';
        article.dataset.rpdfTranslatedTarget = target;
        state.translatedPages.add(key);
        updateTranslationProgress();
      } catch (err) {
        body.classList.remove('is-loading');
        body.innerHTML = `<span class="rpdf-translation-placeholder is-error">${esc(err.message || 'تعذرت ترجمة الصفحة')} <button type="button" data-rpdf-page-retry>إعادة المحاولة</button></span>`;
        status.textContent = 'تعذر';
      } finally { state.translationRequests.delete(key); }
    })();
    state.translationRequests.set(key, task);
    return task;
  }

  function queueNearbyTranslations(article, sourceText) {
    if (!state.translation) return;
    translatePage(article, sourceText);
    const pageNo = Number(article.dataset.rpdfPage);
    [pageNo - 1, pageNo + 1].forEach((number) => {
      const neighbor = pages.querySelector(`[data-rpdf-page="${number}"]`);
      if (neighbor?.dataset.sourceText) translatePage(neighbor, neighbor.dataset.sourceText);
    });
  }

  async function renderArticle(article) {
    if (!state.doc || article.dataset.rendered === '1' || article.dataset.rendering === '1' || state.cancelled) return;
    article.dataset.rendering = '1';
    try {
      const pageNo = Number(article.dataset.rpdfPage);
      const page = await state.doc.getPage(pageNo);
      const viewport = pageScale(page);
      const canvas = article.querySelector('[data-rpdf-canvas]');
      const layer = article.querySelector('[data-rpdf-text]');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.setAttribute('dir', 'ltr'); canvas.style.direction = 'ltr';
      const ctx = canvas.getContext('2d'); ctx.direction = 'ltr';
      const desktopSplit = stage.clientWidth > 900;
      const paneHeight = Math.floor(viewport.height) + 32;
      article.style.width = `${desktopSplit ? Math.floor(viewport.width * 2 + 1) : Math.floor(viewport.width)}px`;
      article.style.minHeight = `${paneHeight}px`;
      const sourcePane = article.querySelector('.rpdf-source-pane');
      sourcePane.style.width = `${Math.floor(viewport.width)}px`;
      sourcePane.style.minHeight = `${paneHeight}px`;
      layer.style.width = `${Math.floor(viewport.width)}px`; layer.style.height = `${Math.floor(viewport.height)}px`;
      await page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
      const textContent = await page.getTextContent();
      await pdfjsLib.renderTextLayer({ container: layer, viewport, textContent }).promise;
      const sourceText = pageSourceText(textContent);
      article.dataset.sourceText = sourceText;
      article.querySelector('[data-rpdf-translation]').hidden = !state.translation;
      queueNearbyTranslations(article, sourceText);
      article.dataset.rendered = '1';
    } catch { article.dataset.rendered = '0'; }
    article.dataset.rendering = '0';
  }

  function updateVisiblePage() {
    const cards = [...pages.querySelectorAll('[data-rpdf-page]')];
    const middle = stage.getBoundingClientRect().top + stage.clientHeight * .36;
    const current = cards.find((card) => { const rect = card.getBoundingClientRect(); return rect.top <= middle && rect.bottom >= middle; });
    if (current) { state.page = Number(current.dataset.rpdfPage); numEl.textContent = String(state.page); }
  }

  function go(pageNo) {
    if (!state.doc) return;
    const targetNo = Math.min(state.doc.numPages, Math.max(1, pageNo));
    const target = pages.querySelector(`[data-rpdf-page="${targetNo}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    state.page = targetNo; numEl.textContent = String(targetNo);
  }

  function redrawAtCurrentPage() {
    const current = pages.querySelector(`[data-rpdf-page="${state.page}"]`);
    pages.querySelectorAll('[data-rpdf-page]').forEach((article) => {
      article.dataset.rendered = '0'; article.dataset.rendering = '0';
      article.querySelector('[data-rpdf-canvas]').width = 0;
      article.querySelector('[data-rpdf-canvas]').height = 0;
      article.querySelector('[data-rpdf-text]').replaceChildren();
      const pane = article.querySelector('[data-rpdf-translation]');
      if (pane) { pane.hidden = !state.translation; pane.querySelector('[data-rpdf-translation-body]').innerHTML = '<span class="rpdf-translation-placeholder">ستعاد ترجمة الصفحة بعد إعادة الرسم.</span>'; }
      article.style.width = ''; article.style.minHeight = '';
    });
    if (current) { current.scrollIntoView({ block: 'start' }); renderArticle(current); }
    pages.querySelectorAll('[data-rpdf-page]').forEach((article) => {
      if (state.observer) state.observer.unobserve(article);
      state.observer?.observe(article);
    });
  }

  function clearSelection() {
    state.quote = null; actions.hidden = true;
    const selection = window.getSelection(); selection?.removeAllRanges();
  }

  function captureSelection() {
    if (state.cancelled || composer.contains(document.activeElement)) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    const anchorNode = selection?.anchorNode;
    const article = anchorNode?.parentElement?.closest('[data-rpdf-page]');
    if (!selection || !text || text.length < 2 || !article || !container.contains(article)) { clearSelection(); return; }
    const range = selection.getRangeAt(0);
    if (!article.contains(range.endContainer)) { clearSelection(); return; }
    const rects = [...range.getClientRects()];
    if (!rects.length) { clearSelection(); return; }
    const rect = rects.reduce((all, item) => ({ left: Math.min(all.left, item.left), top: Math.min(all.top, item.top), right: Math.max(all.right, item.right), bottom: Math.max(all.bottom, item.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const bounds = article.getBoundingClientRect();
    state.quote = { text: text.slice(0, 2000), page: Number(article.dataset.rpdfPage), anchor: {
      page: Number(article.dataset.rpdfPage), x: Math.max(0, (rect.left - bounds.left) / bounds.width), y: Math.max(0, (rect.top - bounds.top) / bounds.height),
      width: Math.min(1, rect.width / bounds.width), height: Math.min(1, rect.height / bounds.height),
    } };
    selectionLabel.textContent = `المقطع المحدد · ص ${state.quote.page}`;
    actions.hidden = false;
  }

  container.querySelector('[data-rpdf-prev]').addEventListener('click', () => go(state.page - 1));
  container.querySelector('[data-rpdf-next]').addEventListener('click', () => go(state.page + 1));
  container.querySelector('[data-rpdf-zoom-in]').addEventListener('click', () => { state.fit = false; state.scale = Math.min(4, state.scale * 1.2); redrawAtCurrentPage(); });
  container.querySelector('[data-rpdf-zoom-out]').addEventListener('click', () => { state.fit = false; state.scale = Math.max(.4, state.scale / 1.2); redrawAtCurrentPage(); });
  container.querySelector('[data-rpdf-fit]').addEventListener('click', () => { state.fit = true; redrawAtCurrentPage(); });
  liveTranslationButton.addEventListener('click', () => {
    state.translation = !state.translation;
    state.target = targetSelect.value || 'ar';
    liveTranslationButton.setAttribute('aria-pressed', String(state.translation));
    liveTranslationButton.textContent = state.translation ? 'إيقاف الترجمة' : 'ترجمة الصفحات';
    pages.querySelectorAll('[data-rpdf-translation]').forEach((pane) => { pane.hidden = !state.translation; });
    updateTranslationProgress();
    if (state.translation) pages.querySelectorAll('[data-rpdf-page]').forEach((article) => { if (article.dataset.sourceText && article.getBoundingClientRect().top < stage.getBoundingClientRect().bottom + 700) translatePage(article, article.dataset.sourceText); });
  });
  targetSelect.addEventListener('change', () => {
    state.target = targetSelect.value || 'ar';
    state.translatedPages.clear();
    pages.querySelectorAll('[data-rpdf-page]').forEach((article) => { article.dataset.rpdfTranslatedTarget = ''; if (state.translation && article.dataset.sourceText) translatePage(article, article.dataset.sourceText); });
    updateTranslationProgress();
  });
  pages.addEventListener('click', (event) => {
    const retry = event.target.closest('[data-rpdf-page-retry]');
    if (!retry) return;
    const article = retry.closest('[data-rpdf-page]');
    if (article?.dataset.sourceText) translatePage(article, article.dataset.sourceText);
  });

  const fullButton = container.querySelector('[data-rpdf-full]');
  fullButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === container) await document.exitFullscreen();
      else if (container.requestFullscreen) await container.requestFullscreen();
      else container.classList.toggle('is-fullscreen');
    } catch { container.classList.toggle('is-fullscreen'); }
    const active = document.fullscreenElement === container || container.classList.contains('is-fullscreen');
    fullButton.setAttribute('aria-pressed', String(active)); fullButton.textContent = active ? 'إنهاء ملء الشاشة' : 'ملء الشاشة';
    setTimeout(redrawAtCurrentPage, 80);
  });
  document.addEventListener('fullscreenchange', () => {
    const active = document.fullscreenElement === container || container.classList.contains('is-fullscreen');
    fullButton.setAttribute('aria-pressed', String(active)); fullButton.textContent = active ? 'إنهاء ملء الشاشة' : 'ملء الشاشة';
    if (active) setTimeout(redrawAtCurrentPage, 80);
  });

  container.querySelector('[data-rpdf-translate]').addEventListener('click', () => {
    if (!state.quote?.text) return;
    if (typeof window.SidjilTranslateSelection === 'function') window.SidjilTranslateSelection(state.quote.text);
    else toast('خيار الترجمة غير متاح الآن', false);
  });
  container.querySelector('[data-rpdf-quote]').addEventListener('click', () => {
    if (!state.quote) return;
    const title = composer.querySelector('[name=title]');
    title.value = `تعليق على مقطع من «${String(materialTitle || 'المادة').slice(0, 60)}» — ص ${state.quote.page}`;
    quotePreview.replaceChildren();
    const label = document.createElement('strong'); label.textContent = `المقطع المحدد · الصفحة ${state.quote.page}`;
    const excerpt = document.createElement('p'); excerpt.textContent = `«${state.quote.text.slice(0, 500)}${state.quote.text.length > 500 ? '…' : ''}»`;
    quotePreview.append(label, excerpt); composer.hidden = false;
    composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); composer.querySelector('[name=body]').focus({ preventScroll: true });
  });
  container.querySelector('[data-rpdf-clear]').addEventListener('click', clearSelection);
  container.querySelector('[data-rpdf-composer-close]').addEventListener('click', () => { composer.hidden = true; clearSelection(); });
  composer.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!state.quote) return;
    const form = new FormData(composer); const submit = composer.querySelector('[type=submit]'); submit.disabled = true;
    try {
      await api('/api/v1/admin/discussions', 'POST', {
        kind: form.get('kind') || 'comment', title: String(form.get('title') || '').trim(), body: String(form.get('body') || '').trim(),
        material_id: materialId ? Number(materialId) : null, quote_text: state.quote.text, page_no: String(state.quote.page), quote_anchor: state.quote.anchor,
      });
      toast('نُشر التعليق مرتبطًا بالمقطع وموضعه في الصفحة'); composer.reset(); composer.hidden = true; clearSelection();
    } catch (err) { toast(err.message || 'تعذر نشر التعليق', false); }
    finally { submit.disabled = false; }
  });

  let selectTimer;
  const deferSelection = () => { clearTimeout(selectTimer); selectTimer = setTimeout(captureSelection, 100); };
  stage.addEventListener('mouseup', deferSelection); stage.addEventListener('touchend', deferSelection, { passive: true });
  document.addEventListener('selectionchange', deferSelection);
  stage.addEventListener('scroll', updateVisiblePage, { passive: true });

  stage.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      const [a, b] = event.touches;
      state.pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: state.scale };
    } else if (event.touches.length === 1) {
      const now = Date.now();
      if (now - state.tapAt < 280) {
        state.fit = !state.fit; if (!state.fit) state.scale = Math.min(2.2, Math.max(1.25, state.scale * 1.5));
        redrawAtCurrentPage(); state.tapAt = 0;
      } else state.tapAt = now;
    }
  }, { passive: true });
  stage.addEventListener('touchmove', (event) => {
    if (!state.pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    state.pinch.nextScale = Math.min(4, Math.max(.4, state.pinch.scale * distance / state.pinch.distance));
  }, { passive: false });
  stage.addEventListener('touchend', (event) => {
    if (!state.pinch) return;
    if (event.touches.length) return;
    if (state.pinch.nextScale) { state.fit = false; state.scale = state.pinch.nextScale; redrawAtCurrentPage(); }
    state.pinch = null;
  }, { passive: true });

  try {
    state.doc = await pdfjsLib.getDocument({ url, withCredentials: true, ...PDF_RENDER_OPTIONS }).promise;
    if (state.cancelled) return { destroy() {} };
    countEl.textContent = String(state.doc.numPages);
    for (let pageNo = 1; pageNo <= state.doc.numPages; pageNo += 1) makePage(pageNo);
    state.observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) renderArticle(entry.target);
    }), { root: stage, rootMargin: '700px 0px' });
    pages.querySelectorAll('[data-rpdf-page]').forEach((article) => state.observer.observe(article));
    renderArticle(pages.firstElementChild);
  } catch { error.hidden = false; }

  return { destroy() {
    state.cancelled = true; state.observer?.disconnect(); document.removeEventListener('selectionchange', deferSelection); clearTimeout(selectTimer); container.innerHTML = '';
  } };
}

window.SidjilPdfReader = { mount };
