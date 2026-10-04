/* إدارة المجلة: استقبال مقالات الباحثين، ترتيب العدد، ومعاينة الإخراج. */
(() => {
  'use strict';
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';
  const request = async (path, method = 'GET', data) => {
    const headers = {};
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf();
    const multipart = typeof FormData !== 'undefined' && data instanceof FormData;
    if (data !== undefined && !multipart) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { method, credentials: 'same-origin', headers, body: data === undefined ? undefined : multipart ? data : JSON.stringify(data) });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || `تعذر تنفيذ الطلب (${res.status})`);
    return result;
  };
  const toast = (message, failed = false) => {
    const zone = document.getElementById('toastZone');
    if (!zone) return alert(message);
    const item = document.createElement('div'); item.className = `toast ${failed ? 'err' : 'ok'}`; item.textContent = message; zone.append(item);
    setTimeout(() => item.remove(), 4200);
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const createForm = document.querySelector('[data-journal-create]');
  createForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = createForm.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const created = await request('/api/v1/admin/journal/issues', 'POST', {
        issue_number: document.getElementById('ji-new-number').value,
        year: document.getElementById('ji-new-year').value,
        title_ar: document.getElementById('ji-new-title').value,
        subtitle_ar: document.getElementById('ji-new-subtitle').value,
      });
      location.href = `/admin/journal?issue=${encodeURIComponent(created.id)}#issue-editor`;
    } catch (error) { toast(error.message, true); button.disabled = false; }
  });

  const editor = document.querySelector('[data-journal-issue-editor]');
  if (!editor) return;
  const blocksRoot = editor.querySelector('[data-journal-blocks]');
  const status = editor.querySelector('[data-journal-save-status]');
  const typeLabels = { article: 'مقال معتمد', text: 'نص تحريري', image: 'صورة', ad: 'إعلان' };
  const renumber = () => [...blocksRoot.querySelectorAll('[data-journal-block]')].forEach((block, index) => {
    const strong = block.querySelector('header strong');
    const title = block.dataset.type === 'article' ? ` · ${block.dataset.articleTitle || ''}` : '';
    strong.textContent = `${index + 1}. ${typeLabels[block.dataset.type]}${title}`;
  });
  const fieldMarkup = (label, field, value = '', kind = 'input', attrs = '') => `<label>${label}${kind === 'textarea' ? `<textarea data-field="${field}" rows="4" ${attrs}>${esc(value)}</textarea>` : `<input data-field="${field}" value="${esc(value)}" ${attrs}>`}</label>`;
  const addBlock = (type, properties = {}) => {
    blocksRoot.querySelector('.journal-block-empty')?.remove();
    const card = document.createElement('article'); card.className = 'journal-block-editor'; card.dataset.journalBlock = ''; card.dataset.type = type;
    if (type === 'article') { card.dataset.materialId = properties.material_id; card.dataset.articleTitle = properties.title || ''; }
    let fields = '';
    if (type === 'text') fields = fieldMarkup('عنوان الفقرة', 'title', '') + fieldMarkup('النص', 'body', '', 'textarea', 'maxlength="16000"');
    const uploadField = `<label>رفع صورة<input data-field="image_file" type="file" accept="image/jpeg,image/png,image/webp"><input data-field="image_asset_id" type="hidden"></label>`;
    if (type === 'image') fields = uploadField + fieldMarkup('أو رابط صورة محفوظة', 'image_url', '', 'input', 'placeholder="/file/123 أو رابط HTTPS"') + fieldMarkup('تعليق الصورة', 'caption', '', 'input', 'maxlength="240"');
    if (type === 'ad') fields = fieldMarkup('عنوان الإعلان', 'title', '', 'input', 'maxlength="180"') + fieldMarkup('النص', 'body', '', 'input', 'maxlength="1000"') + uploadField + fieldMarkup('أو رابط صورة محفوظة', 'image_url', '', 'input', 'placeholder="/file/123 أو رابط HTTPS"') + fieldMarkup('رابط الإعلان', 'link_url', '', 'input', 'placeholder="https://..."');
    card.innerHTML = `<header><strong></strong><div><button type="button" class="btn btn-sm btn-ghost" data-journal-move="-1" aria-label="تحريك لأعلى">↑</button><button type="button" class="btn btn-sm btn-ghost" data-journal-move="1" aria-label="تحريك لأسفل">↓</button><button type="button" class="btn btn-sm btn-danger" data-journal-remove>حذف</button></div></header>${type === 'article' ? `<p class="muted small">${esc(properties.author || '')}</p>` : fields}`;
    blocksRoot.append(card); renumber();
  };
  editor.querySelector('[data-journal-add-article]')?.addEventListener('click', () => {
    const select = editor.querySelector('#ji-article-select'); const option = select.selectedOptions[0];
    if (!select.value) return toast('اختر مقالًا منشورًا أولًا', true);
    if (blocksRoot.querySelector(`[data-type="article"][data-material-id="${CSS.escape(select.value)}"]`)) return toast('المقال موجود بالفعل في ترتيب العدد', true);
    addBlock('article', { material_id: select.value, title: option.textContent }); select.value = '';
  });
  editor.querySelectorAll('[data-journal-add-block]').forEach(button => button.addEventListener('click', () => addBlock(button.dataset.journalAddBlock)));
  blocksRoot.addEventListener('input', event => {
    if (!event.target.matches('[data-field="image_url"]')) return;
    const asset = event.target.closest('[data-journal-block]')?.querySelector('[data-field="image_asset_id"]');
    if (asset) asset.value = '';
  });
  blocksRoot.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const card = button.closest('[data-journal-block]'); if (!card) return;
    if (button.hasAttribute('data-journal-remove')) card.remove();
    if (button.hasAttribute('data-journal-move')) {
      const siblings = [...blocksRoot.querySelectorAll('[data-journal-block]')]; const index = siblings.indexOf(card); const next = siblings[index + Number(button.dataset.journalMove)];
      if (!next) return;
      if (Number(button.dataset.journalMove) < 0) blocksRoot.insertBefore(card, next); else blocksRoot.insertBefore(next, card);
    }
    if (!blocksRoot.querySelector('[data-journal-block]')) blocksRoot.innerHTML = '<div class="journal-block-empty">أضف المقالات والمواد التحريرية لتكوين العدد.</div>';
    renumber();
  });
  const collect = async () => {
    const blocks = [];
    for (const card of [...blocksRoot.querySelectorAll('[data-journal-block]')]) {
      if (card.dataset.type === 'article') { blocks.push({ type: 'article', material_id: Number(card.dataset.materialId) }); continue; }
      const value = key => card.querySelector(`[data-field="${key}"]`)?.value || '';
      const fileInput = card.querySelector('[data-field="image_file"]');
      const assetInput = card.querySelector('[data-field="image_asset_id"]');
      if (fileInput?.files?.[0]) {
        const form = new FormData(); form.append('file', fileInput.files[0]);
        status.textContent = `جارٍ رفع الصورة ${fileInput.files[0].name}…`;
        const uploaded = await request('/api/v1/admin/journal/assets', 'POST', form);
        assetInput.value = uploaded.id; fileInput.value = '';
      }
      if (card.dataset.type === 'text') blocks.push({ type: 'text', title: value('title'), body: value('body') });
      else if (card.dataset.type === 'image') blocks.push({ type: 'image', image_asset_id: Number(assetInput?.value) || null, image_url: value('image_url'), caption: value('caption') });
      else blocks.push({ type: 'ad', image_asset_id: Number(assetInput?.value) || null, title: value('title'), body: value('body'), image_url: value('image_url'), link_url: value('link_url') });
    }
    return {
      issue_number: editor.querySelector('#ji-number').value,
      year: editor.querySelector('#ji-year').value,
      title_ar: editor.querySelector('#ji-title').value,
      subtitle_ar: editor.querySelector('#ji-subtitle').value,
      editorial_ar: editor.querySelector('#ji-editorial').value,
      columns_count: editor.querySelector('#ji-columns').value,
      blocks,
    };
  };
  let saving = false;
  const save = async () => {
    if (saving) return false;
    saving = true; status.textContent = 'جارٍ حفظ العدد…';
    try {
      await request(`/api/v1/admin/journal/issues/${editor.dataset.journalIssueEditor}`, 'PUT', await collect());
      status.textContent = `حُفظ في ${new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
      return true;
    } catch (error) { status.textContent = error.message; toast(error.message, true); return false; }
    finally { saving = false; }
  };
  editor.querySelector('[data-journal-save]')?.addEventListener('click', save);
  editor.querySelector('[data-journal-ready]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    if (!confirm('اعتماد إعداد هذا العدد بوصفه جاهزًا للإخراج؟ يمكنك متابعة تعديله لاحقًا.')) return;
    button.disabled = true;
    try {
      if (!await save()) return;
      await request(`/api/v1/admin/journal/issues/${editor.dataset.journalIssueEditor}/ready`, 'POST', {});
      toast('اعتُمد إعداد العدد وأصبح جاهزًا للإخراج'); setTimeout(() => location.reload(), 500);
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  });
  renumber();
})();
