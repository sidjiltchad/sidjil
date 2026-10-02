// ============================================================
// SIDJIL — مجلس سِجِل: سلوكيات النقاشات (تفاعلات بلا حساب + ردود + تسجيل)
// ============================================================
(function () {
  'use strict';

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return (meta && meta.content) || '';
  }

  async function postJSON(path, body, withCsrf) {
    var headers = { 'Content-Type': 'application/json' };
    if (withCsrf) {
      var tok = csrfToken();
      if (tok) headers['X-CSRF-Token'] = tok;
    }
    var res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: headers, body: JSON.stringify(body) });
    var data = null;
    try { data = await res.json(); } catch (_) { /* ليس JSON */ }
    if (!res.ok) throw new Error((data && data.error) || ('خطأ ' + res.status));
    return data;
  }

  /* ---------- التفاعلات (زوار بلا حساب) ---------- */
  document.querySelectorAll('[data-react]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var discussionId = parseInt(btn.dataset.discussion, 10);
      var replyId = btn.dataset.reply ? parseInt(btn.dataset.reply, 10) : null;
      var kind = btn.dataset.kind;
      btn.disabled = true;
      postJSON('/api/v1/reactions', { discussion_id: discussionId, reply_id: replyId, kind: kind }, false)
        .then(function (data) {
          var bucket = replyId ? (data.counts.replies[replyId] || {}) : data.counts.discussion;
          var row = btn.closest('.react-row');
          row.querySelectorAll('[data-react]').forEach(function (b) {
            var k = b.dataset.kind;
            var on = k === data.kind;
            b.classList.toggle('active', on);
            var c = b.querySelector('[data-count]');
            if (c) c.textContent = bucket[k] || 0;
            b.disabled = false;
          });
        })
        .catch(function (err) {
          btn.disabled = false;
          alert(err.message);
        });
    });
  });

  /* ---------- الرد على رد (تعيين الأب) ---------- */
  document.querySelectorAll('[data-reply-to]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pid = btn.dataset.replyTo;
      var nameEl = document.getElementById('replyToName');
      document.getElementById('replyParentId').value = pid;
      if (nameEl) nameEl.textContent = btn.textContent.replace(/^.*:\s*/, '');
      var line = document.getElementById('replyToLine');
      if (line) line.classList.remove('hidden');
      var ta = document.getElementById('replyBody');
      if (ta) ta.focus();
    });
  });
  var cancelBtn = document.getElementById('replyToCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      document.getElementById('replyParentId').value = '';
      document.getElementById('replyToLine').classList.add('hidden');
    });
  }

  /* ---------- إرسال رد (باحث موثّق) ---------- */
  var replyForm = document.getElementById('newReplyForm');
  if (replyForm) {
    replyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = replyForm.dataset.discussion;
      var body = document.getElementById('replyBody').value.trim();
      var parentId = document.getElementById('replyParentId').value || null;
      if (!body) return;
      var btn = replyForm.querySelector('[type="submit"]');
      btn.disabled = true;
      postJSON('/api/v1/admin/discussions/' + id + '/replies', { body: body, parent_id: parentId }, true)
        .then(function () { location.reload(); })
        .catch(function (err) { btn.disabled = false; alert(err.message); });
    });
  }

  /* ---------- تسجيل باحث جديد ---------- */
  var regForm = document.getElementById('registerForm');
  if (regForm) {
    regForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('registerMsg');
      var data = {
        display_name: document.getElementById('rg-name').value.trim(),
        affiliation: document.getElementById('rg-aff').value.trim(),
        bio: document.getElementById('rg-bio').value.trim(),
        username: document.getElementById('rg-user').value.trim(),
        password: document.getElementById('rg-pass').value,
      };
      msg.textContent = '';
      msg.className = 'form-msg';
      var btn = regForm.querySelector('[type="submit"]');
      btn.disabled = true;
      postJSON('/api/v1/researcher/register', data, false)
        .then(function () {
          msg.textContent = msg.dataset.done || 'تم إنشاء الحساب بنجاح.';
          msg.className = 'form-msg ok';
          regForm.reset();
          btn.disabled = false;
        })
        .catch(function (err) { msg.textContent = err.message; msg.className = 'form-msg err'; btn.disabled = false; });
    });
  }
})();
