/* SIDJIL — فتح القارئ الموحد من صفحة المادة العامة.
   لا يُنشئ هذا الملف عارض PDF ثانياً؛ كل القراءة تتم داخل قارئ الأصل/الترجمة الموحد. */

(function () {
  'use strict';

  var box = document.getElementById('pdfViewerBox');
  if (!box) return;
  var readButton = box.querySelector('[data-pdf-read]');
  if (!readButton) return;

  function waitForReader(timeout) {
    timeout = timeout || 15000;
    if (window.SidjilOpenDocumentReader) return Promise.resolve(window.SidjilOpenDocumentReader);
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      var timer = setInterval(function () {
        if (window.SidjilOpenDocumentReader) {
          clearInterval(timer);
          resolve(window.SidjilOpenDocumentReader);
        } else if (Date.now() - started >= timeout) {
          clearInterval(timer);
          reject(new Error('تعذّر تحميل القارئ الموحد'));
        }
      }, 100);
    });
  }

  function getTranslations() {
    try {
      var value = JSON.parse(box.getAttribute('data-translation-files') || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  async function openReader() {
    if (readButton.disabled) return;
    readButton.disabled = true;
    readButton.setAttribute('aria-busy', 'true');
    try {
      var open = await waitForReader();
      await open({
        url: box.getAttribute('data-pdf') || '',
        pdf: box.getAttribute('data-pdf') || '',
        fileId: Number(box.getAttribute('data-pdf-file-id')) || null,
        materialId: Number(box.getAttribute('data-material-id')) || null,
        materialTitle: box.getAttribute('data-material-title') || '',
        originalDownload: '/file/' + (Number(box.getAttribute('data-pdf-file-id')) || '') + '?download=1&watermark=1',
        translations: getTranslations(),
      });
    } catch (error) {
      var message = error && error.message ? error.message : 'تعذّر فتح القارئ الآن';
      readButton.setAttribute('aria-label', message);
      if (typeof window.toast === 'function') window.toast(message, false);
      else window.alert(message);
    } finally {
      readButton.disabled = false;
      readButton.removeAttribute('aria-busy');
    }
  }

  readButton.addEventListener('click', openReader);
})();

