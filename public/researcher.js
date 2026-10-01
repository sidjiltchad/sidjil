// ============================================================
// SIDJIL — مساحة الباحث: منطق الواجهة المبسطة
// الكتابة عبر /api/v1/admin/* (JSON)، والرفع عبر FormData.
// الصلاحيات مطبّقة في الخادم: مسودات الباحث فقط + إرسال للمراجعة.
// ============================================================

// مبدّل الثيم (فاتح/داكن)
(function initThemeToggle() {
  var btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('sidjil-theme', next); } catch (e) { /* خاص */ }
  });
})();

function toast(msg, ok = true) {
  const zone = document.getElementById('toastZone');
  if (!zone) { alert(msg); return; }
  const el = document.createElement('div');
  el.className = 'toast ' + (ok ? 'ok' : 'err');
  el.textContent = msg;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function csrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.content) return meta.content;
  return sessionStorage.getItem('csrfToken') || '';
}

async function api(path, method = 'GET', body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken();
    if (token) opts.headers['X-CSRF-Token'] = token;
  }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* ليس JSON */ }
  if (!res.ok) {
    const msg = (data && data.error) || `خطأ في الخادم (${res.status})`;
    if (res.status === 401) { location.href = '/admin/login'; }
    throw new Error(msg);
  }
  return data;
}

document.addEventListener('DOMContentLoaded', () => {

  // ---------- تسجيل الخروج ----------
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try { await api('/api/v1/admin/logout', 'POST'); } catch (_) { /* تجاهل */ }
      sessionStorage.removeItem('csrfToken');
      location.href = '/admin/login';
    });
  }

  // ---------- نموذج المادة (إنشاء / تعديل) ----------
  const form = document.getElementById('rMaterialForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = form.dataset.mode;
      const id = form.dataset.id;
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const fd = new FormData(form);
        const sectionIds = fd.getAll('sectionIds').map(v => parseInt(v, 10)).filter(Number.isFinite);
        const payload = {
          type: fd.get('type'),
          title_ar: String(fd.get('title_ar') || '').trim(),
          title_orig: String(fd.get('title_orig') || '').trim(),
          description: String(fd.get('description') || '').trim(),
          language: fd.get('language') || 'ar',
          collectionIds: sectionIds,
        };
        const year = parseInt(fd.get('year'), 10);
        if (Number.isFinite(year)) payload.year = year;
        if (!payload.title_ar) throw new Error('العنوان العربي مطلوب');

        if (mode === 'edit' && id) {
          await api(`/api/v1/admin/materials/${id}`, 'PUT', payload);
          toast('حُفظت التعديلات');
        } else {
          const data = await api('/api/v1/admin/materials', 'POST', payload);
          toast('أُنشئت المسودة — يمكنك الآن رفع الملفات');
          location.href = `/researcher/${data.id}`;
          return;
        }
      } catch (err) {
        toast(err.message, false);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  // ---------- رفع ملف ----------
  const upForm = document.getElementById('rUploadForm');
  if (upForm) {
    upForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const materialId = upForm.dataset.material;
      const fileInput = upForm.querySelector('input[type="file"]');
      if (!fileInput || !fileInput.files.length) { toast('اختر ملفًا أولًا', false); return; }
      const btn = upForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        fd.append('kind', upForm.querySelector('select[name="kind"]').value || 'original');
        const opts = { method: 'POST', credentials: 'same-origin', headers: {}, body: fd };
        const token = csrfToken();
        if (token) opts.headers['X-CSRF-Token'] = token;
        const res = await fetch(`/api/v1/admin/materials/${materialId}/files`, opts);
        let data = null;
        try { data = await res.json(); } catch (_) { /* ليس JSON */ }
        if (!res.ok) throw new Error((data && data.error) || `خطأ في الرفع (${res.status})`);
        toast('رُفع الملف بنجاح');
        location.reload();
      } catch (err) {
        toast(err.message, false);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  // ---------- إرسال للمراجعة ----------
  document.querySelectorAll('[data-r-submit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('إرسال المادة للمراجعة؟ لن تتمكن من تعديلها بعد الإرسال.')) return;
      btn.disabled = true;
      try {
        await api(`/api/v1/admin/materials/${btn.dataset.rSubmit}/submit`, 'POST');
        toast('أُرسلت المادة للمراجعة — ستُنشر بعد اعتماد الإدارة');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        toast(err.message, false);
        btn.disabled = false;
      }
    });
  });

  // ---------- حذف مسودة ----------
  document.querySelectorAll('[data-r-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذه المسودة نهائيًا مع ملفاتها؟')) return;
      btn.disabled = true;
      try {
        await api(`/api/v1/admin/materials/${btn.dataset.rDelete}`, 'DELETE');
        toast('حُذفت المسودة');
        setTimeout(() => { location.href = '/researcher'; }, 600);
      } catch (err) {
        toast(err.message, false);
        btn.disabled = false;
      }
    });
  });

  // ---------- حذف ملف ----------
  document.querySelectorAll('[data-r-file-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا الملف؟')) return;
      try {
        await api(`/api/v1/admin/files/${btn.dataset.rFileDel}`, 'DELETE');
        toast('حُذف الملف');
        location.reload();
      } catch (err) {
        toast(err.message, false);
      }
    });
  });
});
