/* SIDJIL — ترجمة الكتاب كاملة مع عرض متوازٍ وتقدم محفوظ من Job الخادم. */
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
const PDF_RENDER_OPTIONS = {
  cMapUrl: '/vendor/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
  disableFontFace: false,
  useSystemFonts: true,
  isEvalSupported: true
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content || sessionStorage.getItem('csrfToken') || '';
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function formatTranslationText(value, target) {
    const rtl = target === 'ar';
    const lines = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return lines.map((raw) => {
      const line = raw.trim();
      if (!line) return '<div class="translation-text-break" aria-hidden="true"></div>';
      const heading = line.length <= 90 && !/[.!؟:؛]$/.test(line) && !/^[-•*»«\"\d]/.test(line);
      const content = escapeHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return heading ? `<h4>${content}</h4>` : `<p>${content}</p>`;
    }).join('');
  }

export function mountTranslationWorkspace(root, config) {
  const originalScroll = root.querySelector('[data-ta-original-scroll]');
  const translatedScroll = root.querySelector('[data-ta-translated-scroll]');
  const sourceSelect = root.querySelector('[data-ta-source]');
  const targetSelect = root.querySelector('[data-ta-target]');
  const targetLabel = root.querySelector('[data-ta-target-label]');
  const status = root.querySelector('[data-ta-status]');
  const startButton = root.querySelector('[data-ta-start-translation]');
  const pdfExportButton = root.querySelector('[data-ta-create-pdf]');
  const originalLabel = config.language === 'fr' ? 'Page' : 'الصفحة';
  const readyLabel = config.language === 'fr' ? 'Traduit' : 'تمت ترجمة الصفحة';
  const exportReadyLabel = config.language === 'fr' ? 'PDF prêt' : 'اكتمل تجهيز PDF';
  const workingLabel = config.language === 'fr' ? 'Traduction en cours' : 'جارٍ ترجمة الصفحة';
  const unavailableLabel = config.language === 'fr' ? 'La traduction est temporairement indisponible.' : 'تعذر تنفيذ الترجمة الآن. ستتم إعادة المحاولة تلقائيًا.';
  let pdfDoc = null;
  let observer = null;
  let destroyed = false;
  let activePage = 1;
  let pageLabels = null;
  let translationKey = '';
  let starting = null;
  let lastSyncedPage = 0;
  let liveTranslationStarted = false;
  const pageState = new Map();

  function pageTextLabel(page) { return pageLabels && pageLabels[page - 1] ? String(pageLabels[page - 1]) : String(page); }
  function setStatus(value) { if (status) status.textContent = value || ''; }
  function updatePageStatus() {}

  function pageCard(page, kind) {
    const card = document.createElement('article');
    card.className = `translation-page-card translation-page-${kind}`;
    card.dataset.page = String(page);
    const head = document.createElement('div');
    head.className = 'translation-page-label';
    const number = document.createElement('strong');
    number.textContent = `${originalLabel} ${pageTextLabel(page)}`;
    const state = document.createElement('span');
    state.dataset.pageState = '';
    head.append(number, state);
    card.appendChild(head);
    if (kind === 'original') {
      const canvas = document.createElement('canvas');
      canvas.className = `translation-pdf-canvas translation-pdf-canvas-${kind}`;
      canvas.dataset.pageCanvas = kind;
      card.appendChild(canvas);
    } else {
      const text = document.createElement('div');
      text.className = 'translation-page-text is-loading';
      text.dataset.pageText = '';
      text.dir = config.target === 'ar' ? 'rtl' : 'ltr';
      text.lang = config.target || 'ar';
      text.textContent = config.language === 'fr' ? 'La traduction de cette page apparaîtra ici.' : 'ستظهر ترجمة هذه الصفحة هنا عند بدء الترجمة.';
      card.appendChild(text);
    }
    return card;
  }

  function buildPages(count) {
    originalScroll.innerHTML = '';
    translatedScroll.innerHTML = '';
    pageState.clear();
    for (let n = 1; n <= count; n += 1) {
      const original = pageCard(n, 'original');
      const translated = pageCard(n, 'translated');
      originalScroll.appendChild(original);
      translatedScroll.appendChild(translated);
      pageState.set(n, { original, translatedCard: translated, rendered: false, translatedRendered: false, rendering: false, translatedRendering: false, sourceText: '', sourcePromise: null, translationPromise: null });
    }
  }

  async function renderOriginal(pageNumber) {
    const state = pageState.get(pageNumber);
    if (!state || state.rendered || state.rendering || !pdfDoc) return;
    state.rendering = true;
    const canvas = state.original.querySelector('[data-page-canvas="original"]');
    try {
      const page = await pdfDoc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const available = Math.max(280, originalScroll.clientWidth - 30);
      const scale = Math.min(2.1, Math.max(0.35, available / base.width));
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.style.imageRendering = 'auto';
      canvas.setAttribute('dir', 'ltr');
      canvas.style.direction = 'ltr';
      const ctx = canvas.getContext('2d');
      ctx.direction = 'ltr';
      await page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
      state.rendered = true;
    } catch (_) {
      const stateEl = state.original.querySelector('[data-page-state]');
      if (stateEl) stateEl.textContent = config.language === 'fr' ? 'Lecture impossible' : 'تعذر عرض الصفحة';
    } finally { state.rendering = false; }
  }

  async function renderTranslated(pageNumber) {
    const state = pageState.get(pageNumber);
    if (!state || state.translatedRendered || state.translatedRendering) return;
    state.translatedRendering = true;
    const text = state.translatedCard.querySelector('[data-page-text]');
    try {
      if (!text || !state.translatedText) return;
      const value = state.translatedText;
      text.innerHTML = value.trim() ? formatTranslationText(value, targetSelect?.value || config.target || 'ar') : (config.language === 'fr' ? '<p>Aucun texte traduit pour cette page.</p>' : '<p>لا يوجد نص مترجم لهذه الصفحة.</p>');
      const target = targetSelect?.value || config.target || 'ar';
      text.dir = target === 'ar' ? 'rtl' : 'ltr';
      text.lang = target;
      text.classList.toggle('translation-text-rtl', target === 'ar');
      text.classList.remove('is-loading');
      state.translatedRendered = true;
      const stateEl = state.translatedCard.querySelector('[data-page-state]');
      if (stateEl) stateEl.textContent = readyLabel;
    } catch (_) {
      const stateEl = state.translatedCard.querySelector('[data-page-state]');
      if (stateEl) stateEl.textContent = config.language === 'fr' ? 'Erreur de rendu' : 'تعذر عرض الترجمة';
    } finally { state.translatedRendering = false; }
  }

  function resetTranslationView() {
    liveTranslationStarted = false;
    pageState.forEach((state) => {
      state.translatedRendered = false;
      state.translatedText = '';
      state.sourceText = '';
      state.sourcePromise = null;
      state.translationPromise = null;
      const text = state.translatedCard.querySelector('[data-page-text]');
      const stateEl = state.translatedCard.querySelector('[data-page-state]');
      if (text) { text.classList.add('is-loading'); text.textContent = config.language === 'fr' ? 'La traduction apparaîtra ici lorsque vous la lancerez.' : 'ستظهر الترجمة هنا عند بدء ترجمة الصفحة.'; }
      if (stateEl) stateEl.textContent = '';
    });
    if (pdfExportButton) pdfExportButton.disabled = false;
    lastSyncedPage = 0;
  }

  async function extractPageText(pageNumber) {
    const state = pageState.get(pageNumber);
    if (!state || !pdfDoc) return '';
    if (state.sourceText) return state.sourceText;
    if (state.sourcePromise) return state.sourcePromise;
    state.sourcePromise = pdfDoc.getPage(pageNumber).then((page) => page.getTextContent()).then((content) => {
      let previousY = null;
      state.sourceText = (content.items || []).map((item) => {
        const value = String(item.str || '').trim();
        const y = Number(item.transform?.[5]);
        const lineBreak = previousY !== null && Number.isFinite(y) && Math.abs(y - previousY) > 2;
        previousY = Number.isFinite(y) ? y : previousY;
        return `${lineBreak ? '\n' : ''}${value}`;
      }).join(' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n').replace(/[ \t]+/g, ' ').trim();
      return state.sourceText;
    }).catch(() => '').finally(() => { state.sourcePromise = null; });
    return state.sourcePromise;
  }

  async function translatePage(pageNumber) {
    const state = pageState.get(pageNumber);
    if (!state || !liveTranslationStarted || destroyed) return false;
    if (state.translationPromise) return state.translationPromise;
    if (state.translatedText && state.translatedRendered) return true;
    const text = state.translatedCard.querySelector('[data-page-text]');
    const stateEl = state.translatedCard.querySelector('[data-page-state]');
    if (stateEl) stateEl.textContent = workingLabel;
    if (text) { text.classList.add('is-loading'); text.textContent = config.language === 'fr' ? 'Traduction de cette page…' : 'جارٍ ترجمة هذه الصفحة…'; }
    state.translationPromise = (async () => {
      try {
        const sourceText = await extractPageText(pageNumber);
        if (!sourceText) {
          if (text) { text.classList.remove('is-loading'); text.innerHTML = config.language === 'fr' ? '<p>Aucun texte détectable sur cette page.</p>' : '<p>لا يوجد نص قابل للاستخراج في هذه الصفحة.</p>'; }
          if (stateEl) stateEl.textContent = '';
          state.translatedRendered = true;
          return false;
        }
        const headers = { 'content-type': 'application/json' };
        const csrf = csrfToken();
        if (csrf) headers['X-CSRF-Token'] = csrf;
        const response = await fetch(`/api/v1/documents/${encodeURIComponent(config.material)}/pages/${pageNumber}/translate`, {
          method: 'POST', headers, credentials: 'same-origin',
          body: JSON.stringify({ source_text: sourceText, source: sourceSelect.value, target: targetSelect.value, mode: 'text', page_count: pdfDoc?.numPages || null }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || unavailableLabel);
        state.translatedText = String(data.page?.translated_text || '');
        state.translatedRendered = false;
        await renderTranslated(pageNumber);
        setStatus(`${config.language === 'fr' ? 'Page traduite' : 'تمت ترجمة الصفحة'} ${pageTextLabel(pageNumber)}`);
        return true;
      } catch (error) {
        if (text) { text.classList.remove('is-loading'); text.textContent = error.message || unavailableLabel; }
        if (stateEl) stateEl.textContent = config.language === 'fr' ? 'Erreur' : 'تعذر الترجمة';
        return false;
      } finally { state.translationPromise = null; }
    })();
    return state.translationPromise;
  }

  async function startBookTranslation(force = false) {
    const key = `${sourceSelect.value}->${targetSelect.value}`;
    if (force || translationKey !== key) { translationKey = key; resetTranslationView(); }
    if (liveTranslationStarted && !force) return translatePage(activePage);
    liveTranslationStarted = true;
    if (startButton) startButton.disabled = true;
    setStatus(config.language === 'fr' ? 'La traduction commence page par page…' : 'بدأت الترجمة صفحةً صفحة…');
    try { return await translatePage(activePage); }
    finally { if (startButton) startButton.disabled = false; }
  }

  function syncTranslation(pageNumber) {
    const state = pageState.get(pageNumber);
    if (!state) return;
    updatePageStatus(pageNumber); activePage = pageNumber;
    if (liveTranslationStarted) translatePage(pageNumber);
    else renderTranslated(pageNumber);
    if (lastSyncedPage === pageNumber) return;
    lastSyncedPage = pageNumber;
    translatedScroll.scrollTo({ top: state.translatedCard.offsetTop - 8, behavior: 'smooth' });
  }

  async function exportPdf() {
    if (!pdfExportButton || pdfExportButton.disabled) return;
    const originalLabel = pdfExportButton.textContent;
    pdfExportButton.disabled = true;
    setStatus(config.language === 'fr' ? 'Préparation du PDF…' : 'جارٍ تجهيز ملف PDF للتصدير…');
    try {
      const headers = { 'content-type': 'application/json' };
      const csrf = csrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const response = await fetch(`/api/v1/documents/${encodeURIComponent(config.material)}/translations`, {
        method: 'POST', headers, credentials: 'same-origin',
        body: JSON.stringify({ source: sourceSelect.value, target: targetSelect.value, mode: 'translated', ocr: 'auto' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || unavailableLabel);
      const jobId = data.jobId;
      for (let i = 0; i < 1800; i += 1) {
        if (i) await wait(2000);
        const check = await fetch(`/api/v1/translate/jobs/${encodeURIComponent(jobId)}`, { credentials: 'same-origin' });
        const detail = await check.json().catch(() => ({}));
        const job = detail.job || {};
        if (job.status === 'FAILED') throw new Error(job.error_message || unavailableLabel);
        if (job.status === 'COMPLETED') {
          const file = await fetch(`/api/v1/translate/jobs/${encodeURIComponent(jobId)}/download`, { credentials: 'same-origin' });
          if (!file.ok) throw new Error(unavailableLabel);
          const link = document.createElement('a'); link.href = URL.createObjectURL(await file.blob());
          link.download = `sidjil-translation-${targetSelect.value}.pdf`; link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
          setStatus(exportReadyLabel);
          return true;
        }
        setStatus(`${workingLabel} · ${job.current_stage || job.status || ''}${job.progress != null ? ` (${job.progress}%)` : ''}`);
      }
      throw new Error(config.language === 'fr' ? 'Le délai de traitement est dépassé.' : 'انتهت مهلة تجهيز ملف PDF.');
    } catch (error) {
      setStatus(error.message || unavailableLabel);
      return false;
    } finally {
      pdfExportButton.disabled = false;
      pdfExportButton.textContent = originalLabel;
    }
  }

  function onLanguageChange() {
    targetLabel.textContent = targetSelect.options[targetSelect.selectedIndex]?.textContent || targetSelect.value;
    translationKey = '';
    resetTranslationView();
    if (startButton) startButton.disabled = false;
    setStatus(config.language === 'fr' ? 'Lancez la traduction pour cette langue.' : 'اضغط «ترجمة الكتاب» لبدء الترجمة بهذه اللغة.');
  }
  function onResize() {
    pageState.forEach((state) => { state.rendered = false; state.translatedRendered = false; });
    renderOriginal(activePage); renderTranslated(activePage);
  }

  async function init() {
    try {
      pdfDoc = await pdfjsLib.getDocument({ url: config.pdf, withCredentials: true, ...PDF_RENDER_OPTIONS }).promise;
      pageLabels = await pdfDoc.getPageLabels().catch(() => null);
      buildPages(pdfDoc.numPages);
      observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const page = Number(entry.target.dataset.page); activePage = page; updatePageStatus(page);
        renderOriginal(page); syncTranslation(page);
      }), { root: originalScroll, rootMargin: '260px 0px', threshold: [0.25, 0.6] });
      pageState.forEach((state) => observer.observe(state.original));
      renderOriginal(1);
      setStatus(config.language === 'fr' ? 'Lisez le fichier original ou lancez la traduction quand vous le souhaitez.' : 'يمكنك قراءة الملف الأصلي، أو بدء الترجمة عند الحاجة.');
    } catch (_) { setStatus(unavailableLabel); }
  }

  sourceSelect.addEventListener('change', onLanguageChange); targetSelect.addEventListener('change', onLanguageChange);
  window.addEventListener('resize', onResize, { passive: true }); init();
  const cleanup = () => { destroyed = true; observer?.disconnect(); window.removeEventListener('resize', onResize); };
  window.__sidjilTranslationWorkspaceCleanup = cleanup;
  return { exportPdf, createPdf: exportPdf, cleanup, startBookTranslation };
}
