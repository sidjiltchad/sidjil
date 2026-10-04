// ============================================================
// SIDJIL — لوحة الإدارة: منطق الواجهة
// كل الكتابة عبر /api/v1/admin/* (JSON)، والرفع عبر FormData.
// لا اعتماديات خارجية.
// ============================================================

// بيانات المعالجة الافتراضية الظاهرة للزائر (§14) — تُملأ تلقائيًا
// ويمكن تعديلها قبل الحفظ
const DEFAULT_PROCESS_NOTES = {
  restored: 'النسخة المرممة مشتقة من الصورة الأصلية. أُزيلت منها آثار التلف والخدوش وحُسّنت درجة الوضوح دون تغيير العناصر الأساسية للمشهد.',
  enhanced: 'نسخة محسّنة من الصورة الأصلية من حيث الدقة والوضوح دون تغيير محتوى المشهد.',
  colorized: 'التلوين تقديري ولا يمثل دليلًا قطعيًا على الألوان التاريخية الأصلية.',
  annotated: 'نسخة مشروحة أُضيفت إليها علامات وتحديدات توضيحية دون المساس بالصورة الأصلية.',
  cropped: 'نسخة مقتطعة من الصورة الأصلية لغرض العرض فقط.',
};

// مبدّل الثيم (فاتح/داكن) — يعمل في layout الإدارة وواجهة الباحث
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

function multiVals(selectEl) {
  return Array.from(selectEl.selectedOptions).map(o => parseInt(o.value, 10)).filter(Number.isFinite);
}

function setLoading(btn, on) {
  if (btn) btn.classList.toggle('loading', on);
}

// رمز CSRF: من ميتا الصفحة (تُحقن من الجلسة) أو من رد تسجيل الدخول
function csrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.content) return meta.content;
  return sessionStorage.getItem('csrfToken') || '';
}

document.addEventListener('DOMContentLoaded', () => {

  // ---------- تسجيل الدخول ----------
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type="submit"]');
      setLoading(btn, true);
      try {
        const data = await api('/api/v1/admin/login', 'POST', {
          username: loginForm.username.value.trim(),
          password: loginForm.password.value,
        });
        if (data.csrfToken) sessionStorage.setItem('csrfToken', data.csrfToken);
        toast('تم تسجيل الدخول بنجاح');
        location.href = data.user && data.user.role === 'researcher' ? '/researcher' : '/admin';
      } catch (err) {
        toast(err.message, false);
      } finally { setLoading(btn, false); }
    });
  }

  // ---------- تسجيل الخروج ----------
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try { await api('/api/v1/admin/logout', 'POST'); } catch (_) { /* تجاهل */ }
      location.href = '/admin/login';
    });
  }

  // ---------- نموذج المادة (إنشاء / تعديل) ----------
  const materialForm = document.getElementById('materialForm');
  if (materialForm) {
    materialForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = materialForm.dataset.materialId;
      const fd = new FormData(materialForm);
      const payload = {};
      for (const [k, v] of fd.entries()) {
        if (['peopleIds', 'placeIds', 'tagIds', 'collectionIds', 'sectionIds'].includes(k)) continue;
        payload[k] = v;
      }
      // تحويل الرقمية
      if (payload.year === '') payload.year = null;
      if (payload.place_id === '') payload.place_id = null;
      if (payload.source_id === '') payload.source_id = null;
      payload.peopleIds = multiVals(materialForm.querySelector('[name="peopleIds"]'));
      payload.placeIds = multiVals(materialForm.querySelector('[name="placeIds"]'));
      payload.tagIds = multiVals(materialForm.querySelector('[name="tagIds"]'));
      // الأقسام (خانات اختيار) تُدمج مع المجموعات الموضوعية في collectionIds
      const sectionIds = Array.from(materialForm.querySelectorAll('[name="sectionIds"]:checked'))
        .map(el => parseInt(el.value, 10)).filter(Number.isFinite);
      payload.collectionIds = [...new Set([
        ...multiVals(materialForm.querySelector('[name="collectionIds"]')),
        ...sectionIds,
      ])];
      delete payload.sectionIds;

      const btn = materialForm.querySelector('button[type="submit"]');
      setLoading(btn, true);
      try {
        if (id) {
          await api(`/api/v1/admin/materials/${id}`, 'PUT', payload);
          toast('تم حفظ التعديلات');
        } else {
          const data = await api('/api/v1/admin/materials', 'POST', payload);
          toast('تم إنشاء المادة برقم ' + (data.ark || ''));
          // الانتقال إلى صفحة التعديل لإضافة الملفات والنصوص
          if (data.id) location.href = `/admin/materials/${data.id}`;
          else location.href = '/admin/materials';
        }
      } catch (err) {
        toast(err.message, false);
      } finally { setLoading(btn, false); }
    });
  }

  // ---------- النشر / الإخفاء / المسودة ----------
  document.querySelectorAll('[data-publish]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.publish;
      const status = btn.dataset.status;
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/materials/${id}/publish`, 'POST', { status });
        const labels = { draft: 'مسودة', published: 'منشورة', hidden: 'مخفية' };
        toast(`تم تغيير الحالة إلى: ${labels[status] || status}`);
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });
  });

  // ---------- حذف مادة ----------
  document.querySelectorAll('[data-del-material]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delMaterial;
      const ark = btn.dataset.ark || '';
      if (!confirm(`حذف المادة ${ark} نهائيًا؟\nسيُحذف معها كل ملفاتها في R2 ونسخ صورها ونصوصها. لا يمكن التراجع.`)) return;
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/materials/${id}`, 'DELETE');
        toast('تم حذف المادة');
        if (location.pathname.match(/^\/admin\/materials\/\d+/)) location.href = '/admin/materials';
        else location.reload();
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });
  });

  // ---------- رفع الملفات ----------
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = uploadForm.dataset.materialId;
      const fileInput = uploadForm.querySelector('input[type="file"]');
      if (!fileInput.files.length) { toast('اختر ملفًا أولًا', false); return; }
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      fd.append('kind', uploadForm.querySelector('[name="kind"]').value);
      const btn = uploadForm.querySelector('button[type="submit"]');
      setLoading(btn, true);
      try {
        const res = await fetch(`/api/v1/admin/materials/${id}/files`, {
          method: 'POST', credentials: 'same-origin', body: fd,
          headers: csrfToken() ? { 'X-CSRF-Token': csrfToken() } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `خطأ في الرفع (${res.status})`);
        toast('تم رفع الملف: ' + (data.filename || ''));
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });
  }

  // ---------- حذف ملف ----------
  document.querySelectorAll('[data-del-file]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا الملف من R2 نهائيًا؟')) return;
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/files/${btn.dataset.delFile}`, 'DELETE');
        toast('تم حذف الملف');
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });
  });

  // ---------- مدير نسخ الصور ----------
  const versionForm = document.getElementById('versionForm');
  if (versionForm) {
    const kindRadios = versionForm.querySelectorAll('input[name="kind"]');
    const derivedFields = document.getElementById('derivedFields');
    const versionTypeSel = versionForm.querySelector('[name="versionType"]');
    const noteArea = versionForm.querySelector('[name="processNote"]');
    const fileSel = versionForm.querySelector('[name="fileId"]');
    const origSel = versionForm.querySelector('[name="originalVersionId"]');

    const refreshKind = () => {
      const kind = versionForm.querySelector('input[name="kind"]:checked')?.value;
      derivedFields.classList.toggle('hidden', kind !== 'derived');
      if (versionTypeSel && noteArea && kind === 'derived') {
        const t = versionTypeSel.value;
        // ملء تلقائي ببيان المعالجة الافتراضي إذا كان الحقل فارغًا
        if (!noteArea.value.trim() && DEFAULT_PROCESS_NOTES[t]) noteArea.value = DEFAULT_PROCESS_NOTES[t];
      }
      if (origSel) origSel.required = (kind === 'derived');
    };
    kindRadios.forEach(r => r.addEventListener('change', refreshKind));
    if (versionTypeSel) versionTypeSel.addEventListener('change', () => {
      const t = versionTypeSel.value;
      if (DEFAULT_PROCESS_NOTES[t]) noteArea.value = DEFAULT_PROCESS_NOTES[t];
    });
    refreshKind();

    versionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = versionForm.dataset.materialId;
      const kind = versionForm.querySelector('input[name="kind"]:checked')?.value;
      if (!fileSel.value) { toast('اختر الملف أولًا', false); return; }
      if (kind === 'derived' && !origSel.value) {
        toast('النسخة المشتقة تتطلب اختيار الصورة الأصلية المرتبطة', false);
        return;
      }
      const payload = {
        fileId: parseInt(fileSel.value, 10),
        versionType: kind === 'original' ? 'original' : versionTypeSel.value,
        processNote: kind === 'original' ? '' : (noteArea.value.trim() || DEFAULT_PROCESS_NOTES[versionTypeSel.value] || ''),
      };
      if (kind === 'derived') payload.originalVersionId = parseInt(origSel.value, 10);
      const btn = versionForm.querySelector('button[type="submit"]');
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/materials/${id}/versions`, 'POST', payload);
        toast(kind === 'original' ? 'تم تسجيل الصورة الأصلية' : 'تم تسجيل النسخة المشتقة');
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });
  }

  // ---------- حذف نسخة صورة ----------
  document.querySelectorAll('[data-del-version]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف سجل هذه النسخة؟ (لن يُحذف الملف نفسه)')) return;
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/versions/${btn.dataset.delVersion}`, 'DELETE');
        toast('تم حذف النسخة');
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });
  });

  // ---------- حفظ التفريغ ----------
  const btnSaveTrsc = document.getElementById('btnSaveTrsc');
  if (btnSaveTrsc) {
    btnSaveTrsc.addEventListener('click', async () => {
      const id = btnSaveTrsc.dataset.materialId;
      setLoading(btnSaveTrsc, true);
      try {
        await api(`/api/v1/admin/materials/${id}/text`, 'PUT', {
          transcriptionAuto: document.getElementById('trAuto').value,
          transcriptionManual: document.getElementById('trManual').value,
        });
        await api(`/api/v1/admin/materials/${id}`, 'PUT', {
          transcription_status: document.getElementById('trscStatus').value,
        });
        toast('تم حفظ التفريغ');
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btnSaveTrsc, false); }
    });
  }

  // ---------- حفظ الترجمة ----------
  const btnSaveTrl = document.getElementById('btnSaveTrl');
  if (btnSaveTrl) {
    btnSaveTrl.addEventListener('click', async () => {
      const id = btnSaveTrl.dataset.materialId;
      const status = document.getElementById('trlStatus').value;
      setLoading(btnSaveTrl, true);
      try {
        if (status === 'none') {
          toast('اختر حالة الترجمة أولًا (غير مترجمة ليست حالة حفظ)', false);
          return;
        }
        await api(`/api/v1/admin/materials/${id}/text`, 'PUT', {
          translationText: document.getElementById('trlText').value,
          translationStatus: status,
          translator: document.getElementById('trlTranslator').value,
          sourceLang: document.getElementById('trlSourceLang').value,
        });
        toast('تم حفظ الترجمة');
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btnSaveTrl, false); }
    });
  }

  // ---------- إضافة علاقة مادة↔مادة ----------
  const relationForm = document.getElementById('relationForm');
  if (relationForm) {
    relationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = relationForm.dataset.materialId;
      const btn = relationForm.querySelector('button[type="submit"]');
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/materials/${id}/relations`, 'POST', {
          relatedArk: relationForm.relatedArk.value.trim(),
          relation: relationForm.relation.value.trim(),
          note: relationForm.note.value.trim(),
        });
        toast('تمت إضافة العلاقة');
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });
  }

  // ---------- CRUD الكيانات ----------
  const entForm = document.getElementById('entForm');
  if (entForm) {
    const entity = entForm.dataset.entity;
    const titleEl = document.getElementById('entFormTitle');
    const cancelBtn = document.getElementById('entCancel');
    const idInput = entForm.querySelector('[name="__id"]');

    const resetForm = () => {
      entForm.reset();
      idInput.value = '';
      cancelBtn.classList.add('hidden');
      titleEl.textContent = titleEl.textContent.replace(/تعديل.*$/, '').trim() || titleEl.textContent;
    };

    entForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(entForm);
      const payload = {};
      for (const [k, v] of fd.entries()) {
        if (k === '__id') continue;
        payload[k] = v === '' ? null : v;
      }
      // مربعات الاختيار: غير المحدد لا يظهر في FormData — نضبطه صراحةً 1/0
      entForm.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.name) payload[cb.name] = cb.checked ? 1 : 0;
      });
      const btn = entForm.querySelector('button[type="submit"]');
      setLoading(btn, true);
      try {
        if (idInput.value) {
          await api(`/api/v1/admin/${entity}/${idInput.value}`, 'PUT', payload);
          toast('تم حفظ التعديلات');
        } else {
          await api(`/api/v1/admin/${entity}`, 'POST', payload);
          toast('تمت الإضافة');
        }
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast(err.message, false); }
      finally { setLoading(btn, false); }
    });

    cancelBtn.addEventListener('click', () => location.reload());

    document.querySelectorAll('[data-ent-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        let row = {};
        try { row = JSON.parse(btn.dataset.row); } catch (_) { /* */ }
        for (const [k, v] of Object.entries(row)) {
          const input = entForm.querySelector(`[name="${k}"]`);
          if (!input || input.type === 'hidden') continue;
          if (input.type === 'checkbox') { input.checked = (Number(v) === 1 || v === true || v === 'on'); continue; }
          if (input.type === 'datetime-local') {
            let dv = String(v ?? '').replace(' ', 'T');
            input.value = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dv) ? dv.slice(0, 16) : '';
            continue;
          }
          input.value = v ?? '';
        }
        idInput.value = btn.dataset.id;
        titleEl.textContent = 'تعديل العنصر #' + btn.dataset.id;
        cancelBtn.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        entForm.querySelector('input[name]:not([type=hidden]), select[name], textarea[name]')?.focus();
      });
    });

    document.querySelectorAll('[data-ent-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`حذف العنصر #${btn.dataset.id}؟`)) return;
        setLoading(btn, true);
        try {
          await api(`/api/v1/admin/${btn.dataset.entDel}/${btn.dataset.id}`, 'DELETE');
          toast('تم الحذف');
          setTimeout(() => location.reload(), 600);
        } catch (err) { toast(err.message, false); }
        finally { setLoading(btn, false); }
      });
    });
  }

  // ---------- OCR اليدوي ----------
  const jobsBody = document.getElementById('jobsBody');
  async function loadJobs() {
    if (!jobsBody) return;
    const id = jobsBody.dataset.materialId;
    try {
      const data = await api(`/api/v1/admin/materials/${id}/jobs`, 'GET');
      const items = data.items || [];
      jobsBody.innerHTML = items.length ? items.map(j => `
        <tr>
          <td class="muted small">${j.created_at ? j.created_at.slice(0, 16).replace('T', ' ') : '—'}</td>
          <td>${j.job_type === 'ocr' ? 'OCR' : j.job_type}</td>
          <td>${j.status === 'completed' ? 'مكتملة' : j.status === 'failed' ? 'فاشلة' : j.status === 'processing' ? 'جارية' : 'في الانتظار'}</td>
          <td class="mono small">${j.provider || '—'}</td>
          <td class="muted small">${j.error_message ? j.error_message.slice(0, 120) : '—'}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="muted">لا عمليات بعد.</td></tr>';
    } catch (err) {
      jobsBody.innerHTML = '<tr><td colspan="5" class="muted">تعذّر تحميل السجل.</td></tr>';
    }
  }
  if (jobsBody) loadJobs();

  const btnRunOcr = document.getElementById('btnRunOcr');
  if (btnRunOcr) {
    btnRunOcr.addEventListener('click', async () => {
      const id = btnRunOcr.dataset.materialId;
      const fileId = document.getElementById('ocrFile').value;
      const language = document.getElementById('ocrLang').value;
      if (!fileId) { toast('اختر الملف أولًا', false); return; }
      if (!confirm('تشغيل OCR على هذا الملف؟\nالناتج يُحفظ خامًا في طبقة auto.')) return;
      setLoading(btnRunOcr, true);
      try {
        const r = await api(`/api/v1/admin/materials/${id}/ocr`, 'POST', {
          fileId: parseInt(fileId, 10), language,
        });
        toast(`اكتمل OCR عبر ${r.provider || ''}: ${r.chars} حرف`);
        loadJobs();
      } catch (err) { toast(err.message, false); loadJobs(); }
      finally { setLoading(btnRunOcr, false); }
    });
  }

  // ---------- مقاطع الترجمة: مراجعة متوازية ----------
  const segList = document.getElementById('segList');
  if (segList) {
    const mid = segList.dataset.materialId;
    const segStatus = document.getElementById('segStatus');
    const btnApproveTrl = document.getElementById('btnApproveTrl');
    const btnDelTrl = document.getElementById('btnDelTrl');
    const STATUS_AR = { machine: 'آلية', reviewed: 'مراجعة بشريًا', in_review: 'قيد المراجعة', approved: 'معتمدة' };
    let currentTranslation = null;

    function escHtml(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function loadSegments() {
      try {
        const data = await api(`/api/v1/admin/materials/${mid}/translation-segments`, 'GET');
        currentTranslation = data.translation;
        const segs = data.segments || [];
        if (!currentTranslation) {
          segStatus.textContent = 'لا توجد ترجمة بعد — قسّم النص الفرنسي إلى مقاطع للبدء.';
          segList.innerHTML = '';
          btnApproveTrl.classList.add('hidden');
          btnDelTrl.classList.add('hidden');
          return;
        }
        segStatus.innerHTML = `الحالة: <strong>${STATUS_AR[currentTranslation.status] || currentTranslation.status}</strong> · ${segs.length} مقطعًا`;
        btnApproveTrl.classList.toggle('hidden', currentTranslation.status === 'approved');
        btnDelTrl.classList.remove('hidden');
        segList.innerHTML = segs.map(s => `
          <div class="seg-edit" data-seg="${s.id}">
            <div class="seg-edit-head">
              <span class="mono small">#${s.sequence_number}</span>
              <label class="small">صفحة <input type="number" min="1" data-f="page_number" value="${s.page_number ?? ''}" dir="ltr" class="inp-xs"></label>
              <select data-f="status" class="inp-xs">
                <option value="machine"${s.status === 'machine' ? ' selected' : ''}>آلية</option>
                <option value="reviewed"${s.status === 'reviewed' ? ' selected' : ''}>مراجعة</option>
              </select>
              <button class="btn btn-sm btn-primary" data-save-seg="${s.id}" type="button">حفظ المقطع</button>
            </div>
            <div class="grid-2">
              <div class="field">
                <label>النص الفرنسي (المصدر)</label>
                <div class="text-block" dir="ltr" lang="fr">${escHtml(s.source_text)}</div>
              </div>
              <div class="field">
                <label>الترجمة الآلية</label>
                <textarea data-f="machine_translation" rows="4" dir="rtl" lang="ar">${escHtml(s.machine_translation || '')}</textarea>
                <label>الترجمة المراجعة <span class="muted">(تُعرض للزائر بدل الآلية عند وجودها)</span></label>
                <textarea data-f="reviewed_translation" rows="4" dir="rtl" lang="ar">${escHtml(s.reviewed_translation || '')}</textarea>
              </div>
            </div>
          </div>`).join('');

        segList.querySelectorAll('[data-save-seg]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const card = btn.closest('.seg-edit');
            const segId = btn.dataset.saveSeg;
            const payload = {};
            card.querySelectorAll('[data-f]').forEach(el => {
              const k = el.dataset.f;
              payload[k] = el.value === '' ? null : el.value;
            });
            setLoading(btn, true);
            try {
              const r = await api(`/api/v1/admin/translation-segments/${segId}`, 'PATCH', payload);
              toast('تم حفظ المقطع — حالة الترجمة: ' + (STATUS_AR[r.parentStatus] || r.parentStatus));
              loadSegments();
            } catch (err) { toast(err.message, false); }
            finally { setLoading(btn, false); }
          });
        });
      } catch (err) {
        segStatus.textContent = 'تعذّر تحميل المقاطع: ' + err.message;
      }
    }
    loadSegments();

    // تقسيم النص إلى مقاطع
    const btnSplitText = document.getElementById('btnSplitText');
    const splitBox = document.getElementById('splitBox');
    if (btnSplitText) {
      btnSplitText.addEventListener('click', () => {
        splitBox.classList.toggle('hidden');
        const ta = document.getElementById('splitSource');
        if (!ta.value.trim()) {
          // تعبئة تلقائية من التفريغ إن وُجد
          const manual = document.getElementById('trManual');
          const auto = document.getElementById('trAuto');
          ta.value = (manual && manual.value.trim()) || (auto && auto.value.trim()) || '';
        }
      });
    }

    const btnDoSplit = document.getElementById('btnDoSplit');
    if (btnDoSplit) {
      btnDoSplit.addEventListener('click', async () => {
        const id = btnDoSplit.dataset.materialId;
        const raw = document.getElementById('splitSource').value;
        const parts = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
        if (!parts.length) { toast('لا توجد مقاطع — افصل الفقرات بسطر فارغ', false); return; }
        const firstPage = parseInt(document.getElementById('splitPage').value, 10);
        const translator = document.getElementById('splitTranslator').value.trim();
        const segments = parts.map((p, i) => ({
          source_text: p,
          page_number: Number.isFinite(firstPage) ? firstPage : null,
        }));
        if (!confirm(`إنشاء ${segments.length} مقطعًا؟\n(سيستبدل هذا أي ترجمة عربية سابقة للمادة)`)) return;
        setLoading(btnDoSplit, true);
        try {
          await api(`/api/v1/admin/materials/${id}/translation-segments`, 'POST', {
            segments, translator: translator || null,
          });
          toast(`تم إنشاء ${segments.length} مقطعًا`);
          splitBox.classList.add('hidden');
          loadSegments();
        } catch (err) { toast(err.message, false); }
        finally { setLoading(btnDoSplit, false); }
      });
    }

    // اعتماد صريح
    if (btnApproveTrl) {
      btnApproveTrl.addEventListener('click', async () => {
        if (!currentTranslation) return;
        if (!confirm('اعتماد هذه الترجمة نهائيًا؟\nهذا إجراء صريح يُسجَّل في سجل العمليات.')) return;
        setLoading(btnApproveTrl, true);
        try {
          await api(`/api/v1/admin/translations/${currentTranslation.id}/approve`, 'POST', {});
          toast('تم اعتماد الترجمة');
          loadSegments();
        } catch (err) { toast(err.message, false); }
        finally { setLoading(btnApproveTrl, false); }
      });
    }

    // حذف الترجمة ومقاطعها
    if (btnDelTrl) {
      btnDelTrl.addEventListener('click', async () => {
        if (!currentTranslation) return;
        if (!confirm('حذف الترجمة وجميع مقاطعها؟ لا يمكن التراجع.')) return;
        setLoading(btnDelTrl, true);
        try {
          await api(`/api/v1/admin/translations/${currentTranslation.id}`, 'DELETE');
          toast('تم حذف الترجمة');
          loadSegments();
        } catch (err) { toast(err.message, false); }
        finally { setLoading(btnDelTrl, false); }
      });
    }
  }

  // ---------- طابور المراجعة ----------
  document.querySelectorAll('[data-material-edit-approve], [data-material-edit-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const approve = btn.hasAttribute('data-material-edit-approve');
      const requestId = approve ? btn.dataset.materialEditApprove : btn.dataset.materialEditReject;
      if (!confirm(approve ? 'السماح للباحث بتعديل هذه المادة المنشورة؟' : 'رفض طلب تعديل المادة؟')) return;
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/materials/${requestId}/edit-request/review`, 'POST', { decision: approve ? 'approve' : 'reject' });
        toast(approve ? 'سُمح للباحث بتعديل المادة' : 'رُفض طلب التعديل');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); setLoading(btn, false); }
    });
  });

  document.querySelectorAll('[data-review-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('اعتماد هذه المادة ونشرها؟')) return;
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/materials/${btn.dataset.reviewApprove}/review`, 'POST', { decision: 'approve' });
        toast('اعتُمدت المادة ونُشرت');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); setLoading(btn, false); }
    });
  });

  document.querySelectorAll('[data-review-changes]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const note = window.prompt(`اكتب ملاحظة التعديل للباحث:\n${btn.dataset.reviewTitle || ''}`, 'يرجى استكمال البيانات وتصحيح الملفات قبل إعادة الإرسال.')?.trim();
      if (!note) return;
      setLoading(btn, true);
      try {
        await api(`/api/v1/admin/materials/${btn.dataset.reviewChanges}/review`, 'POST', { decision: 'request_changes', note });
        toast('أُرسلت ملاحظة التعديل إلى الباحث');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); setLoading(btn, false); }
    });
  });

  const reviewModal = document.getElementById('reviewModal');
  const reviewNote = document.getElementById('reviewNote');
  const reviewTitle = document.getElementById('reviewModalTitle');
  const reviewConfirm = document.getElementById('reviewRejectConfirm');
  const reviewClose = document.getElementById('reviewModalClose');
  let reviewTargetId = null;
  document.querySelectorAll('[data-review-reject]').forEach(btn => {
    btn.addEventListener('click', () => {
      reviewTargetId = btn.dataset.reviewReject;
      if (reviewTitle) reviewTitle.textContent = btn.dataset.reviewTitle || '';
      if (reviewNote) reviewNote.value = '';
      if (reviewModal) reviewModal.hidden = false;
    });
  });
  if (reviewClose) reviewClose.addEventListener('click', () => { reviewModal.hidden = true; reviewTargetId = null; });
  if (reviewModal) reviewModal.addEventListener('click', (e) => {
    if (e.target === reviewModal) { reviewModal.hidden = true; reviewTargetId = null; }
  });
  if (reviewConfirm) reviewConfirm.addEventListener('click', async () => {
    const note = (reviewNote && reviewNote.value.trim()) || '';
    if (!note) { toast('ملاحظة المراجعة مطلوبة', false); return; }
    if (!reviewTargetId) return;
    setLoading(reviewConfirm, true);
    try {
      await api(`/api/v1/admin/materials/${reviewTargetId}/review`, 'POST', { decision: 'reject', note });
      toast('أُعيدت المادة إلى الباحث مع الملاحظة');
      setTimeout(() => location.reload(), 700);
    } catch (err) { toast(err.message, false); setLoading(reviewConfirm, false); }
  });

  // ---------- المستخدمون ----------
  const userForm = document.getElementById('userForm');
  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = userForm.querySelector('button[type="submit"]');
      setLoading(btn, true);
      try {
        await api('/api/v1/admin/users', 'POST', {
          username: userForm.username.value.trim(),
          password: userForm.password.value,
          role: userForm.role.value,
        });
        toast('أُنشئ الحساب بنجاح');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); setLoading(btn, false); }
    });
  }
  document.querySelectorAll('[data-user-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const active = btn.dataset.active === '1';
      if (!confirm(active ? 'تفعيل هذا الحساب؟' : 'إيقاف هذا الحساب؟ ستُبطل جلساته فورًا.')) return;
      try {
        await api(`/api/v1/admin/users/${btn.dataset.userToggle}`, 'PATCH', { is_active: active });
        toast(active ? 'فُعّل الحساب' : 'أُوقف الحساب');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); }
    });
  });
  document.querySelectorAll('[data-user-role]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const role = btn.dataset.role;
      if (!confirm(`تغيير دور الحساب إلى «${role === 'admin' ? 'مدير' : 'باحث'}»؟`)) return;
      try {
        await api(`/api/v1/admin/users/${btn.dataset.userRole}`, 'PATCH', { role });
        toast('غُيّر الدور');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); }
    });
  });
  document.querySelectorAll('[data-disc-mod]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      if (!confirm(status === 'hidden' ? 'إخفاء هذا النقاش عن الزوار؟' : 'إظهار هذا النقاش؟')) return;
      try {
        await api(`/api/v1/admin/discussions/${btn.dataset.discMod}`, 'PUT', { status });
        toast(status === 'hidden' ? 'أُخفي النقاش' : 'أُظهر النقاش');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); }
    });
  });
  document.querySelectorAll('[data-disc-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا النقاش نهائيًا مع ردوده وتفاعلاته؟')) return;
      try {
        await api(`/api/v1/admin/discussions/${btn.dataset.discDel}`, 'DELETE');
        toast('حُذف النقاش');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); }
    });
  });
  document.querySelectorAll('[data-social-report-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const select = document.querySelector(`[data-social-report-status="${btn.dataset.socialReportSave}"]`);
      if (!select) return;
      btn.disabled = true;
      try {
        await api(`/api/v1/admin/social-reports/${btn.dataset.socialReportSave}`, 'PATCH', { status: select.value });
        toast('حُدّثت حالة البلاغ');
        setTimeout(() => location.reload(), 500);
      } catch (err) { toast(err.message, false); btn.disabled = false; }
    });
  });
  document.querySelectorAll('[data-verify-researcher]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.verificationType;
      const labels = { research: 'البحثي الأصفر', administrative: 'الإداري الرمادي', participation: 'المشاركة الأخضر', none: 'إلغاء التوثيق' };
      if (!confirm(type === 'none' ? 'إلغاء توثيق هذا الباحث؟ لن يتمكن من النشر.' : `تعيين شارة ${labels[type]} لهذا الباحث؟ سيتمكن من المشاركة.`)) return;
      try {
        await api(`/api/v1/admin/researchers/${btn.dataset.verifyResearcher}/verify`, 'POST', { verification_type: type });
        toast(type === 'none' ? 'أُلغي التوثيق' : `تم تعيين شارة ${labels[type]}`);
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(err.message, false); }
    });
  });
  document.querySelectorAll('[data-user-pass]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pw = prompt(`كلمة مرور جديدة للحساب «${btn.dataset.username}» (8 أحرف على الأقل):`);
      if (pw === null) return;
      if (pw.length < 8) { toast('كلمة المرور 8 أحرف على الأقل', false); return; }
      try {
        await api(`/api/v1/admin/users/${btn.dataset.userPass}`, 'PATCH', { password: pw });
        toast('حُدّثت كلمة المرور');
      } catch (err) { toast(err.message, false); }
    });
  });

  // ---------- مسرد المصطلحات ----------
  const glossaryScope = document.querySelector('[data-glossary-manage]');
  if (glossaryScope) {
    const rowsEl = glossaryScope.querySelector('[data-glossary-rows]');
    const escG = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function loadGlossary() {
      try {
        const data = await api('/api/v1/admin/glossary');
        const items = data.items || [];
        rowsEl.innerHTML = items.length ? items.map(g => `<tr><td dir="ltr" class="mono small">${escG(g.source_lang)} → ${escG(g.target_lang)}</td><td><strong>${escG(g.source_term)}</strong></td><td><strong>${escG(g.target_term)}</strong></td><td class="muted small">${escG(g.notes || '')}</td><td><button class="btn btn-sm btn-danger" type="button" data-glossary-delete="${g.id}">حذف</button></td></tr>`).join('')
          : '<tr><td colspan="5" class="muted">المسرد فارغ — أضف أول مصطلح.</td></tr>';
        rowsEl.querySelectorAll('[data-glossary-delete]').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('حذف هذا المصطلح من المسرد؟')) return;
            try { await api(`/api/v1/admin/glossary/${btn.dataset.glossaryDelete}`, 'DELETE'); toast('حُذف المصطلح'); loadGlossary(); }
            catch (e) { toast(e.message, false); }
          });
        });
      } catch (e) { rowsEl.innerHTML = `<tr><td colspan="5" class="muted">تعذر التحميل: ${escG(e.message)}</td></tr>`; }
    }
    glossaryScope.querySelector('[data-glossary-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/api/v1/admin/glossary', 'POST', Object.fromEntries(fd.entries()));
        toast('أُضيف المصطلح للمسرد'); e.target.reset(); loadGlossary();
      } catch (err) { toast(err.message, false); }
    });
    loadGlossary();
  }

  // ---------- إدارة ترجمة الكتب والوثائق ----------
  const translationManage = document.querySelector('[data-translation-manage]');
  if (translationManage) {
    // صفحة الترجمة تتكون من بطاقتين منفصلتين: بدء الترجمة وجدول الوظائف.
    // نستخدم نطاق الصفحة كلها حتى تعمل أزرار الجدول الموجودة في البطاقة الثانية.
    const translationScope = translationManage.closest('main') || document;
    const selectAll = translationScope.querySelector('[data-translation-select-all]');
    const checks = () => Array.from(translationScope.querySelectorAll('[data-translation-job-check]'));
    if (selectAll) selectAll.addEventListener('change', () => checks().forEach((c) => { c.checked = selectAll.checked; }));
    translationManage.querySelector('[data-translation-batch-start]')?.addEventListener('click', async (e) => {
      const ids = Array.from(document.getElementById('translationBatchMaterials')?.selectedOptions || []).map((o) => Number(o.value)).filter(Number.isFinite);
      const source = document.getElementById('translationBatchSource')?.value || 'auto';
      const targets = Array.from(document.getElementById('translationBatchTargets')?.selectedOptions || []).map((o) => o.value).filter(Boolean);
      const mode = document.getElementById('translationBatchMode')?.value || 'translated';
      const ocr = document.getElementById('translationBatchOcr')?.value || 'auto';
      if (!ids.length) { toast('اختر ملفًا واحدًا على الأقل', false); return; }
      if (!targets.length) { toast('اختر لغة هدف واحدة على الأقل', false); return; }
      const validTargets = targets.filter((target) => source === 'auto' || source !== target);
      if (!validTargets.length) { toast('لغة المصدر والهدف يجب أن تختلفا', false); return; }
      const btn = e.currentTarget;
      setLoading(btn, true);
      let accepted = 0;
      try {
        for (const id of ids) {
          for (const target of validTargets) {
            try {
              await api(`/api/v1/documents/${encodeURIComponent(id)}/translations`, 'POST', { source, target, mode, ocr });
              accepted += 1;
            } catch (error) {
              toast(`تعذر بدء الملف #${id} → ${target}: ${error.message}`, false);
            }
          }
        }
        if (accepted) { toast(`بدأت ${accepted} وظيفة ترجمة في الخلفية`); setTimeout(() => location.reload(), 900); }
      } finally { setLoading(btn, false); }
    });
    translationScope.querySelectorAll('[data-translation-job-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(`حذف وظيفة الترجمة ${btn.dataset.translationJobDelete} وملفها الناتج؟`)) return;
        setLoading(btn, true);
        try {
          const result = await api(`/api/v1/admin/translation-jobs/${encodeURIComponent(btn.dataset.translationJobDelete)}`, 'DELETE');
          btn.closest('tr')?.remove();
          toast(result?.missing ? 'أزيلت الوظيفة القديمة من القائمة' : 'حُذفت وظيفة الترجمة وملفها');
        } catch (error) { toast(error.message, false); setLoading(btn, false); }
      });
    });
    translationScope.querySelectorAll('[data-translation-job-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(`إيقاف وظيفة الترجمة ${btn.dataset.translationJobCancel}؟`)) return;
        setLoading(btn, true);
        try {
          await api(`/api/v1/admin/translation-jobs/${encodeURIComponent(btn.dataset.translationJobCancel)}/cancel`, 'POST');
          btn.remove();
          const status = btn.closest('tr')?.querySelector('.translation-job-status');
          if (status) status.textContent = 'ملغاة';
          toast('أُوقفت وظيفة الترجمة');
        } catch (error) { toast(error.message, false); setLoading(btn, false); }
      });
    });
    translationScope.querySelector('[data-translation-cleanup]')?.addEventListener('click', async (e) => {
      const days = Math.max(1, Math.min(3650, Number(document.getElementById('translationCleanupDays')?.value || 30)));
      if (!confirm(`حذف وظائف الترجمة المكتملة أو الفاشلة الأقدم من ${days} يومًا؟`)) return;
      const btn = e.currentTarget;
      setLoading(btn, true);
      try {
        const result = await api('/api/v1/admin/translation-jobs/cleanup', 'POST', { beforeDays: days, includeFailed: true });
        toast(`تم حذف ${result.deletedJobs || 0} وظيفة و${result.deletedCache || 0} من عناصر الكاش`);
        setTimeout(() => location.reload(), 700);
      } catch (error) { toast(error.message, false); }
      finally { setLoading(btn, false); }
    });
  }
});

// ---------- قائمة الجوال: إظهار/إخفاء الشريط الجانبي ----------
(function initSideToggle() {
  var btn = document.getElementById('sideToggle');
  var sidebar = document.getElementById('adminNav');
  var shell = document.querySelector('.admin-shell');
  if (!btn || !sidebar || !shell) return;
  function setOpen(open) {
    sidebar.classList.toggle('open', open);
    shell.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!sidebar.classList.contains('open'));
  });
  document.addEventListener('click', function (e) {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      setOpen(false);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
  sidebar.querySelectorAll('.nav-item').forEach(function (a) {
    a.addEventListener('click', function () { setOpen(false); });
  });

  // طي القائمة على الشاشات الكبيرة مع حفظ التفضيل محليًا.
  var collapseBtn = document.getElementById('sidebarCollapse');
  var desktopQuery = window.matchMedia('(min-width: 901px)');
  function setCollapsed(collapsed) {
    var active = desktopQuery.matches && collapsed;
    shell.classList.toggle('sidebar-collapsed', active);
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-expanded', active ? 'false' : 'true');
      collapseBtn.setAttribute('aria-label', active ? 'فتح القائمة الجانبية' : 'طي القائمة الجانبية');
      collapseBtn.title = active ? 'فتح القائمة الجانبية' : 'طي القائمة الجانبية';
    }
  }
  if (collapseBtn) {
    var saved = false;
    try { saved = localStorage.getItem('sidjil-admin-sidebar-collapsed') === '1'; } catch (_) { /* خاص */ }
    setCollapsed(saved);
    collapseBtn.addEventListener('click', function () {
      var next = !shell.classList.contains('sidebar-collapsed');
      setCollapsed(next);
      try { localStorage.setItem('sidjil-admin-sidebar-collapsed', next ? '1' : '0'); } catch (_) { /* خاص */ }
    });
    var onViewportChange = function () {
      if (!desktopQuery.matches) shell.classList.remove('sidebar-collapsed');
      else {
        var persisted = false;
        try { persisted = localStorage.getItem('sidjil-admin-sidebar-collapsed') === '1'; } catch (_) { /* خاص */ }
        setCollapsed(persisted);
      }
    };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onViewportChange);
    else if (desktopQuery.addListener) desktopQuery.addListener(onViewportChange);
  }
})();
