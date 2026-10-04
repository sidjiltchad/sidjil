/* رفع أعداد المجلة الكاملة بصيغة PDF. */
(() => {
  'use strict';
  const form = document.querySelector('[data-journal-pdf-upload]');
  if (!form) return;
  const status = form.querySelector('[data-journal-upload-status]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = 'جارٍ رفع العدد…';
    try {
      const response = await fetch('/api/v1/admin/journal/issues', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '' },
        body: new FormData(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `تعذر رفع العدد (${response.status})`);
      status.textContent = 'تم رفع العدد ونشره.';
      location.reload();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  });
})();
