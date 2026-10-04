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
  var readBtn = box.querySelector('[data-pdf-read]');
  var hasReadingMode = !!(readingPages && readBtn);

  var pdfDoc = null;
  var pageNum = 1;
  var scale = 1.0;
  var fitMode = true;
  var rendering = false;
  var readingMode = false;
  var readingObserver = null;

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
      return page.render({
        canvasContext: pageCanvas.getContext('2d'),
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

  function enterReadingMode() {
    if (!hasReadingMode || !pdfDoc || readingMode) return;
    readingMode = true;
    wrap.classList.add('hidden');
    readingPages.classList.remove('hidden');
    readBtn.textContent = readBtn.dataset.closeLabel;
    readBtn.setAttribute('aria-pressed', 'true');
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
    var current = readingPages.querySelector('[data-page="' + pageNum + '"]');
    if (current) current.scrollIntoView({ block: 'start' });
  }

  function leaveReadingMode() {
    if (!hasReadingMode || !readingMode) return;
    readingMode = false;
    if (readingObserver) readingObserver.disconnect();
    readingObserver = null;
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
      if (readingMode) leaveReadingMode();
      else enterReadingMode();
    });
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

  pdfjsLib.getDocument({ url: url, withCredentials: true, ...pdfRenderOptions }).promise.then(function (doc) {
    pdfDoc = doc;
    countEl.textContent = String(doc.numPages);
    renderPage();
  }).catch(function () {
    showError();
  });
})();
