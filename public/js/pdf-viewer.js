/* SIDJIL — عارض PDF داخل صفحة المادة (PDF.js كمكتبة وظيفية فقط)
   السابق/التالي، رقم الصفحة، تكبير/تصغير، ملاءمة العرض، ملء الشاشة، تنزيل الأصل.
   عند تعذر العرض: رابط تنزيل واضح بدل فشل الصفحة. */
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

(function () {
  'use strict';

  var box = document.getElementById('pdfViewerBox');
  if (!box) return;

  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

  var url = box.getAttribute('data-pdf');
  var canvas = box.querySelector('[data-pdf-canvas]');
  var ctx = canvas.getContext('2d');
  var numEl = box.querySelector('[data-pdf-num]');
  var countEl = box.querySelector('[data-pdf-count]');
  var errEl = box.querySelector('[data-pdf-error]');
  var wrap = document.getElementById('pdfCanvasWrap');

  var pdfDoc = null;
  var pageNum = 1;
  var scale = 1.0;
  var fitMode = true; // ملاءمة العرض افتراضيًا (مناسب للهاتف)
  var rendering = false;

  function showError() {
    errEl.classList.remove('hidden');
    canvas.style.display = 'none';
  }

  function renderPage() {
    if (!pdfDoc || rendering) return;
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
      var renderCtx = {
        canvasContext: ctx,
        viewport: viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      };
      return page.render(renderCtx).promise;
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
    renderPage();
  }

  function zoom(f) {
    fitMode = false;
    scale = Math.min(5, Math.max(0.4, scale * f));
    renderPage();
  }

  box.querySelector('[data-pdf-prev]').addEventListener('click', function () { goTo(pageNum - 1); });
  box.querySelector('[data-pdf-next]').addEventListener('click', function () { goTo(pageNum + 1); });
  box.querySelector('[data-pdf-zoom-in]').addEventListener('click', function () { zoom(1.25); });
  box.querySelector('[data-pdf-zoom-out]').addEventListener('click', function () { zoom(0.8); });
  box.querySelector('[data-pdf-fit]').addEventListener('click', function () { fitMode = true; renderPage(); });
  box.querySelector('[data-pdf-full]').addEventListener('click', function () {
    var el = box;
    try {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (el.requestFullscreen) { el.requestFullscreen(); }
      else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
    } catch (e) { /* غير مدعوم — يُتجاهل */ }
  });

  // إعادة الملاءمة عند تدوير الهاتف / تغيير العرض
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!fitMode) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderPage, 200);
  });

  pdfjsLib.getDocument({ url: url, withCredentials: true }).promise.then(function (doc) {
    pdfDoc = doc;
    countEl.textContent = String(doc.numPages);
    renderPage();
  }).catch(function () {
    showError();
  });
})();
