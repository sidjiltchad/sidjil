/* SIDJIL — عارض PDF داخل صفحة المادة (PDF.js)
   عرض صفحة مفردة مع تنقل وتكبير، أو قراءة الكتاب كاملاً بتحميل كسول للصفحات. */
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

(function () {
  'use strict';

  var box = document.getElementById('pdfViewerBox');
  if (!box) return;

  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  var pdfRenderOptions = {
    cMapUrl: '/vendor/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
    disableFontFace: false,
    useSystemFonts: true,
    isEvalSupported: true
  };

  var url = box.getAttribute('data-pdf');
  var canvas = box.querySelector('[data-pdf-canvas]');
  var ctx = canvas.getContext('2d');
  var numEl = box.querySelector('[data-pdf-num]');
  var countEl = box.querySelector('[data-pdf-count]');
  var errEl = box.querySelector('[data-pdf-error]');
  var wrap = box.querySelector('#pdfCanvasWrap');
  var readingPages = box.querySelector('[data-pdf-reading-pages]');
  var readingShell = box.querySelector('[data-reading-shell]');
  var readingClose = box.querySelector('[data-reading-close]');
  var readingActions = box.querySelector('[data-reading-actions]');
  var readingTranslationPane = box.querySelector('[data-reading-translation-pane]');
  var readingOriginalPane = box.querySelector('[data-reading-original-pane]');
  var readingCycle = box.querySelector('[data-reading-view-cycle]');
  var readingCurrent = box.querySelector('[data-reading-current]');
  var readingCount = box.querySelector('[data-reading-count]');
  var readBtn = box.querySelector('[data-pdf-read]');
  var toolbar = box.querySelector('.pdf-toolbar');
  var hasReadingMode = !!(readingPages && readingShell && readBtn);

  var pdfDoc = null;
  var pageNum = 1;
  var scale = 1.0;
  var fitMode = true;
  var rendering = false;
  var readingMode = false;
  var readingObserver = null;
  var readingScrollHandlers = [];
  var readingSyncBusy = false;
  var readingViewMode = 0; // 0 الأصل، 1 الترجمة، 2 العرض الثنائي
  var pdfLoadPromise = null;
  var sharedReaderPromise = null;

  function waitForSharedReader(timeout) {
    timeout = timeout || 15000;
    if (window.SidjilOpenDocumentReader) return Promise.resolve(window.SidjilOpenDocumentReader);
    if (sharedReaderPromise) return sharedReaderPromise;
    sharedReaderPromise = new Promise(function (resolve, reject) {
      var started = Date.now();
      var timer = setInterval(function () {
        if (window.SidjilOpenDocumentReader) {
          clearInterval(timer);
          resolve(window.SidjilOpenDocumentReader);
        } else if (Date.now() - started >= timeout) {
          clearInterval(timer);
          reject(new Error('تعذّر تحميل قارئ الموقع'));
        }
      }, 100);
    });
    return sharedReaderPromise;
  }

  function openSharedReader(initialTranslationId) {
    var translations = [];
    try { translations = JSON.parse(box.getAttribute('data-translation-files') || '[]'); } catch (e) { translations = []; }
    var fileId = Number(box.getAttribute('data-pdf-file-id')) || null;
    var title = box.getAttribute('data-material-title') || '';
    var readerOptions = {
      url: url,
      pdf: url,
      fileId: fileId,
      materialId: Number(box.getAttribute('data-material-id')) || null,
      materialTitle: title,
      uiLang: document.documentElement.lang || new URLSearchParams(window.location.search).get('lang') || 'ar',
      originalDownload: fileId ? '/file/' + fileId + '?download=1&watermark=1' : url,
      translations: translations,
      initialTranslationId: initialTranslationId || null,
    };
    return waitForSharedReader().then(function (open) { return open(readerOptions); });
  }

  function showError() {
    errEl.classList.remove('hidden');
    canvas.style.display = 'none';
  }

  function renderPage() {
    if (!pdfDoc || rendering || readingMode) return;
    rendering = true;
    pdfDoc.getPage(pageNum).then(function (page) {
      var viewport;
      if (fitMode) {
        var wrapWidth = wrap.clientWidth || 800;
        var base = page.getViewport({ scale: 1.0 });
        scale = wrapWidth / base.width;
      }
      viewport = page.getViewport({ scale: scale });
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      canvas.style.imageRendering = 'auto';
      canvas.setAttribute('dir', 'ltr');
      canvas.style.direction = 'ltr';
      ctx.direction = 'ltr';
      return page.render({
        canvasContext: ctx,
        viewport: viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise;
    }).then(function () {
      rendering = false;
      numEl.textContent = String(pageNum);
    }).catch(function () {
      rendering = false;
      showError();
    });
  }

  function goTo(n) {
    if (!pdfDoc) return;
    pageNum = Math.min(Math.max(1, n), pdfDoc.numPages);
    if (readingMode) {
      var target = readingPages.querySelector('[data-page="' + pageNum + '"]');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      numEl.textContent = String(pageNum);
      return;
    }
    renderPage();
  }

  function zoom(f) {
    if (readingMode) return;
    fitMode = false;
    scale = Math.min(5, Math.max(0.4, scale * f));
    renderPage();
  }

  function updateReadingPage(scrollEl) {
    if (!readingCurrent || !pdfDoc || !scrollEl) return;
    var max = Math.max(1, scrollEl.scrollHeight - scrollEl.clientHeight);
    var ratio = Math.max(0, Math.min(1, scrollEl.scrollTop / max));
    var current = Math.min(pdfDoc.numPages, Math.max(1, Math.round(ratio * (pdfDoc.numPages - 1)) + 1));
    readingCurrent.textContent = String(current);
    numEl.textContent = String(current);
  }

  function syncReadingScroll(source, target) {
    if (!readingMode || !source || !target || readingSyncBusy) return;
    readingSyncBusy = true;
    var sourceMax = Math.max(1, source.scrollHeight - source.clientHeight);
    var targetMax = Math.max(0, target.scrollHeight - target.clientHeight);
    var ratio = Math.max(0, Math.min(1, source.scrollTop / sourceMax));
    target.scrollTop = ratio * targetMax;
    updateReadingPage(source);
    requestAnimationFrame(function () { readingSyncBusy = false; });
  }

  function bindReadingSync() {
    readingScrollHandlers.forEach(function (item) { item.el.removeEventListener('scroll', item.fn); });
    readingScrollHandlers = [];
    if (!docxView || !readingPages || !activeDocxBtn) return;
    var originalHandler = function () { syncReadingScroll(readingPages, docxView); };
    var translationHandler = function () { syncReadingScroll(docxView, readingPages); };
    readingPages.addEventListener('scroll', originalHandler, { passive: true });
    docxView.addEventListener('scroll', translationHandler, { passive: true });
    readingScrollHandlers.push({ el: readingPages, fn: originalHandler }, { el: docxView, fn: translationHandler });
  }

  function unbindReadingSync() {
    readingScrollHandlers.forEach(function (item) { item.el.removeEventListener('scroll', item.fn); });
    readingScrollHandlers = [];
    readingSyncBusy = false;
  }

  function renderReadingPage(pageNumber, pageCanvas) {
    if (!pdfDoc || pageCanvas.dataset.rendered === '1' || pageCanvas.dataset.loading === '1') return;
    pageCanvas.dataset.loading = '1';
    pdfDoc.getPage(pageNumber).then(function (page) {
      var panelWidth = readingPages.clientWidth || 900;
      var base = page.getViewport({ scale: 1.0 });
      var pageScale = Math.min(2.2, Math.max(0.35, (panelWidth - 60) / base.width));
      var viewport = page.getViewport({ scale: pageScale });
      var dpr = window.devicePixelRatio || 1;
      pageCanvas.width = Math.floor(viewport.width * dpr);
      pageCanvas.height = Math.floor(viewport.height * dpr);
      pageCanvas.style.width = Math.floor(viewport.width) + 'px';
      pageCanvas.style.height = Math.floor(viewport.height) + 'px';
      pageCanvas.style.imageRendering = 'auto';
      pageCanvas.setAttribute('dir', 'ltr');
      pageCanvas.style.direction = 'ltr';
      var pageContext = pageCanvas.getContext('2d');
      pageContext.direction = 'ltr';
      return page.render({
        canvasContext: pageContext,
        viewport: viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise;
    }).then(function () {
      pageCanvas.dataset.loading = '0';
      pageCanvas.dataset.rendered = '1';
    }).catch(function () {
      pageCanvas.dataset.loading = '0';
    });
  }

  async function enterReadingMode() {
    if (!hasReadingMode || readingMode) return;
    if (!pdfDoc && pdfLoadPromise) {
      readBtn.disabled = true;
      readBtn.setAttribute('aria-busy', 'true');
      await pdfLoadPromise;
      readBtn.disabled = false;
      readBtn.removeAttribute('aria-busy');
    }
    if (!pdfDoc) return;
    readingMode = true;
    wrap.classList.add('hidden');
    readingShell.classList.remove('hidden');
    box.classList.add('is-reading');
    document.body.classList.add('sidjil-reading-open');
    readingPages.classList.remove('hidden');
    readBtn.textContent = readBtn.dataset.closeLabel;
    readBtn.setAttribute('aria-pressed', 'true');
    if (readingCount) readingCount.textContent = String(pdfDoc.numPages);
    if (readingActions) toggleBtns.forEach(function (btn) { readingActions.appendChild(btn); });
    readingPages.innerHTML = '';
    for (var i = 1; i <= pdfDoc.numPages; i += 1) {
      var pageBox = document.createElement('div');
      pageBox.className = 'pdf-reading-page';
      pageBox.dataset.page = String(i);
      var pageCanvas = document.createElement('canvas');
      pageCanvas.className = 'pdf-reading-canvas';
      pageCanvas.dataset.page = String(i);
      pageBox.appendChild(pageCanvas);
      readingPages.appendChild(pageBox);
    }
    var canvases = readingPages.querySelectorAll('.pdf-reading-canvas');
    readingObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) renderReadingPage(Number(entry.target.dataset.page), entry.target);
      });
    }, { root: readingPages, rootMargin: '900px 0px' });
    canvases.forEach(function (pageCanvas) { readingObserver.observe(pageCanvas); });
    renderReadingPage(1, canvases[0]);
    if (activeDocxBtn) {
      readingTranslationPane.classList.remove('hidden');
      readingTranslationPane.appendChild(docxView);
      docxView.classList.remove('hidden');
      readingViewMode = 2;
      bindReadingSync();
    }
    if (readingOriginalPane) readingOriginalPane.classList.remove('hidden');
    updateReadingCycle();
    var current = readingPages.querySelector('[data-page="' + pageNum + '"]');
    if (current) current.scrollIntoView({ block: 'start' });
  }

  function leaveReadingMode() {
    if (!hasReadingMode || !readingMode) return;
    readingMode = false;
    unbindReadingSync();
    if (readingObserver) readingObserver.disconnect();
    readingObserver = null;
    if (docxView && docxView.parentElement === readingTranslationPane) {
      box.appendChild(docxView);
      docxView.classList.toggle('hidden', !activeDocxBtn);
    }
    if (readingTranslationPane) readingTranslationPane.classList.add('hidden');
    if (readingOriginalPane) readingOriginalPane.classList.remove('hidden');
    readingViewMode = 0;
    if (toolbar) toggleBtns.forEach(function (btn) { toolbar.appendChild(btn); });
    readingShell.classList.add('hidden');
    box.classList.remove('is-reading');
    document.body.classList.remove('sidjil-reading-open');
    readingPages.classList.add('hidden');
    wrap.classList.remove('hidden');
    readBtn.textContent = readBtn.dataset.readLabel;
    readBtn.setAttribute('aria-pressed', 'false');
    renderPage();
  }

  box.querySelector('[data-pdf-prev]').addEventListener('click', function () { goTo(pageNum - 1); });
  box.querySelector('[data-pdf-next]').addEventListener('click', function () { goTo(pageNum + 1); });
  box.querySelector('[data-pdf-zoom-in]').addEventListener('click', function () { zoom(1.25); });
  box.querySelector('[data-pdf-zoom-out]').addEventListener('click', function () { zoom(0.8); });
  box.querySelector('[data-pdf-fit]').addEventListener('click', function () {
    if (readingMode) return;
    fitMode = true;
    renderPage();
  });
  if (hasReadingMode) {
    readBtn.addEventListener('click', function () {
      // يستخدم الموقع العام القارئ الموحد نفسه لمساحة الباحث، مع إبقاء
      // القارئ القديم كخطة رجوع إذا تعذر تحميل الوحدة المشتركة.
      if (window.SidjilOpenDocumentReader || !readingMode) {
        openSharedReader().catch(function () {
          if (readingMode) leaveReadingMode();
          else enterReadingMode();
        });
      } else {
        leaveReadingMode();
      }
    });
    if (readingClose) readingClose.addEventListener('click', leaveReadingMode);
  }
  box.querySelector('[data-pdf-full]').addEventListener('click', function () {
    var el = box;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* غير مدعوم — يُتجاهل */ }
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (readingMode || !fitMode) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderPage, 200);
  });

  pdfLoadPromise = pdfjsLib.getDocument({ url: url, withCredentials: true, ...pdfRenderOptions }).promise.then(function (doc) {
    pdfDoc = doc;
    countEl.textContent = String(doc.numPages);
    renderPage();
    return doc;
  }).catch(function () {
    showError();
    return null;
  });

  /* ---------- تبديل لغة القراءة: نظير Word المترجم ---------- */
  var docxView = box.querySelector('[data-docx-view]');
  var toggleBtns = Array.prototype.slice.call(box.querySelectorAll('[data-doc-toggle]'));
  var docxHandles = {}; // docxUrl -> handle
  var activeDocxBtn = null;
  var pageLang = document.documentElement.lang === 'fr' ? 'fr' : 'ar';

  function setPdfControlsEnabled(on) {
    box.classList.toggle('is-docx-mode', !on);
  }

  // The PDF viewer is a module while the DOCX dependencies are deferred
  // classic scripts.  On a fast click the module can run first, so wait for
  // the reader instead of replacing the translation pane with a dead link.
  function waitForDocxReader(timeout) {
    timeout = timeout || 15000;
    if (window.SidjilDocxReader && window.SidjilDocxReader.mount) {
      return Promise.resolve(window.SidjilDocxReader);
    }
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      var timer = setInterval(function () {
        if (window.SidjilDocxReader && window.SidjilDocxReader.mount) {
          clearInterval(timer);
          resolve(window.SidjilDocxReader);
        } else if (Date.now() - started >= timeout) {
          clearInterval(timer);
          reject(new Error('تعذّر تحميل قارئ الترجمة'));
        }
      }, 100);
    });
  }

  function showOriginal() {
    if (activeDocxBtn) {
      activeDocxBtn.textContent = activeDocxBtn.getAttribute('data-label-read');
      activeDocxBtn.setAttribute('aria-pressed', 'false');
      activeDocxBtn = null;
    }
    if (docxView) docxView.classList.add('hidden');
    if (readingTranslationPane) readingTranslationPane.classList.add('hidden');
    if (wrap) wrap.classList.toggle('hidden', readingMode);
    setPdfControlsEnabled(true);
    if (!readingMode) renderPage();
  }

  async function showDocx(btn) {
    var docxUrl = btn.getAttribute('data-docx');
    var docxLang = btn.getAttribute('data-docx-lang') || 'ar';
    if (activeDocxBtn === btn) { showOriginal(); return; }
    toggleBtns.forEach(function (b) {
      b.textContent = b.getAttribute('data-label-read');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.textContent = btn.getAttribute('data-label-back');
    btn.setAttribute('aria-pressed', 'true');
    activeDocxBtn = btn;
    if (readingMode && readingTranslationPane) {
      readingTranslationPane.classList.remove('hidden');
      readingTranslationPane.appendChild(docxView);
    }
    if (wrap) wrap.classList.add('hidden');
    if (readingPages && !readingMode) readingPages.classList.add('hidden');
    setPdfControlsEnabled(false);
    if (docxView) {
      docxView.classList.remove('hidden');
      if (!docxHandles[docxUrl]) {
        docxView.innerHTML = '<p class="docx-loading muted">' +
          (pageLang === 'fr' ? 'Chargement de la traduction…' : 'جارٍ تحميل الترجمة…') + '</p>';
        try {
          var reader = await waitForDocxReader();
          docxHandles[docxUrl] = await reader.mount(docxView, { url: docxUrl, lang: docxLang });
          if (readingMode) bindReadingSync();
        } catch (e) {
          docxView.innerHTML = '<p class="docx-error"><a class="btn btn-small" href="' + docxUrl + '?download=1">' +
            (pageLang === 'fr' ? 'Télécharger la traduction' : 'تنزيل ملف الترجمة') + '</a></p>';
        }
      }
    }
  }

  function updateReadingCycle() {
    if (!readingCycle) return;
    var labels = pageLang === 'fr'
      ? ['Lire la traduction', 'Afficher les deux', "Lire l'original"]
      : ['عرض الترجمة', 'عرض ثنائي متزامن', 'قراءة الأصل'];
    var icons = ['🌐', '◐', '📄'];
    var label = labels[readingViewMode] || labels[0];
    readingCycle.textContent = icons[readingViewMode] || icons[0];
    readingCycle.title = label;
    readingCycle.setAttribute('aria-label', label);
    readingCycle.setAttribute('aria-pressed', readingViewMode === 2 ? 'true' : 'false');
  }

  async function setReadingView(mode) {
    if (!readingMode) return;
    if (mode === 0) {
      readingViewMode = 0;
      showOriginal();
      if (readingOriginalPane) readingOriginalPane.classList.remove('hidden');
      if (readingTranslationPane) readingTranslationPane.classList.add('hidden');
    } else {
      if (!activeDocxBtn) {
        if (!toggleBtns.length) return;
        await showDocx(toggleBtns[0]);
      }
      readingViewMode = mode === 1 ? 1 : 2;
      if (readingOriginalPane) readingOriginalPane.classList.toggle('hidden', readingViewMode === 1);
      if (readingTranslationPane) readingTranslationPane.classList.remove('hidden');
      if (docxView) docxView.classList.remove('hidden');
      bindReadingSync();
    }
    updateReadingCycle();
  }

  toggleBtns.forEach(function (btn) {
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', async function () {
      if (window.SidjilOpenDocumentReader || sharedReaderPromise) {
        var translationId = (btn.getAttribute('data-docx') || '').match(/\/file\/(\d+)/);
        openSharedReader(translationId ? Number(translationId[1]) : null).catch(function () { showDocx(btn); });
        return;
      }
      var wasActive = activeDocxBtn === btn;
      await showDocx(btn);
      if (readingMode) await setReadingView(wasActive ? 0 : 2);
    });
  });
  if (readingCycle) {
    readingCycle.hidden = !toggleBtns.length;
    readingCycle.addEventListener('click', async function () {
      if (!readingMode || !toggleBtns.length) return;
      await setReadingView((readingViewMode + 1) % 3);
    });
    updateReadingCycle();
  }

  /* ---------- طلب ترجمة عند غياب النظير ---------- */
  var requestBtn = box.querySelector('[data-request-translation]');
  if (requestBtn) {
    var requestForm = document.createElement('form');
    requestForm.className = 'translation-request-form';
    requestForm.hidden = true;
    requestForm.innerHTML = pageLang === 'fr'
      ? '<p class="translation-request-intro">Laissez vos coordonnées pour être informé lorsque la traduction sera disponible.</p><label><span>Nom du demandeur</span><input name="requester_name" required maxlength="120" autocomplete="name"></label><label><span>E-mail</span><input name="requester_email" required type="email" maxlength="160" autocomplete="email"></label><button class="btn btn-primary" type="submit">Envoyer la demande</button><p class="translation-request-status" aria-live="polite"></p>'
      : '<p class="translation-request-intro">اكتب بياناتك لتتمكن الإدارة من متابعة طلب الترجمة معك.</p><label><span>اسم طالب الترجمة</span><input name="requester_name" required maxlength="120" autocomplete="name"></label><label><span>البريد الإلكتروني</span><input name="requester_email" required type="email" maxlength="160" autocomplete="email"></label><button class="btn btn-primary" type="submit">إرسال الطلب</button><p class="translation-request-status" aria-live="polite"></p>';
    box.appendChild(requestForm);
    requestBtn.addEventListener('click', function () {
      if (requestBtn.disabled) return;
      requestForm.hidden = !requestForm.hidden;
      if (!requestForm.hidden) requestForm.querySelector('input')?.focus();
    });
    requestForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var submit = requestForm.querySelector('[type="submit"]'), status = requestForm.querySelector('.translation-request-status');
      submit.disabled = true;
      status.textContent = pageLang === 'fr' ? 'Envoi…' : 'جارٍ الإرسال…';
      try {
        var r = await fetch('/api/v1/translation-requests', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            material_id: Number(requestBtn.getAttribute('data-material-id')),
            source_file_id: Number(requestBtn.getAttribute('data-file-id')) || null,
            requester_name: requestForm.elements.requester_name.value.trim(),
            requester_email: requestForm.elements.requester_email.value.trim(),
          }),
        });
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(d.error || '');
        requestBtn.disabled = true;
        requestBtn.textContent = pageLang === 'fr' ? 'Demande envoyée ✓' : 'تم إرسال طلب الترجمة ✓';
        status.textContent = d.duplicate
          ? (pageLang === 'fr' ? 'Votre demande est déjà enregistrée.' : 'طلبك مسجل لدينا بالفعل.')
          : (pageLang === 'fr' ? 'Nous vous contacterons lorsque la traduction sera disponible.' : 'ستتواصل الإدارة معك عند توفر الترجمة.');
        submit.hidden = true;
      } catch (e) {
        submit.disabled = false;
        status.textContent = e.message || (pageLang === 'fr' ? 'Envoi impossible.' : 'تعذّر إرسال الطلب.');
      }
    });
  }
})();
