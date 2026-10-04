/* SIDJIL — قارئ PDF داخل مساحة الباحث
   canvas + طبقة نصية قابلة للتحديد + زر «ناقش هذا المقطع».
   يُحمّل كـ module ويُستدعى عبر window.SidjilPdfReader.mount(container, opts) */
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
const PDF_RENDER_OPTIONS = {
  cMapUrl: '/vendor/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
  disableFontFace: false,
  useSystemFonts: true
};

const api = (...a) => window.api(...a);
const toast = (...a) => (window.toast ? window.toast(...a) : alert(a[0]));

const KIND_LABELS = { comment: 'تعليق', review: 'مراجعة', critique: 'نقد', idea: 'فكرة', text: 'تلخيص / وصف' };

export async function mount(container, { url, materialId, materialTitle }) {
  container.innerHTML = '';
  container.classList.add('rpdf');

  container.innerHTML = `
    <div class="rpdf-toolbar" dir="ltr">
      <button type="button" data-rpdf-prev aria-label="السابق">‹</button>
      <span class="rpdf-num"><b data-rpdf-num>1</b> / <span data-rpdf-count>…</span></span>
      <button type="button" data-rpdf-next aria-label="التالي">›</button>
      <span class="rpdf-sep"></span>
      <button type="button" data-rpdf-zoom-out aria-label="تصغير">−</button>
      <button type="button" data-rpdf-zoom-in aria-label="تكبير">+</button>
      <button type="button" data-rpdf-fit>ملاءمة</button>
    </div>
    <div class="rpdf-stage">
      <div class="rpdf-page">
        <canvas data-rpdf-canvas></canvas>
        <div class="rpdf-textlayer" data-rpdf-text></div>
      </div>
      <button type="button" class="rpdf-quote-btn" data-rpdf-quote hidden>💬 ناقش هذا المقطع</button>
    </div>
    <form class="rpdf-composer" data-rpdf-composer hidden>
      <div class="rpdf-quote-preview" data-rpdf-quote-preview></div>
      <div class="post-form-row">
        <div class="field"><label>نوع المشاركة</label>
          <select name="kind">
            <option value="critique" selected>نقد</option>
            <option value="comment">تعليق</option>
            <option value="review">مراجعة</option>
            <option value="idea">فكرة</option>
            <option value="text">تلخيص / وصف</option>
          </select>
        </div>
        <div class="field"><label>العنوان</label><input name="title" required maxlength="200"></div>
      </div>
      <div class="field"><label>النص</label><textarea name="body" rows="4" required maxlength="20000" placeholder="اكتب نقدك أو تعليقك على المقطع المحدد…"></textarea></div>
      <div class="composer-footer">
        <span class="muted small">سيُنشر النقاش مرتبطًا بالمادة ورقم الصفحة.</span>
        <button class="btn btn-primary" type="submit">نشر النقاش</button>
        <button class="btn btn-ghost" type="button" data-rpdf-composer-close>إلغاء</button>
      </div>
    </form>
    <div class="rpdf-error" data-rpdf-error hidden>تعذّر تحميل الملف.</div>`;

  const canvas = container.querySelector('[data-rpdf-canvas]');
  const textLayer = container.querySelector('[data-rpdf-text]');
  const numEl = container.querySelector('[data-rpdf-num]');
  const countEl = container.querySelector('[data-rpdf-count]');
  const errEl = container.querySelector('[data-rpdf-error]');
  const quoteBtn = container.querySelector('[data-rpdf-quote]');
  const composer = container.querySelector('[data-rpdf-composer]');
  const quotePreview = container.querySelector('[data-rpdf-quote-preview]');

  const state = { doc: null, page: 1, scale: 1, fit: true, rendering: false, cancelled: false, quote: null };

  function viewportFor(page) {
    if (state.fit) {
      const w = container.querySelector('.rpdf-stage').clientWidth || 700;
      const base = page.getViewport({ scale: 1 });
      state.scale = Math.min(2.5, w / base.width);
    }
    return page.getViewport({ scale: state.scale });
  }

  async function render() {
    if (!state.doc || state.rendering || state.cancelled) return;
    state.rendering = true;
    hideQuote();
    try {
      const page = await state.doc.getPage(state.page);
      const viewport = viewportFor(page);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      canvas.setAttribute('dir', 'ltr');
      canvas.style.direction = 'ltr';
      const ctx = canvas.getContext('2d');
      ctx.direction = 'ltr';
      await page.render({
        canvasContext: ctx, viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise;
      // الطبقة النصية فوق الـcanvas
      textLayer.innerHTML = '';
      textLayer.style.width = Math.floor(viewport.width) + 'px';
      textLayer.style.height = Math.floor(viewport.height) + 'px';
      const textContent = await page.getTextContent();
      await pdfjsLib.renderTextLayer({ container: textLayer, viewport, textContent }).promise;
      numEl.textContent = String(state.page);
    } catch { /* تجاهل أخطاء العرض المتقطعة */ }
    state.rendering = false;
  }

  function go(n) {
    if (!state.doc) return;
    state.page = Math.min(Math.max(1, n), state.doc.numPages);
    composer.hidden = true;
    render();
  }

  container.querySelector('[data-rpdf-prev]').addEventListener('click', () => go(state.page - 1));
  container.querySelector('[data-rpdf-next]').addEventListener('click', () => go(state.page + 1));
  container.querySelector('[data-rpdf-zoom-in]').addEventListener('click', () => {
    state.fit = false; state.scale = Math.min(4, state.scale * 1.25); render();
  });
  container.querySelector('[data-rpdf-zoom-out]').addEventListener('click', () => {
    state.fit = false; state.scale = Math.max(0.4, state.scale * 0.8); render();
  });
  container.querySelector('[data-rpdf-fit]').addEventListener('click', () => { state.fit = true; render(); });

  // ---------- تحديد النص ← زر النقاش ----------
  function hideQuote() { quoteBtn.hidden = true; state.quote = null; }
  container.querySelector('.rpdf-stage').addEventListener('mouseup', () => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 4 || !container.contains(sel.anchorNode)) { hideQuote(); return; }
      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const stageRect = container.querySelector('.rpdf-stage').getBoundingClientRect();
        state.quote = { text: text.slice(0, 2000), page: state.page };
        quoteBtn.style.top = Math.max(8, rect.bottom - stageRect.top + 8) + 'px';
        quoteBtn.style.insetInlineStart = Math.max(8, rect.left - stageRect.left) + 'px';
        quoteBtn.hidden = false;
      } catch { hideQuote(); }
    }, 30);
  });

  quoteBtn.addEventListener('click', () => {
    if (!state.quote) return;
    quoteBtn.hidden = true;
    const titleInput = composer.querySelector('[name=title]');
    titleInput.value = `نقد مقطع من «${String(materialTitle || 'المادة').slice(0, 60)}» — ص ${state.quote.page}`;
    quotePreview.innerHTML = `<strong>المقطع المحدد (ص ${state.quote.page}):</strong><p>«${escapeHtml(state.quote.text.slice(0, 400))}${state.quote.text.length > 400 ? '…' : ''}»</p>`;
    composer.hidden = false;
    composer.querySelector('[name=body]').focus();
    composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  container.querySelector('[data-rpdf-composer-close]').addEventListener('click', () => {
    composer.hidden = true; hideQuote();
  });

  composer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(composer);
    const btn = composer.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await api('/api/v1/admin/discussions', 'POST', {
        kind: fd.get('kind') || 'critique',
        title: String(fd.get('title') || '').trim(),
        body: String(fd.get('body') || '').trim(),
        material_id: materialId ? Number(materialId) : null,
        quote_text: state.quote ? state.quote.text : null,
        page_no: state.quote ? String(state.quote.page) : null,
      });
      toast('نُشر النقاش مرتبطًا بالمقطع ورقم الصفحة');
      composer.hidden = true; hideQuote();
      composer.reset();
    } catch (err) { toast(err.message || 'تعذر النشر', false); }
    btn.disabled = false;
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- التحميل ----------
  try {
    state.doc = await pdfjsLib.getDocument({ url, withCredentials: true, ...PDF_RENDER_OPTIONS }).promise;
    if (state.cancelled) return;
    countEl.textContent = String(state.doc.numPages);
    render();
  } catch {
    errEl.hidden = false;
  }

  return { destroy() { state.cancelled = true; container.innerHTML = ''; } };
}

window.SidjilPdfReader = { mount };
