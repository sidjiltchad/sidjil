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

function initResearcherPage() {

  // ---------- رأس المساحة والقائمة الجانبية ----------
  const sideToggle = document.getElementById('sideToggle');
  const sidebar = document.getElementById('adminNav');
  const shell = document.querySelector('.researcher-shell');
  const setSidebarOpen = (open) => {
    if (!sideToggle || !sidebar || !shell) return;
    sidebar.classList.toggle('open', open);
    shell.classList.toggle('nav-open', open);
    sideToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  if (sideToggle && sidebar && shell && !sideToggle.dataset.sjBound) {
    sideToggle.dataset.sjBound = '1';
    // استخدم onclick مباشرة حتى يبقى زر القائمة قابلا للنقر على متصفحات الهاتف
    // حتى مع وجود طبقة التعتيم الثابتة خلف القائمة.
    sideToggle.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setSidebarOpen(!sidebar.classList.contains('open')); };
    setSidebarOpen(false);
    sidebar.querySelectorAll('.nav-item').forEach((a) => a.addEventListener('click', () => setSidebarOpen(false)));
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== sideToggle && !sideToggle.contains(e.target)) setSidebarOpen(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSidebarOpen(false); });
  }

  const accountToggle = document.getElementById('researcherAccountToggle');
  const accountMenu = document.getElementById('researcherAccountMenu');
  if (accountToggle && accountMenu && !accountToggle.dataset.sjBound) {
    accountToggle.dataset.sjBound = '1';
    const setAccountOpen = (open) => {
      accountMenu.hidden = !open;
      accountMenu.style.display = open ? 'grid' : 'none';
      accountMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
      accountToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    setAccountOpen(false);
    accountToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setAccountOpen(accountMenu.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!accountMenu.contains(e.target) && e.target !== accountToggle && !accountToggle.contains(e.target)) {
        setAccountOpen(false);
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setAccountOpen(false); });
  }

  // ---------- حساب الباحث ورفع الصورة ----------
  const profileForm = document.getElementById('researcherProfileForm');
  const profileStatus = document.querySelector('[data-profile-status]');
  if (profileForm && !profileForm.dataset.sjBound) {
    profileForm.dataset.sjBound = '1';
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = profileForm.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      const fd = new FormData(profileForm);
      try {
        await api('/api/v1/admin/profile', 'PATCH', {
          display_name: String(fd.get('display_name') || '').trim(),
          email: String(fd.get('email') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          affiliation: String(fd.get('affiliation') || '').trim(),
          job_title: String(fd.get('job_title') || '').trim(),
          specialty: String(fd.get('specialty') || '').trim(),
          website: String(fd.get('website') || '').trim(),
          bio: String(fd.get('bio') || '').trim(),
        });
        if (profileStatus) profileStatus.textContent = 'تم حفظ بيانات الحساب بنجاح.';
        toast('تم حفظ بيانات الحساب');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        if (profileStatus) profileStatus.textContent = err.message;
        toast(err.message, false);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }
  const avatarInput = document.querySelector('[data-profile-avatar]');
  const avatarStatus = document.querySelector('[data-profile-avatar-status]');
  if (avatarInput && !avatarInput.dataset.sjBound) {
    avatarInput.dataset.sjBound = '1';
    avatarInput.addEventListener('change', async () => {
      if (!avatarInput.files || !avatarInput.files.length) return;
      const file = avatarInput.files[0];
      if (file.size > 5 * 1024 * 1024) { toast('حجم الصورة يتجاوز 5 ميغابايت', false); avatarInput.value = ''; return; }
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) { toast('اختر صورة JPG أو PNG أو WEBP أو GIF', false); avatarInput.value = ''; return; }
      const fd = new FormData();
      fd.append('avatar', file);
      const headers = {};
      const token = csrfToken();
      if (token) headers['X-CSRF-Token'] = token;
      avatarInput.disabled = true;
      if (avatarStatus) avatarStatus.textContent = 'جارٍ رفع الصورة…';
      try {
        const res = await fetch('/api/v1/admin/profile/avatar', { method: 'POST', credentials: 'same-origin', headers, body: fd });
        let data = null; try { data = await res.json(); } catch (_) { /* ليس JSON */ }
        if (!res.ok) throw new Error((data && data.error) || `فشل رفع الصورة (${res.status})`);
        toast('تم تحديث الصورة الشخصية');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        if (avatarStatus) avatarStatus.textContent = err.message;
        toast(err.message, false);
        avatarInput.value = '';
      } finally { avatarInput.disabled = false; }
    });
  }
  document.querySelectorAll('[data-profile-avatar-remove]').forEach((btn) => {
    if (btn.dataset.sjBound) return;
    btn.dataset.sjBound = '1';
    btn.addEventListener('click', async () => {
      if (!confirm('حذف الصورة الشخصية؟')) return;
      btn.disabled = true;
      try {
        await api('/api/v1/admin/profile/avatar', 'DELETE');
        toast('حُذفت الصورة الشخصية');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); btn.disabled = false; }
    });
  });

  // ---------- تسجيل الخروج ----------
  const btnLogout = document.getElementById('btnLogout');
  const logout = async () => {
      try { await api('/api/v1/admin/logout', 'POST'); } catch (_) { /* تجاهل */ }
      sessionStorage.removeItem('csrfToken');
      location.href = '/admin/login';
  };
  if (btnLogout) btnLogout.addEventListener('click', logout);
  document.querySelectorAll('[data-account-logout]').forEach((btn) => btn.addEventListener('click', logout));

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

  // ---------- محرر التعليق والتلخيص داخل بطاقة المادة ----------
  document.querySelectorAll('[data-discussion-open]').forEach((trigger) => {
    trigger.dataset.sjBound = '1';
    // ربط مباشر بالزر يضمن عمله حتى إذا أعيد تهيئة الصفحة أو غُيّرت طبقات الواجهة.
    trigger.onclick = () => {
      const composer = document.getElementById(trigger.dataset.discussionOpen);
      if (!composer) return;
      document.querySelectorAll('[data-discussion-composer]').forEach((other) => {
        if (other !== composer) other.hidden = true;
      });
      const alreadyOpen = !composer.hidden;
      composer.hidden = alreadyOpen;
      document.querySelectorAll(`[aria-controls="${trigger.dataset.discussionOpen}"]`).forEach((button) => {
        button.setAttribute('aria-expanded', (!alreadyOpen && button === trigger) ? 'true' : 'false');
      });
      if (!alreadyOpen) {
        const select = composer.querySelector('select[name="kind"]');
        if (select) select.value = trigger.dataset.discussionKind || 'comment';
        const body = composer.querySelector('textarea[name="body"]');
        if (body) setTimeout(() => body.focus(), 0);
      }
    };
  });
  document.querySelectorAll('[data-discussion-close]').forEach((button) => {
    button.dataset.sjBound = '1';
    button.onclick = () => {
      const composer = button.closest('[data-discussion-composer]');
      if (!composer) return;
      composer.hidden = true;
      document.querySelectorAll(`[aria-controls="${composer.id}"]`).forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    };
  });
  document.querySelectorAll('[data-inline-discussion]').forEach((inlineForm) => {
    if (inlineForm.dataset.sjBound) return;
    inlineForm.dataset.sjBound = '1';
    inlineForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const btn = inlineForm.querySelector('[type="submit"]');
      const kind = inlineForm.querySelector('[name="kind"]')?.value || 'comment';
      const title = inlineForm.querySelector('[name="title"]')?.value.trim() || '';
      const body = inlineForm.querySelector('[name="body"]')?.value.trim() || '';
      if (!title || !body) { toast('العنوان والنص مطلوبان', false); return; }
      if (btn) btn.disabled = true;
      try {
        await api('/api/v1/admin/discussions', 'POST', { kind, title, body, material_id: inlineForm.dataset.material });
        toast('نُشرت المشاركة داخل مساحة الباحث');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        toast(err.message, false);
        if (btn) btn.disabled = false;
      }
    });
  });

  // ---------- نموذج نقاش جديد ----------
  const dForm = document.getElementById('discussionForm');
  if (dForm) {
    dForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = dForm.querySelector('[type="submit"]');
      const payload = {
        kind: document.getElementById('nd-kind').value,
        title: document.getElementById('nd-title').value.trim(),
        body: document.getElementById('nd-body').value.trim(),
        quote_text: (document.getElementById('nd-quote') || { value: '' }).value.trim(),
        page_no: (document.getElementById('nd-page') || { value: '' }).value.trim(),
      };
      const matId = document.getElementById('nd-material').value.trim();
      if (matId) payload.material_id = matId;
      if (!payload.title || !payload.body) { toast('العنوان والنص مطلوبان', false); return; }
      btn.disabled = true;
      try {
        await api('/api/v1/admin/discussions', 'POST', payload);
        toast('نُشر النقاش بنجاح');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); btn.disabled = false; }
    });
  }
  document.querySelectorAll('[data-discussion-reply]').forEach(form => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const bodyField = form.querySelector('textarea[name="body"]');
      const button = form.querySelector('[type="submit"]');
      const body = (bodyField?.value || '').trim();
      if (!body) return;
      button.disabled = true;
      try {
        await api(`/api/v1/admin/discussions/${form.dataset.discussionReply}/replies`, 'POST', { body });
        toast('أُرسل الرد داخل مساحة الباحث');
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        toast(err.message, false);
        button.disabled = false;
      }
    });
  });
  document.querySelectorAll('[data-del-discussion]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا النقاش نهائيًا؟')) return;
      try {
        await api(`/api/v1/admin/discussions/${btn.dataset.delDiscussion}`, 'DELETE');
        toast('حُذف النقاش');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); }
    });
  });
}

// يعمل السكربت أحيانًا بعد DOMContentLoaded بسبب التخزين المؤقت في المتصفح؛
// شغّل التهيئة فورًا إذا كانت الصفحة جاهزة، أو انتظر الحدث عند الحاجة.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initResearcherPage, { once: true });
} else {
  initResearcherPage();
}
