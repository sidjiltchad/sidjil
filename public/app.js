/* SIDJIL — سلوكيات الواجهة العامة: الثيم، مقارنة قبل/بعد، نسخ الاستشهاد، تبويبات نسخ الصور، قائمة الجوال */
(function () {
  'use strict';

  /* ---------- مبدّل الثيم (فاتح/داكن) ---------- */
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var root = document.documentElement;
      root.classList.add('theme-transitioning');
      var cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('sidjil-theme', next); } catch (e) { /* خاص */ }
      setTimeout(function () {
        root.classList.remove('theme-transitioning');
      }, 350);
    });
  }

  /* ---------- قائمة الجوال ---------- */
  var navToggle = document.getElementById('navToggle');
  var mainNav = document.getElementById('mainNav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      var open = mainNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- قائمة «استكشاف» المنسدلة ---------- */
  var exploreBtn = document.getElementById('exploreBtn');
  var navDrop = exploreBtn ? exploreBtn.closest('.nav-drop') : null;
  if (exploreBtn && navDrop) {
    exploreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = navDrop.classList.toggle('open');
      exploreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!navDrop.contains(e.target)) {
        navDrop.classList.remove('open');
        exploreBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        navDrop.classList.remove('open');
        exploreBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- نسخ نص (مع بديل) ---------- */
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      // أزرار الأيقونات: وميض أخضر بدل استبدال المحتوى
      if (btn.classList && btn.classList.contains('share-ic')) {
        btn.classList.add('is-copied');
        setTimeout(function () { btn.classList.remove('is-copied'); }, 1800);
        return;
      }
      var original = btn.dataset.label || btn.textContent;
      if (!btn.dataset.label) btn.dataset.label = original;
      btn.textContent = btn.dataset.copied || '✓';
      btn.disabled = true;
      setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  var copyCitation = document.getElementById('copyCitation');
  if (copyCitation) {
    copyCitation.addEventListener('click', function () {
      var el = document.getElementById('citationText');
      if (el) copyText(el.textContent.trim(), copyCitation);
    });
  }
  var copyLink = document.getElementById('copyLink');
  if (copyLink) {
    copyLink.addEventListener('click', function () {
      copyText(copyLink.dataset.link || location.href, copyLink);
    });
  }

  /* ---------- أزرار نسخ الروابط (صناديق المشاركة) ---------- */
  document.querySelectorAll('[data-copy-link]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(btn.getAttribute('data-copy-link') || location.href, btn);
    });
  });

  /* ---------- زر مُجتمع: نسخ الرابط ثم فتح المنصة ---------- */
  document.querySelectorAll('[data-copy-open]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(btn.getAttribute('data-copy-open') || location.href, btn);
      var open = btn.getAttribute('data-open');
      if (open) window.open(open, '_blank', 'noopener');
    });
  });

  /* ---------- إغلاق الإعلانات (يُحفظ في المتصفح) ---------- */
  try {
    var dismissed = JSON.parse(localStorage.getItem('sidjil-ann-dismissed') || '[]');
    dismissed.forEach(function (id) {
      var el = document.querySelector('[data-announcement="' + id + '"]');
      if (el) el.remove();
    });
    document.querySelectorAll('[data-ann-dismiss]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-ann-dismiss');
        var el = btn.closest('[data-announcement]');
        if (el) el.remove();
        try {
          var list = JSON.parse(localStorage.getItem('sidjil-ann-dismissed') || '[]');
          if (list.indexOf(id) === -1) list.push(id);
          localStorage.setItem('sidjil-ann-dismissed', JSON.stringify(list));
        } catch (e) { /* خاص */ }
      });
    });
  } catch (e) { /* خاص */ }

  /* ---------- تبويبات نسخ الصور ---------- */
  var versionDataEl = document.getElementById('versionData');
  var galleryImg = document.getElementById('galleryImg');
  var galleryNote = document.getElementById('galleryNote');
  var versions = [];
  if (versionDataEl) {
    try { versions = JSON.parse(versionDataEl.textContent); } catch (e) { versions = []; }
  }
  var compareAfter = document.getElementById('compareAfter');
  var compareAfterLabel = document.getElementById('compareAfterLabel');
  var compareNote = document.getElementById('compareNote');

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.ver-tab'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      var id = tab.dataset.vid;
      var v = versions.filter(function (x) { return String(x.id) === String(id); })[0];
      if (galleryImg && id) galleryImg.src = '/file/' + id;
      if (galleryNote && v) galleryNote.textContent = v.note || '';
      // إن كانت النسخة مشتقة: حدّث طرف «بعد» في المقارنة
      if (v && v.type && v.type !== 'original' && compareAfter) {
        compareAfter.src = '/file/' + v.id;
        if (compareAfterLabel) compareAfterLabel.textContent = v.label || v.type;
        if (compareNote) compareNote.textContent = v.note || '';
      }
    });
  });

  /* ---------- مقارنة قبل/بعد: منزلق + clip-path ---------- */
  var cmp = document.getElementById('compare');
  var before = document.getElementById('compareBefore');
  var range = document.getElementById('compareRange');
  if (cmp && before && range) {
    // الحاوية مضبوطة dir="ltr" في HTML لتبسيط الحساب
    var handle = document.createElement('div');
    handle.className = 'compare-handle';
    handle.setAttribute('aria-hidden', 'true');
    cmp.appendChild(handle);

    function paint() {
      var p = Math.max(0, Math.min(100, Number(range.value) || 50));
      before.style.clipPath = 'inset(0 ' + (100 - p) + '% 0 0)';
      before.style.webkitClipPath = 'inset(0 ' + (100 - p) + '% 0 0)';
      handle.style.left = p + '%';
    }
    range.addEventListener('input', paint);
    range.addEventListener('change', paint);
    paint();
    // لوحات المفاتيح: الأسهم تعمل افتراضيًا على input[type=range]
  }

  /* ---------- مبدّل اللغة: تخزين التفضيل في كوكي أيضًا (احتياط) ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.lang-switch'), function (a) {
    a.addEventListener('click', function () {
      try {
        var m = a.getAttribute('href').match(/[?&]lang=(ar|fr)/);
        if (m) document.cookie = 'archifouna_lang=' + m[1] + '; Path=/; SameSite=Lax; Max-Age=31536000';
      } catch (e) {}
    });
  });
})();
