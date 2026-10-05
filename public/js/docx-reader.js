/* SIDJIL — قارئ مستندات Word (النظائر المترجمة)
   يعرض ملف .docx كصفحات متكيفة مع العرض عبر مكتبة docx-preview المضمّنة محليًا.
   يُستخدم من قارئ الموقع (pdf-viewer.js) وقارئ الباحث (researcher-pdf.js).
   الاستخدام: window.SidjilDocxReader.mount(container, { url, lang }) → Promise<handle>
   حيث handle = { destroy() }.
*/
(function () {
  'use strict';

  function ensureLibs() {
    return new Promise((resolve, reject) => {
      if (window.docx && typeof window.docx.renderAsync === 'function' && window.JSZip) {
        resolve();
        return;
      }
      // انتظار تحميل السكربتات (defer) — مهلة 10 ثوانٍ
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (window.docx && typeof window.docx.renderAsync === 'function' && window.JSZip) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - t0 > 10000) {
          clearInterval(timer);
          reject(new Error('تعذّر تحميل مكتبة عرض Word'));
        }
      }, 120);
    });
  }

  // A long or complex Word file can make docx-preview fail on constrained
  // mobile browsers.  Keep a lightweight text renderer as a reliable
  // fallback so the uploaded translation remains readable in the browser.
  function xmlName(el) {
    return el && (el.localName || el.nodeName || '').split(':').pop();
  }

  function directChildren(el, name) {
    return Array.from(el && el.children || []).filter((child) => xmlName(child) === name);
  }

  function runHtml(run, doc) {
    const text = Array.from(run.childNodes || []).filter((node) => xmlName(node) === 't')
      .map((node) => node.textContent || '').join('');
    if (!text) return '';
    const props = directChildren(run, 'rPr')[0];
    const bold = props && directChildren(props, 'b').length;
    const italic = props && directChildren(props, 'i').length;
    const span = doc.createElement(italic ? 'em' : 'span');
    span.textContent = text;
    return bold ? `<strong>${span.outerHTML}</strong>` : span.outerHTML;
  }

  function paragraphHtml(p, doc) {
    const props = directChildren(p, 'pPr')[0];
    const style = props && directChildren(props, 'pStyle')[0];
    const styleName = style && (style.getAttribute('w:val') || style.getAttribute('val') || '');
    const html = Array.from(p.children || []).filter((child) => xmlName(child) === 'r')
      .map((run) => runHtml(run, doc)).join('');
    if (!html.trim()) return '';
    if (/title|heading[1-6]|subtitle/i.test(styleName)) return `<h3>${html}</h3>`;
    return `<p>${html}</p>`;
  }

  async function renderPlainText(blob, pages, lang) {
    if (!window.JSZip) throw new Error('JSZip غير متاح');
    const zip = await window.JSZip.loadAsync(blob);
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('محتوى Word غير موجود');
    const xml = await entry.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('ملف Word غير صالح');
    const body = Array.from(doc.getElementsByTagName('*')).find((el) => xmlName(el) === 'body');
    if (!body) throw new Error('نص المستند غير موجود');
    const article = document.createElement('article');
    article.className = 'docx-fallback-text';
    article.setAttribute('lang', lang);
    article.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    const chunks = [];
    Array.from(body.children || []).forEach((node) => {
      const name = xmlName(node);
      if (name === 'p') chunks.push(paragraphHtml(node, document));
      else if (name === 'tbl') {
        const rows = directChildren(node, 'tr').map((row) => {
          const cells = directChildren(row, 'tc').map((cell) => {
            const text = directChildren(cell, 'p').map((p) => paragraphHtml(p, document)).join('');
            return `<td>${text || '&nbsp;'}</td>`;
          }).join('');
          return `<tr>${cells}</tr>`;
        }).join('');
        if (rows) chunks.push(`<table><tbody>${rows}</tbody></table>`);
      }
    });
    article.innerHTML = chunks.filter(Boolean).join('');
    if (!article.textContent.trim()) throw new Error('لم يُستخرج نص من المستند');
    pages.innerHTML = '';
    pages.className = 'docx-pages docx-fallback-pages';
    pages.appendChild(article);
  }

  async function mount(container, opts) {
    const url = opts && opts.url;
    const lang = (opts && opts.lang) || 'ar';
    if (!container) throw new Error('حاوية العرض غير موجودة');
    if (!url) throw new Error('رابط المستند غير محدد');

    container.innerHTML = '';
    container.classList.add('sidjil-docx-view');
    container.setAttribute('lang', lang);
    container.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    const loading = document.createElement('p');
    loading.className = 'docx-loading muted';
    loading.textContent = lang === 'fr' ? 'Chargement de la traduction…' : 'جارٍ تحميل الترجمة…';
    container.appendChild(loading);

    let destroyed = false;
    try {
      await ensureLibs();
      const resp = await fetch(url, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error('تعذّر جلب ملف الترجمة');
      const blob = await resp.blob();
      if (destroyed) return { destroy() {} };
      loading.remove();
      const pages = document.createElement('div');
      pages.className = 'docx-pages';
      container.appendChild(pages);
      await window.docx.renderAsync(blob, pages, null, {
        className: 'sidjil-docx',
        inWrapper: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      });
      if (destroyed) { container.innerHTML = ''; return { destroy() {} }; }
    } catch (e) {
      try {
        await renderPlainText(blob, pages, lang);
      } catch (fallbackError) {
        if (!destroyed) {
          container.innerHTML = '';
          const err = document.createElement('p');
          err.className = 'docx-error';
          const dl = document.createElement('a');
          dl.href = url + (url.includes('?') ? '&' : '?') + 'download=1';
          dl.textContent = lang === 'fr' ? 'Télécharger la traduction' : 'تنزيل ملف الترجمة';
          dl.className = 'btn btn-small';
          err.textContent = (lang === 'fr' ? 'Affichage impossible dans le navigateur. ' : 'تعذّر العرض داخل المتصفح. ');
          err.appendChild(dl);
          container.appendChild(err);
          console.error('SIDJIL DOCX viewer failed', e, fallbackError);
        }
      }
    }
    return {
      destroy() {
        destroyed = true;
        container.innerHTML = '';
      },
    };
  }

  window.SidjilDocxReader = { mount };
})();
