const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
for (const form of document.querySelectorAll('[data-manual-translation-form]')) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-upload-status]');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'جارٍ الرفع…';
    try {
      const response = await fetch('/api/v1/admin/manual-translations', {
        method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: new FormData(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر رفع الملفين');
      status.textContent = 'تم الرفع. حدّث الصفحة لمراجعة القائمة.';
      form.reset();
    } catch (error) {
      status.textContent = error.message || 'تعذر رفع الملفين';
    } finally { button.disabled = false; }
  });
}
