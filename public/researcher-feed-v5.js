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
    if (res.status === 401) { location.href = document.body.classList.contains('researcher-body') ? '/discussions' : '/admin/login'; }
    throw new Error(msg);
  }
  return data;
}

async function uploadMaterialFile(materialId, file, kind) {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  const headers = {};
  const token = csrfToken();
  if (token) headers['X-CSRF-Token'] = token;
  const res = await fetch(`/api/v1/admin/materials/${materialId}/files`, { method: 'POST', credentials: 'same-origin', headers, body: form });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data?.error || `فشل رفع ${file.name}`);
  return data;
}

function selectedMaterialUploads(group) {
  return {
    cover: group.querySelector('input[name="cover"]')?.files?.[0],
    images: [...(group.querySelector('input[name="contentImages"]')?.files || [])],
    contentFile: group.querySelector('input[name="contentFile"]')?.files?.[0],
  };
}

async function uploadSelectedMaterialFiles(materialId, group, { article = false, requireCover = false, requireContent = false } = {}) {
  const { cover, images, contentFile } = selectedMaterialUploads(group);
  const existingImages = Number(group.dataset.existingImages || 0);
  if (requireCover && !cover) throw new Error('اختر صورة الغلاف أولًا');
  if (requireContent && !images.length && !contentFile) throw new Error('اختر صور المضمون أو ملف PDF');
  if (!article && images.length && contentFile) throw new Error('اختر صور المضمون أو ملف PDF، ولا تجمع بينهما');
  if (existingImages + images.length > 20) throw new Error('الحد الأقصى 20 صورة للمادة');
  if (cover) await uploadMaterialFile(materialId, cover, 'cover');
  for (const image of images) await uploadMaterialFile(materialId, image, 'content-image');
  if (contentFile) await uploadMaterialFile(materialId, contentFile, 'content-file');
}

function initResearcherPickers() {
  document.querySelectorAll('[data-picker-label]').forEach((label) => {
    const input = document.getElementById(label.dataset.pickerLabel);
    if (!input || input.dataset.sjPickerBound) return;
    input.dataset.sjPickerBound = '1';
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      label.textContent = files.length
        ? files.length === 1 ? files[0].name : `${files.length} صور مختارة`
        : label.dataset.emptyLabel || 'لم يُختر ملف';
      const group = input.closest('[data-upload-fields]');
      if (group && group.dataset.article !== 'true') {
        const images = group.querySelector('input[name="contentImages"]');
        const contentFile = group.querySelector('input[name="contentFile"]');
        if (input === images && files.length && contentFile?.files?.length) {
          contentFile.value = '';
          const contentLabel = group.querySelector(`[data-picker-label="${contentFile.id}"]`);
          if (contentLabel) contentLabel.textContent = 'ملف واحد فقط';
        }
        if (input === contentFile && files.length && images?.files?.length) {
          images.value = '';
          const imagesLabel = group.querySelector(`[data-picker-label="${images.id}"]`);
          if (imagesLabel) imagesLabel.textContent = 'يمكن اختيار أكثر من صورة';
        }
      }
    });
  });
  const postImages = document.getElementById('nd-images');
  const preview = document.getElementById('ndImagesPreview');
  if (postImages && preview && !postImages.dataset.sjPickerBound) {
    postImages.dataset.sjPickerBound = '1';
    postImages.addEventListener('change', () => {
      preview.replaceChildren();
      const files = [...postImages.files || []].slice(0, 10);
      if (postImages.files.length > 10) toast('يمكنك اختيار 10 صور كحد أقصى', false);
      preview.hidden = !files.length;
      for (const file of files) {
        const image = document.createElement('img');
        image.alt = file.name;
        image.src = URL.createObjectURL(file);
        preview.appendChild(image);
      }
    });
  }
}

let activePdfReader = null;
function openResearcherMaterialModal(trigger) {
  const modal = document.getElementById('researcherMaterialModal');
  if (!modal || !trigger) return;
  const d = trigger.dataset;
  const media = document.getElementById('researcherMaterialModalMedia');
  const type = document.getElementById('researcherMaterialModalType');
  const title = document.getElementById('researcherMaterialModalTitle');
  const meta = document.getElementById('researcherMaterialModalMeta');
  const text = document.getElementById('researcherMaterialModalText');
  const translate = document.getElementById('researcherMaterialModalTranslate');
  const download = document.getElementById('researcherMaterialModalDownload');
  const discussion = document.getElementById('researcherMaterialModalDiscussion');
  if (!media || !type || !title || !meta || !text || !discussion) return;

  media.textContent = '';
  media.classList.toggle('researcher-material-modal-pdf', !!d.materialPdf);
  if (d.materialPdf) {
    const readerBox = document.createElement('div');
    readerBox.className = 'researcher-material-modal-pdf-reader';
    media.appendChild(readerBox);
    if (window.SidjilPdfReader && window.SidjilPdfReader.mount) {
      window.SidjilPdfReader.mount(readerBox, {
        url: d.materialPdf,
        materialId: d.materialId || '',
        materialTitle: d.materialTitle || 'الكتاب',
      }).then(reader => { activePdfReader = reader; }).catch(() => {});
    } else {
      // بديل: iframe عند تعذر تحميل الوحدة
      const frame = document.createElement('iframe');
      frame.className = 'researcher-material-modal-pdf-frame';
      frame.src = `${d.materialPdf}#toolbar=1&navpanes=0&view=FitH`;
      frame.title = `قراءة ${d.materialTitle || 'الكتاب'}`;
      frame.loading = 'eager';
      frame.setAttribute('allowfullscreen', 'true');
      readerBox.appendChild(frame);
    }
  } else if (d.materialImage) {
    const image = document.createElement('img');
    image.src = d.materialImage;
    image.alt = d.materialTitle || '';
    image.loading = 'eager';
    media.appendChild(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'researcher-material-modal-placeholder';
    placeholder.textContent = d.materialType || 'مادة من الأرشيف';
    media.appendChild(placeholder);
  }
  type.textContent = d.materialType || 'مادة من الأرشيف';
  title.textContent = d.materialTitle || 'مادة من الأرشيف';
  meta.textContent = '';
  [
    ['المعرف الأرشيفي', d.materialArk],
    ['السنة', d.materialYear],
    ['المصدر', d.materialSource],
    ['المؤلف / الجهة', d.materialAuthor],
    ['المصور', d.materialPhotographer],
    ['الموضع', d.materialPlace],
    ['المرجع', d.materialArchive],
    ['التاريخ', d.materialDate],
  ].filter(([, value]) => value).forEach(([label, value]) => {
    const item = document.createElement('span');
    item.textContent = `${label}: ${value}`;
    meta.appendChild(item);
  });
  text.textContent = d.materialSummary || d.materialDescription || '';
  const materialId = d.materialId || '';
  if (translate) {
    translate.hidden = !d.materialPdf;
    if (d.materialPdf) {
      translate.dataset.translateDocument = materialId;
      translate.dataset.translatePdf = d.materialPdf;
      translate.dataset.translateTitle = d.materialTitle || '';
      translate.dataset.translateOriginalDownload = d.materialPdfDownload || d.materialPdf;
    } else {
      delete translate.dataset.translateDocument;
      delete translate.dataset.translatePdf;
      delete translate.dataset.translateTitle;
      delete translate.dataset.translateOriginalDownload;
    }
  }
  if (download) {
    download.hidden = !d.materialPdf;
    if (d.materialPdf) {
      download.href = d.materialPdfDownload || `${d.materialPdf}?download=1`;
      const dlLabel = download.querySelector('.rpdf-action-label');
      if (dlLabel) dlLabel.textContent = 'تنزيل PDF الأصلي';
    } else {
      download.removeAttribute('href');
    }
  }
  discussion.dataset.materialId = materialId;
  discussion.setAttribute('aria-expanded', 'false');
  const discussionPanel = document.getElementById('researcherMaterialModalDiscussionPanel');
  const discussionForm = document.getElementById('researcherMaterialModalDiscussionForm');
  if (discussionPanel) discussionPanel.hidden = true;
  if (discussionForm) {
    discussionForm.dataset.material = materialId;
    const titleField = discussionForm.querySelector('[name="title"]');
    const bodyField = discussionForm.querySelector('[name="body"]');
    if (titleField) titleField.value = d.materialTitle || '';
    if (bodyField) bodyField.value = '';
    const defaultKind = discussionForm.querySelector('input[name="kind"][value="comment"]');
    if (defaultKind) defaultKind.checked = true;
  }
  modal.hidden = false;
  document.body.classList.add('researcher-modal-open');
  const close = modal.querySelector('[data-researcher-modal-close]');
  if (close) close.focus();
}

function closeResearcherMaterialModal() {
  if (activePdfReader) { try { activePdfReader.destroy(); } catch {} activePdfReader = null; }
  const modal = document.getElementById('researcherMaterialModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('researcher-modal-open');
}

// ---------- عارض الصور بأسلوب فيسبوك (الصورة نفسها بملء الشاشة) ----------
function openImageLightbox(src, alt) {
  if (!src) return;
  let box = document.getElementById('researcherImageLightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'researcherImageLightbox';
    box.className = 'researcher-image-lightbox';
    box.hidden = true;
    box.innerHTML = '<button class="researcher-lightbox-close" type="button" aria-label="إغلاق">×</button><img alt="">';
    const lightboxImage = box.querySelector('img');
    let pointerStart = null;
    let suppressLightboxClick = false;
    lightboxImage.tabIndex = 0;
    lightboxImage.setAttribute('role', 'button');
    lightboxImage.setAttribute('aria-label', 'اضغط لتكبير الصورة أو تصغيرها');
    lightboxImage.title = 'اضغط لتكبير الصورة';
    lightboxImage.addEventListener('click', (event) => {
      event.stopPropagation();
      if (suppressLightboxClick) { suppressLightboxClick = false; return; }
      lightboxImage.classList.toggle('is-zoomed');
      lightboxImage.title = lightboxImage.classList.contains('is-zoomed') ? 'اضغط لإعادة حجم الصورة' : 'اضغط لتكبير الصورة';
    });
    lightboxImage.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        lightboxImage.click();
      }
    });
    box.addEventListener('pointerdown', (event) => {
      if (event.target === lightboxImage) {
        pointerStart = { x: event.clientX, y: event.clientY };
        try { lightboxImage.setPointerCapture(event.pointerId); } catch (_) { /* قد لا يدعم المتصفح التقاط المؤشر */ }
      }
    });
    box.addEventListener('pointerup', (event) => {
      if (!pointerStart) return;
      const deltaX = event.clientX - pointerStart.x;
      const deltaY = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(deltaY) > 76 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        suppressLightboxClick = true;
        setTimeout(() => { suppressLightboxClick = false; }, 500);
        closeImageLightbox();
      }
    });
    box.addEventListener('pointercancel', () => { pointerStart = null; });
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.closest('.researcher-lightbox-close')) closeImageLightbox();
    });
    document.body.appendChild(box);
  }
  const img = box.querySelector('img');
  img.src = src;
  img.alt = alt || '';
  img.classList.remove('is-zoomed');
  img.title = 'اضغط لتكبير الصورة';
  box.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeImageLightbox() {
  const box = document.getElementById('researcherImageLightbox');
  if (!box) return;
  box.hidden = true;
  box.querySelector('img').removeAttribute('src');
  document.body.style.overflow = '';
}

function initResearcherInfiniteFeed() {
  const feed = document.getElementById('researcherPublishedFeed');
  if (!feed || feed.dataset.hasMore !== 'true' || feed.dataset.infiniteBound) return;
  feed.dataset.infiniteBound = '1';
  let loading = false;
  const loader = document.querySelector('[data-researcher-feed-loader]') || (() => {
    const el = document.createElement('div');
    el.className = 'researcher-feed-loader';
    el.dataset.researcherFeedLoader = '1';
    el.innerHTML = '<span class="researcher-feed-loader-spinner" aria-hidden="true"></span><span>جارٍ تحميل المزيد…</span>';
    feed.after(el);
    return el;
  })();
  const stop = () => {
    feed.dataset.hasMore = 'false';
    loader.hidden = true;
    observer?.disconnect();
  };
  const loadMore = async () => {
    if (loading || feed.dataset.hasMore !== 'true') return;
    loading = true;
    loader.hidden = false;
    loader.classList.add('is-loading');
    try {
      const params = new URLSearchParams({
        feed: feed.dataset.feed || 'discover',
        offset: feed.dataset.offset || '0',
        limit: feed.dataset.limit || '18',
      });
      if (feed.dataset.section) params.set('section', feed.dataset.section);
      const response = await fetch(`/researcher/feed?${params.toString()}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.html) feed.insertAdjacentHTML('beforeend', data.html);
      feed.dataset.offset = String(data.nextOffset ?? Number(feed.dataset.offset || 0));
      feed.dataset.hasMore = data.hasMore ? 'true' : 'false';
      if (!data.hasMore) stop();
    } catch (error) {
      loader.innerHTML = '<span>تعذر تحميل المزيد. اضغط للمحاولة مجددًا.</span>';
      loader.classList.add('is-error');
      loader.onclick = () => { loader.classList.remove('is-error'); loadMore(); };
    } finally {
      loading = false;
      loader.classList.remove('is-loading');
    }
  };
  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => { if (entries.some(entry => entry.isIntersecting)) loadMore(); }, { rootMargin: '700px 0px' })
    : null;
  if (observer) observer.observe(loader);
  else window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900) loadMore();
  }, { passive: true });
}

function initResearcherPage() {
  initSocial();
  initResearcherInfiniteFeed();

  // ---------- عارض الصور وتفاصيل المواد داخل مساحة الباحث ----------
  document.addEventListener('click', (event) => {
    const lightboxTrigger = event.target.closest('[data-material-lightbox]');
    if (lightboxTrigger) {
      event.preventDefault();
      const img = lightboxTrigger.querySelector('img');
      openImageLightbox(lightboxTrigger.dataset.materialLightbox, img ? img.alt : '');
      return;
    }
    const trigger = event.target.closest('[data-material-details]');
    if (trigger) {
      event.preventDefault();
      openResearcherMaterialModal(trigger);
      return;
    }
    if (event.target.closest('[data-researcher-modal-close]')) {
      event.preventDefault();
      closeResearcherMaterialModal();
      return;
    }
    if (event.target.closest('#researcherMaterialModalDiscussion')) {
      event.preventDefault();
      const button = document.getElementById('researcherMaterialModalDiscussion');
      const panel = document.getElementById('researcherMaterialModalDiscussionPanel');
      if (button && panel) {
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
        if (!panel.hidden) panel.querySelector('textarea[name="body"]')?.focus();
      }
      return;
    }
    const modal = document.getElementById('researcherMaterialModal');
    if (modal && event.target === modal) closeResearcherMaterialModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeResearcherMaterialModal(); closeImageLightbox(); }
  });

  // ---------- تغيير كلمة المرور ----------
  document.querySelectorAll('[data-password-target]').forEach((toggle) => {
    if (toggle.dataset.sjBound) return;
    toggle.dataset.sjBound = '1';
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.passwordTarget);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggle.textContent = visible ? 'إظهار' : 'إخفاء';
      toggle.setAttribute('aria-label', visible ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور');
    });
  });
  const passwordForm = document.getElementById('researcherPasswordForm');
  if (passwordForm && !passwordForm.dataset.sjBound) {
    passwordForm.dataset.sjBound = '1';
    const newPassword = passwordForm.querySelector('[name="new_password"]');
    const confirmPassword = passwordForm.querySelector('[name="confirm_password"]');
    const strength = passwordForm.querySelector('[data-password-strength]');
    const strengthLabel = passwordForm.querySelector('[data-password-strength-label]');
    const matchLabel = passwordForm.querySelector('[data-password-match]');
    const updatePasswordHints = () => {
      const value = newPassword ? newPassword.value : '';
      let score = 0;
      if (value.length >= 8) score++;
      if (/[A-ZÀ-ÖØ-Ý]/.test(value)) score++;
      if (/[a-zà-öø-ÿ]/.test(value)) score++;
      if (/\d/.test(value)) score++;
      if (/[^A-Za-zÀ-ÿ\d]/.test(value)) score++;
      if (strength) { strength.dataset.level = value ? String(Math.max(1, score)) : '0'; }
      if (strengthLabel) strengthLabel.textContent = !value ? '8 أحرف على الأقل' : score >= 4 ? 'كلمة مرور قوية' : score >= 2 ? 'كلمة مرور متوسطة' : 'كلمة مرور ضعيفة';
      if (matchLabel && confirmPassword && confirmPassword.value) {
        matchLabel.textContent = value === confirmPassword.value ? 'كلمتا المرور متطابقتان' : 'كلمتا المرور غير متطابقتين';
        matchLabel.className = value === confirmPassword.value ? 'researcher-password-match ok' : 'researcher-password-match err';
      } else if (matchLabel) { matchLabel.textContent = ''; matchLabel.className = 'muted researcher-password-match'; }
    };
    [newPassword, confirmPassword].forEach((input) => input && input.addEventListener('input', updatePasswordHints));
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = passwordForm.querySelector('[data-password-status]');
      const button = passwordForm.querySelector('[type="submit"]');
      const fd = new FormData(passwordForm);
      const payload = {
        current_password: String(fd.get('current_password') || ''),
        new_password: String(fd.get('new_password') || ''),
        confirm_password: String(fd.get('confirm_password') || ''),
      };
      if (payload.new_password !== payload.confirm_password) {
        if (status) status.textContent = 'كلمتا المرور الجديدتان غير متطابقتين';
        toast('كلمتا المرور الجديدتان غير متطابقتين', false);
        return;
      }
      if (button) button.disabled = true;
      try {
        await api('/api/v1/admin/profile/password', 'POST', payload);
        passwordForm.reset();
        updatePasswordHints();
        if (status) status.textContent = 'تم تغيير كلمة المرور وإبطال الجلسات الأخرى.';
        toast('تم تغيير كلمة المرور بنجاح');
      } catch (error) {
        if (status) status.textContent = error.message;
        toast(error.message, false);
      } finally { if (button) button.disabled = false; }
    });
  }

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
    const headers = {};
    const token = csrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    let res = null;
    try {
      res = await fetch('/api/v1/admin/logout', { method: 'POST', credentials: 'same-origin', headers });
    } catch (_) { res = null; }
    // 401 تعني الجلسة ميتة أصلًا — نُكمل التنظيف. أي فشل آخر: لا نتظاهر بالخروج
    if (!res || (!res.ok && res.status !== 401)) {
      toast('تعذّر تسجيل الخروج — تحقق من الاتصال ثم حاول مجددًا.', false);
      return;
    }
    sessionStorage.removeItem('csrfToken');
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => /sidjil/i.test(k)).map((k) => caches.delete(k)));
      }
    } catch (_) { /* تجاهل */ }
    location.replace('/');
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
          const group = form.querySelector('[data-upload-fields]');
          const chosen = selectedMaterialUploads(group);
          if (!chosen.cover) throw new Error('اختر صورة الغلاف أولًا');
          if (!chosen.images.length && !chosen.contentFile) throw new Error('اختر صور المضمون أو ملف PDF');
          if (chosen.images.length && chosen.contentFile) throw new Error('اختر صور المضمون أو ملف PDF، ولا تجمع بينهما');
          const data = await api('/api/v1/admin/materials', 'POST', payload);
          try {
            await uploadSelectedMaterialFiles(data.id, group, { requireCover: true, requireContent: true });
          } catch (uploadError) {
            toast(`أُنشئت المسودة، لكن لم يكتمل الرفع: ${uploadError.message}`, false);
            setTimeout(() => { location.href = `/researcher/${data.id}`; }, 1200);
            return;
          }
          toast('أُنشئت المسودة ورُفعت ملفاتها');
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
      const group = upForm.querySelector('[data-upload-fields]');
      const selected = group && [...group.querySelectorAll('input[type="file"]')].some(input => input.files?.length);
      if (!selected) { toast('اختر الغلاف أو صور المحتوى أو الملف أولًا', false); return; }
      const btn = upForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        await uploadSelectedMaterialFiles(materialId, group, { article: upForm.dataset.article === 'true' });
        toast('رُفعت الملفات بنجاح');
        location.reload();
      } catch (err) {
        toast(err.message, false);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  // ---------- إرسال للمراجعة ----------
  document.querySelectorAll('[data-r-edit-request]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('إرسال طلب إلى الإدارة للسماح بتعديل هذه المادة المنشورة؟')) return;
      btn.disabled = true;
      try {
        await api(`/api/v1/admin/materials/${btn.dataset.rEditRequest}/edit-request`, 'POST');
        toast('أُرسل طلب تعديل المادة إلى الإدارة');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        toast(err.message, false);
        btn.disabled = false;
      }
    });
  });

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
        const kindVal = trigger.dataset.discussionKind || 'comment';
        const radio = composer.querySelector(`input[name="kind"][value="${kindVal}"]`);
        if (radio) radio.checked = true;
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
      const kind = inlineForm.querySelector('[name="kind"]:checked')?.value || inlineForm.querySelector('[name="kind"]')?.value || 'comment';
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
        kind: (dForm.querySelector('[name="kind"]:checked') || {}).value || 'comment',
        title: document.getElementById('nd-title').value.trim(),
        body: document.getElementById('nd-body').value.trim(),
        quote_text: (document.getElementById('nd-quote') || { value: '' }).value.trim(),
        page_no: (document.getElementById('nd-page') || { value: '' }).value.trim(),
      };
      const matId = document.getElementById('nd-material').value.trim();
      const imageFiles = [...(document.getElementById('nd-images')?.files || [])];
      if (matId) payload.material_id = matId;
      if (imageFiles.length > 10) { toast('يمكن إرفاق 10 صور كحد أقصى', false); return; }
      if (!payload.title || !payload.body) { toast('العنوان والنص مطلوبان', false); return; }
      btn.disabled = true;
      try {
        const discussion = await api('/api/v1/admin/discussions', 'POST', payload);
        for (const file of imageFiles) {
          const fd = new FormData();
          fd.append('file', file);
          const headers = {};
          const token = csrfToken();
          if (token) headers['X-CSRF-Token'] = token;
          const response = await fetch(`/api/v1/admin/discussions/${discussion.id}/files`, { method: 'POST', credentials: 'same-origin', headers, body: fd });
          let result = null;
          try { result = await response.json(); } catch (_) {}
          if (!response.ok) throw new Error(result?.error || `فشل رفع ${file.name}`);
        }
        toast('نُشر المنشور بنجاح');
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


/* ============================================================
   الشبكة الاجتماعية: المتابعة + الخلاصة + التنبيهات
   ============================================================ */
function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function initFollowButtons() {
  const btns = document.querySelectorAll('[data-follow-toggle]');
  for (const btn of btns) {
    if (btn.dataset.sjBound) continue;
    btn.dataset.sjBound = '1';
    const targetId = btn.dataset.followToggle;
    // الحالة الأولية
    try {
      const st = await api(`/api/v1/social/follow-status?user_id=${encodeURIComponent(targetId)}`);
      setFollowBtn(btn, !!st.following);
    } catch { /* يبقى النص الافتراضي */ }
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await api('/api/v1/social/follow', 'POST', { followed_id: Number(targetId) });
        setFollowBtn(btn, !!res.following);
        const countEl = document.querySelector('[data-followers-count]');
        if (countEl) {
          const st = await api(`/api/v1/social/follow-status?user_id=${encodeURIComponent(targetId)}`);
          countEl.textContent = st.followers;
        }
        toast(res.following ? 'تمت المتابعة' : 'أُلغيت المتابعة');
      } catch (e) { toast(e.message || 'تعذر تنفيذ الأمر', false); }
      btn.disabled = false;
    });
  }
}
function setFollowBtn(btn, following) {
  btn.textContent = following ? '✓ تتابعه' : 'تابِع';
  btn.classList.toggle('btn-ghost', following);
  btn.classList.toggle('btn-primary', !following);
}

/* ---------- جرس التنبيهات (في الشريط السفلي) ---------- */
async function initNotificationBell() {
  const bell = document.getElementById('notifBell');
  if (!bell || bell.dataset.sjBound) return;
  bell.dataset.sjBound = '1';
  const badge = document.getElementById('notifBadge');
  const panel = document.getElementById('notifPanel');
  const list = document.getElementById('notifList');
  const closeBtn = document.getElementById('notifPanelClose');

  const setOpen = (open) => {
    if (panel) panel.hidden = !open;
    bell.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  async function refresh() {
    try {
      const data = await api('/api/v1/social/notifications?limit=15');
      if (badge) {
        badge.textContent = data.unread > 99 ? '99+' : data.unread;
        badge.hidden = !data.unread;
        bell.classList.toggle('has-new', !!data.unread);
      }
      if (list) {
        list.innerHTML = (data.items || []).map(n => `
          <a class="notif-item${n.is_read ? '' : ' unread'}" href="${escHtml(n.link || '#')}" data-notif-id="${n.id}">
            <strong>${escHtml(n.title)}</strong><span>${escHtml(n.body || '')}</span>
            <small>${escHtml(n.created_at || '')}</small>
          </a>`).join('') || '<div class="notif-empty">لا تنبيهات بعد.</div>';
      }
    } catch { /* تجاهل */ }
  }
  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    const willOpen = panel && panel.hidden;
    setOpen(!!willOpen);
    if (willOpen) {
      await refresh();
      try { await api('/api/v1/social/notifications/read', 'POST', { all: true }); } catch {}
      if (badge) badge.hidden = true;
      bell.classList.remove('has-new');
    }
  });
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); });
  document.addEventListener('click', (e) => {
    if (panel && !panel.hidden && !e.target.closest('.researcher-bottom-nav')) setOpen(false);
  });
  // تحديث دوري خفيف كل دقيقتين
  refresh();
  setInterval(refresh, 120000);
}

/* ---------- مؤلف فيسبوك: خانة واحدة تتمدد ---------- */
function initFbComposer() {
  const trigger = document.getElementById('fbComposerTrigger');
  const form = document.getElementById('discussionForm');
  if (!trigger || !form || trigger.dataset.sjBound) return;
  trigger.dataset.sjBound = '1';
  const setOpen = (open) => {
    form.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    trigger.style.display = open ? 'none' : '';
    if (open) {
      const title = form.querySelector('[name="title"]');
      if (title) setTimeout(() => title.focus(), 50);
    }
  };
  trigger.addEventListener('click', () => setOpen(true));
  const cancel = document.getElementById('fbComposerCancel');
  if (cancel) cancel.addEventListener('click', () => setOpen(false));
}

/* ---------- تمدد تلقائي لحقول النص ---------- */
function initAutogrow() {
  document.querySelectorAll('textarea[data-autogrow]').forEach((ta) => {
    if (ta.dataset.sjBound) return;
    ta.dataset.sjBound = '1';
    const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', grow);
    grow();
  });
}

/* ---------- أزرار المشاركة (نسخ الرابط) ---------- */
function initShareButtons() {
  document.querySelectorAll('[data-share-discussion]').forEach((btn) => {
    if (btn.dataset.sjBound) return;
    btn.dataset.sjBound = '1';
    btn.addEventListener('click', async () => {
      const url = `${location.origin}/researcher/discussions?view=community&focus=${encodeURIComponent(btn.dataset.shareDiscussion)}`;
      try {
        await navigator.clipboard.writeText(url);
        toast('نُسخ رابط النقاش — شاركه مع الباحثين');
      } catch {
        prompt('انسخ رابط النقاش:', url);
      }
    });
  });
}

/* ---------- نموذج مقال المجلة (إنشاء + مرفق) ---------- */
function initJournalArticleForm() {
  const form = document.getElementById('journalArticleForm');
  if (!form || form.dataset.sjBound) return;
  form.dataset.sjBound = '1';
  const uploadFields = form.querySelector('[data-upload-fields]');
  const status = document.getElementById('jaStatus');
  const submitBtn = document.getElementById('jaSubmit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.querySelector('[name="title"]').value.trim();
    const body = form.querySelector('[name="body"]').value.trim();
    if (!title || !body) { toast('العنوان والنص مطلوبان', false); return; }
    if (submitBtn) submitBtn.disabled = true;
    if (status) status.textContent = 'جارٍ إرسال المقال...';
    try {
      const data = await api('/api/v1/admin/materials', 'POST', {
        type: 'article', title_ar: title, description: body, language: 'ar', collectionIds: [],
      });
      try {
        if (status) status.textContent = 'جارٍ رفع الصور والملفات...';
        await uploadSelectedMaterialFiles(data.id, uploadFields, { article: true });
        if (status) status.textContent = 'جارٍ إرسال المقال إلى الإدارة للمراجعة...';
        await api(`/api/v1/admin/materials/${data.id}/submit`, 'POST', {});
      } catch (uploadError) {
        toast(`أُنشئ المقال، لكن لم يكتمل رفعه أو إرساله للمراجعة: ${uploadError.message}`, false);
        setTimeout(() => { location.href = `/researcher/${data.id}`; }, 1200);
        return;
      }
      toast('أُرسل المقال إلى الإدارة للمراجعة');
      if (status) status.textContent = '';
      setTimeout(() => { location.href = `/researcher/${data.id}`; }, 900);
    } catch (err) {
      if (status) status.textContent = '';
      toast(err.message || 'تعذر إرسال المقال', false);
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function initSocial() {
  initFollowButtons();
  initNotificationBell();
  initFbComposer();
  initAutogrow();
  initShareButtons();
  initJournalArticleForm();
  initResearcherPickers();
}

// يعمل السكربت أحيانًا بعد DOMContentLoaded بسبب التخزين المؤقت في المتصفح؛
// شغّل التهيئة فورًا إذا كانت الصفحة جاهزة، أو انتظر الحدث عند الحاجة.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initResearcherPage, { once: true });
} else {
  initResearcherPage();
}
