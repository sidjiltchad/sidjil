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
  const pageStatus = root.querySelector('[data-ta-page-status]');
  const status = root.querySelector('[data-ta-status]');
  const progress = root.querySelector('[data-ta-progress]');
  const progressLabel = root.querySelector('[data-ta-progress-label]');
  const startButton = root.querySelector('[data-ta-start-translation]');
  const downloadButton = root.querySelector('[data-ta-download-translation]');
  const pdfExportButton = root.querySelector('[data-ta-create-pdf]');
  const originalLabel = config.language === 'fr' ? 'Page' : 'الصفحة';
  const readyLabel = config.language === 'fr' ? 'Traduction complète' : 'اكتملت ترجمة الكتاب';
  const workingLabel = config.language === 'fr' ? 'Traduction du livre' : 'جارٍ ترجمة الكتاب كاملًا';
  const unavailableLabel = config.language === 'fr' ? 'La traduction est temporairement indisponible.' : 'تعذر تنفيذ الترجمة الآن. ستتم إعادة المحاولة تلقائيًا.';
  let pdfDoc = null;
  let translatedDoc = null;
  let translatedObjectUrl = '';
  let translatedBlob = null;
  let translatedText = '';
  let translatedTextPages = [];
  let observer = null;
  let destroyed = false;
  let activePage = 1;
  let pageLabels = null;
  let bookJobId = null;
  let translationKey = '';
  let starting = null;
  let lastSyncedPage = 0;
  const pageState = new Map();

  function pageTextLabel(page) { return pageLabels && pageLabels[page - 1] ? String(pageLabels[page - 1]) : String(page); }
  function setStatus(value) { if (status) status.textContent = value || ''; }
  function setProgress(value, detail = '') {
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    if (progress) progress.style.width = `${n}%`;
    if (progressLabel) progressLabel.textContent = `${n}%${detail ? ` · ${detail}` : ''}`;
    root.dataset.translationProgress = String(n);
  }
  function updatePageStatus(page) { if (pageStatus) pageStatus.textContent = `${originalLabel} ${pageTextLabel(page)}`; }

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
      text.textContent = config.language === 'fr' ? 'La traduction complète apparaîtra ici.' : 'ستظهر ترجمة الكتاب كاملة هنا بعد انتهاء المعالجة.';
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
      pageState.set(n, { original, translatedCard: translated, rendered: false, translatedRendered: false, rendering: false, translatedRendering: false });
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
      if (!translatedTextPages.length || !text) return;
      const value = translatedTextPages[pageNumber - 1] || '';
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
    translatedDoc = null; translatedBlob = null; translatedText = ''; translatedTextPages = [];
    if (translatedObjectUrl) URL.revokeObjectURL(translatedObjectUrl);
    translatedObjectUrl = '';
    pageState.forEach((state) => {
      state.translatedRendered = false;
      const text = state.translatedCard.querySelector('[data-page-text]');
      const stateEl = state.translatedCard.querySelector('[data-page-state]');
      if (text) { text.classList.add('is-loading'); text.textContent = config.language === 'fr' ? 'La traduction complète apparaîtra ici.' : 'ستظهر ترجمة الكتاب كاملة هنا بعد انتهاء المعالجة.'; }
      if (stateEl) stateEl.textContent = '';
    });
    if (downloadButton) downloadButton.disabled = true;
    if (pdfExportButton) pdfExportButton.disabled = true;
    lastSyncedPage = 0;
    setProgress(0);
  }

  async function loadTranslatedText(blob) {
    translatedBlob = blob;
    translatedText = await blob.text();
    translatedTextPages = translatedText.split('\f');
    pageState.forEach((state) => { state.translatedRendered = false; });
    if (downloadButton) downloadButton.disabled = false;
    if (pdfExportButton) pdfExportButton.disabled = false;
    await renderTranslated(activePage);
  }

  async function startBookTranslation(force = false) {
    const key = `${sourceSelect.value}->${targetSelect.value}`;
    if (!force && translationKey === key && translatedDoc) return true;
    if (starting) return starting;
    translationKey = key; resetTranslationView();
    if (startButton) startButton.disabled = true;
    setProgress(1, config.language === 'fr' ? 'préparation' : 'تهيئة');
    setStatus(`${workingLabel} · ${sourceSelect.value} → ${targetSelect.value}`);
    starting = (async () => {
      try {
        const headers = { 'content-type': 'application/json' };
        const csrf = csrfToken();
        if (csrf) headers['X-CSRF-Token'] = csrf;
        const response = await fetch(`/api/v1/documents/${encodeURIComponent(config.material)}/translations`, {
          method: 'POST', headers, credentials: 'same-origin',
          body: JSON.stringify({ source: sourceSelect.value, target: targetSelect.value, mode: 'text', ocr: 'auto' }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || unavailableLabel);
        bookJobId = data.jobId;
        for (let i = 0; i < 1800 && bookJobId && !destroyed; i += 1) {
          if (i) await wait(2000);
          const check = await fetch(`/api/v1/translate/jobs/${encodeURIComponent(bookJobId)}`, { credentials: 'same-origin' });
          const detail = await check.json().catch(() => ({}));
          const job = detail.job || {};
          const donePages = Number(job.processed_pages || 0); const totalPages = Number(job.page_count || 0);
          setProgress(job.progress || 0, totalPages ? `${donePages}/${totalPages}` : job.current_stage || '');
          setStatus(`${workingLabel} · ${job.current_stage || job.status || ''}${totalPages ? ` · ${donePages}/${totalPages}` : ''}`);
          if (job.status === 'COMPLETED') {
            const file = await fetch(`/api/v1/translate/jobs/${encodeURIComponent(bookJobId)}/download`, { credentials: 'same-origin' });
            if (!file.ok) throw new Error(unavailableLabel);
            await loadTranslatedText(await file.blob());
            setProgress(100, config.language === 'fr' ? 'terminé' : 'تم'); setStatus(readyLabel);
            return true;
          }
          if (job.status === 'FAILED') throw new Error(job.error_message || unavailableLabel);
        }
        throw new Error(config.language === 'fr' ? 'Le délai de traitement est dépassé.' : 'انتهت مهلة انتظار الترجمة. يمكنك إعادة المحاولة.');
      } catch (error) {
        setStatus(error.message || unavailableLabel); setProgress(0, config.language === 'fr' ? 'échec' : 'فشل'); return false;
      } finally {
        starting = null;
        if (startButton) startButton.disabled = false;
      }
    })();
    return starting;
  }

  function syncTranslation(pageNumber) {
    const state = pageState.get(pageNumber);
    if (!state) return;
    updatePageStatus(pageNumber); activePage = pageNumber; renderTranslated(pageNumber);
    if (lastSyncedPage === pageNumber) return;
    lastSyncedPage = pageNumber;
    translatedScroll.scrollTo({ top: state.translatedCard.offsetTop - 8, behavior: 'smooth' });
  }

  function downloadTranslation() {
    if (!translatedBlob) return startBookTranslation().then(() => downloadTranslation());
    const link = document.createElement('a'); link.href = URL.createObjectURL(translatedBlob);
    link.download = `sidjil-translation-${targetSelect.value}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
          setStatus(readyLabel);
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
      setProgress(0);
      setStatus(config.language === 'fr' ? 'Lisez le fichier original ou lancez la traduction quand vous le souhaitez.' : 'يمكنك قراءة الملف الأصلي، أو بدء الترجمة عند الحاجة.');
    } catch (_) { setStatus(unavailableLabel); }
  }

  sourceSelect.addEventListener('change', onLanguageChange); targetSelect.addEventListener('change', onLanguageChange);
  downloadButton.addEventListener('click', downloadTranslation); window.addEventListener('resize', onResize, { passive: true }); init();
  const cleanup = () => { destroyed = true; observer?.disconnect(); window.removeEventListener('resize', onResize); if (translatedObjectUrl) URL.revokeObjectURL(translatedObjectUrl); };
  window.__sidjilTranslationWorkspaceCleanup = cleanup;
  return { downloadTranslation, exportPdf, createPdf: exportPdf, cleanup, startBookTranslation };
}
