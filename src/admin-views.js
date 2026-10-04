// ============================================================
// SIDJIL — لوحة الإدارة: كل صفحات الإدارة (HTML)
// عربية فقط، RTL. لا منطق توجيه هنا: الموجّه في index.js يفحص
// الجلسة ثم يستدعي renderAdmin(pathname, req, env, user).
// كل الكتابة تتم عبر /api/v1/admin/* (تُنفَّذ من public/admin.js).
// ملاحظة أمنية: نعيد فحص الجلسة هنا دفاعيًا (عدا /admin/login).
// ============================================================

// ---------- ثوابت العرض ----------
const TYPE_LABELS = {
  document: 'وثيقة',
  book: 'كتاب',
  manuscript: 'مخطوط',
  image: 'صورة',
  map: 'خريطة',
  press: 'صحافة',
  correspondence: 'مراسلات',
  excerpt: 'نص / مقتطف',
  journal: 'عدد مجلة',
  article: 'مقال',
};
const STATUS_LABELS = { draft: 'مسودة', in_review: 'قيد المراجعة', published: 'منشورة', hidden: 'مخفية' };
const STATUS_CLASS = { draft: 'b-draft', in_review: 'b-review', published: 'b-pub', hidden: 'b-hidden' };
const TRSC_LABELS = { none: 'لا يوجد', auto: 'استخراج آلي', corrected: 'مصحح يدويًا' };
const TRL_LABELS = {
  none: 'غير مترجمة', machine: 'ترجمة آلية',
  in_review: 'قيد المراجعة', reviewed: 'مراجعة بشريًا', approved: 'معتمدة',
};
const CONF_LABELS = {
  confirmed: 'مؤكد', approximate: 'تقريبي', probable: 'مرجّح / محتمل', unknown: 'غير معروف',
};
const VERSION_LABELS = {
  original: 'أصلية', restored: 'ترميم', enhanced: 'تحسين',
  colorized: 'تلوين', annotated: 'مشروحة', cropped: 'قصّ',
};
// بيانات المعالجة الافتراضية الظاهرة للزائر (§14 من التصور)
export const DEFAULT_PROCESS_NOTES = {
  restored: 'النسخة المرممة مشتقة من الصورة الأصلية. أُزيلت منها آثار التلف والخدوش وحُسّنت درجة الوضوح دون تغيير العناصر الأساسية للمشهد.',
  enhanced: 'نسخة محسّنة من الصورة الأصلية من حيث الدقة والوضوح دون تغيير محتوى المشهد.',
  colorized: 'التلوين تقديري ولا يمثل دليلًا قطعيًا على الألوان التاريخية الأصلية.',
  annotated: 'نسخة مشروحة أُضيفت إليها علامات وتحديدات توضيحية دون المساس بالصورة الأصلية.',
  cropped: 'نسخة مقتطعة من الصورة الأصلية لغرض العرض فقط.',
};

const NAV = [
  ['dashboard', '/admin', 'لوحة التحكم'],
  ['materials', '/admin/materials', 'المواد'],
  ['review', '/admin/review', 'طابور المراجعة'],
  ['people', '/admin/people', 'الشخصيات'],
  ['places', '/admin/places', 'الأماكن'],
  ['sources', '/admin/sources', 'المصادر'],
  ['tags', '/admin/tags', 'الكلمات المفتاحية'],
  ['collections', '/admin/collections', 'المجموعات'],
  ['journal', '/admin/journal', 'المجلة'],
  ['announcements', '/admin/announcements', 'الإعلانات'],
  ['glossary', '/admin/glossary', 'قاموس الترجمة'],
  ['translation', '/admin/translation', 'الترجمة'],
  ['verification', '/admin/verification', 'التوثيق'],
  ['users', '/admin/users', 'المستخدمون'],
  ['discussions', '/admin/discussions', 'النقاشات'],
  ['backup', '/admin/backup', 'النسخ الاحتياطي'],
  ['audit', '/admin/audit', 'سجل العمليات'],
];

// ---------- أدوات ----------
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const VERIFICATION_LABELS = { research: 'توثيق بحثي', administrative: 'توثيق إداري', participation: 'توثيق مشاركة' };
function verificationBadge(type) {
  const label = VERIFICATION_LABELS[type];
  if (!label) return '';
  return `<span class="verification-mark verification-mark--${esc(type)}" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="3" r="4.4"/><circle cx="18.4" cy="5.6" r="4.4"/><circle cx="21" cy="12" r="4.4"/><circle cx="18.4" cy="18.4" r="4.4"/><circle cx="12" cy="21" r="4.4"/><circle cx="5.6" cy="18.4" r="4.4"/><circle cx="3" cy="12" r="4.4"/><circle cx="5.6" cy="5.6" r="4.4"/><circle cx="12" cy="12" r="7.2"/><path d="m7.4 12.1 3.1 3.1 6.4-7"/></svg></span>`;
}
function fmtDate(s) {
  if (!s) return '—';
  return esc(String(s).slice(0, 16).replace('T', ' '));
}
function htmlRes(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
function redirect(to) {
  return new Response(null, { status: 302, headers: { Location: to } });
}

// ---------- الهيكل العام ----------
const THEME_INIT = `<script>try{var __st=localStorage.getItem('sidjil-theme');if(__st!=='dark'&&__st!=='light'){__st=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',__st);}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>`;

const THEME_TOGGLE_ADMIN = `<button class="theme-toggle" id="themeToggle" type="button" aria-label="تبديل المظهر الليلي/النهاري" title="تبديل المظهر الليلي/النهاري">
  <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
  <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
</button>`;

function layout({ title, active, user, body, head = '' }) {
  const nav = NAV.map(([key, href, label]) =>
    `<a href="${href}" class="nav-item${active === key ? ' active' : ''}">${esc(label)}</a>`
  ).join('');
  // رمز CSRF للطلبات المعدِّلة (يُقرأ من admin.js عبر الميتا)
  const csrfMeta = user && user.csrfToken
    ? `<meta name="csrf-token" content="${esc(user.csrfToken)}">` : '';
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
${THEME_INIT}
<meta name="viewport" content="width=device-width, initial-scale=1">
${csrfMeta}
<title>${esc(title)} — سِجِل | لوحة الإدارة</title>
<link rel="stylesheet" href="/admin.css?v=20261004-journal-pdf-v2">
${head}
</head>
<body>
  <div class="admin-shell">
  <div class="topbar">
    <button class="nav-toggle-admin" id="sideToggle" type="button" aria-expanded="false" aria-controls="adminNav" aria-label="القائمة">
      <span></span><span></span><span></span>
    </button>
    <span class="topbar-brand">سِجِل — لوحة الإدارة</span>
  </div>
  <aside class="sidebar" id="adminNav">
    <div class="brand">
      <div class="brand-name">سِجِل</div>
      <div class="brand-sub">لوحة الإدارة</div>
    </div>
    <nav class="nav">${nav}</nav>
    <div class="side-foot">
      <div class="who">المستخدم: <strong>${esc(user?.username || '')}</strong></div>
      <div class="foot-row">
        <button class="btn btn-ghost btn-sm" id="btnLogout" type="button">تسجيل الخروج</button>
        ${THEME_TOGGLE_ADMIN}
      </div>
    </div>
  </aside>
  <main class="main">
    <div class="toast-zone" id="toastZone" aria-live="polite"></div>
    ${body}
  </main>
</div>
<script src="/admin.js?v=20261004-material-edit-requests" defer></script>
</body>
</html>`;
}

function pageHead(title, extra = '') {
  return `<div class="page-head">
  <h1>${esc(title)}</h1>
  <div class="page-actions">${extra}</div>
</div>`;
}

function badge(text, cls) {
  return `<span class="badge ${cls}">${esc(text)}</span>`;
}

// ---------- 1) تسجيل الدخول ----------
function loginPage() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
${THEME_INIT}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تسجيل الدخول — سِجِل | لوحة الإدارة</title>
<link rel="stylesheet" href="/admin.css?v=20261004-journal-pdf-v2">
</head>
<body class="login-body">
<div class="toast-zone" id="toastZone" aria-live="polite"></div>
<div class="login-card">
  <div class="brand-name big">سِجِل</div>
  <div class="brand-sub">لوحة إدارة الأرشيف — دخول المخوّلين فقط</div>
  <form id="loginForm" method="post" action="/api/v1/admin/login" autocomplete="off">
    <div class="field">
      <label for="username">اسم المستخدم</label>
      <input id="username" name="username" type="text" required autofocus>
    </div>
    <div class="field">
      <label for="password">كلمة المرور</label>
      <input id="password" name="password" type="password" required>
    </div>
    <button class="btn btn-primary btn-block" type="submit">دخول</button>
  </form>
  <p class="muted small">الجلسة صالحة لمدة 12 ساعة، وكل عملية إدارية تُسجَّل مع عنوان IP.</p>
</div>
<script src="/admin.js?v=20261004-material-edit-requests" defer></script>
</body>
</html>`;
}

// ---------- 2) لوحة التحكم ----------
async function dashboardPage(env, user) {
  const db = env.DB;
  const [[mCount], [imgCount], [draftCount], [reviewCount], [trlPending]] = (await Promise.all([
    db.prepare("SELECT COUNT(*) c FROM materials").first(),
    db.prepare("SELECT COUNT(*) c FROM materials WHERE type='image'").first(),
    db.prepare("SELECT COUNT(*) c FROM materials WHERE publish_status='draft'").first(),
    db.prepare("SELECT COUNT(*) c FROM materials WHERE publish_status='in_review'").first(),
    db.prepare("SELECT COUNT(*) c FROM translations WHERE status IN ('machine','in_review')").first(),
  ])).map(r => [r || {}]);
  const latest = await db.prepare(
    `SELECT id, ark, type, title_ar, publish_status, created_at
     FROM materials ORDER BY created_at DESC LIMIT 6`).all();
  const audits = await db.prepare(
    `SELECT a.id, a.action, a.target, a.created_at, u.username
     FROM audit_log a LEFT JOIN admin_users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 8`).all();

  const cards = [
    ['إجمالي المواد', mCount?.c ?? 0, 'k-total'],
    ['الصور', imgCount?.c ?? 0, 'k-img'],
    ['مسودات بانتظار النشر', draftCount?.c ?? 0, 'k-draft'],
    ['قيد المراجعة', reviewCount?.c ?? 0, 'k-review'],
    ['ترجمات معلقة (آلية/قيد المراجعة)', trlPending?.c ?? 0, 'k-trl'],
  ].map(([t, n, k]) => `<div class="stat-card ${k}"><div class="stat-num">${n}</div><div class="stat-label">${t}</div></div>`).join('');

  const matRows = (latest.results || []).map(m => `
    <tr>
      <td class="mono">${esc(m.ark)}</td>
      <td><a href="/admin/materials/${m.id}">${esc(m.title_ar)}</a></td>
      <td>${esc(TYPE_LABELS[m.type] || m.type)}</td>
      <td>${badge(STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</td>
      <td class="muted">${fmtDate(m.created_at)}</td>
    </tr>`).join('');

  const auditRows = (audits.results || []).map(a => `
    <tr>
      <td class="muted">${fmtDate(a.created_at)}</td>
      <td>${esc(a.username || '—')}</td>
      <td class="mono">${esc(a.action || '')}</td>
      <td class="mono small">${esc(a.target || '—')}</td>
    </tr>`).join('');

  const body = `
  ${pageHead('لوحة التحكم', `<a class="btn btn-primary" href="/admin/materials/new">+ مادة جديدة</a>`)}
  <div class="stats">${cards}</div>
  <div class="grid-2">
    <section class="card">
      <h2>أحدث المواد</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>الرقم</th><th>العنوان</th><th>النوع</th><th>الحالة</th><th>أُضيفت</th></tr></thead>
        <tbody>${matRows || '<tr><td colspan="5" class="muted">لا مواد بعد.</td></tr>'}</tbody>
      </table></div>
      <p class="card-foot"><a href="/admin/materials">عرض كل المواد ←</a></p>
    </section>
    <section class="card">
      <h2>آخر العمليات</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الهدف</th></tr></thead>
        <tbody>${auditRows || '<tr><td colspan="4" class="muted">لا عمليات مسجلة بعد.</td></tr>'}</tbody>
      </table></div>
      <p class="card-foot"><a href="/admin/audit">عرض سجل العمليات ←</a></p>
    </section>
  </div>`;
  return layout({ title: 'لوحة التحكم', active: 'dashboard', user, body });
}

// ---------- الترجمة: مؤشرات الكاش والـJobs ----------
async function translationPage(env, user) {
  const db = env.DB;
  const [today, hits, misses, active, failed, pages, settings, pdfMaterials, recentJobs] = await Promise.all([
    db.prepare("SELECT COUNT(*) c FROM translation_usage WHERE created_at >= date('now')").first(),
    db.prepare("SELECT COUNT(*) c FROM translation_usage WHERE event = 'cache_hit'").first(),
    db.prepare("SELECT COUNT(*) c FROM translation_usage WHERE event = 'cache_miss'").first(),
    db.prepare("SELECT COUNT(*) c FROM translation_jobs WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED')").first(),
    db.prepare("SELECT COUNT(*) c FROM translation_jobs WHERE status = 'FAILED'").first(),
    db.prepare('SELECT COALESCE(SUM(processed_pages),0) c FROM translation_jobs').first(),
    db.prepare('SELECT * FROM translation_settings WHERE id = 1').first(),
    db.prepare(`SELECT DISTINCT m.id, m.ark, m.title_ar, m.title_orig, m.type, m.publish_status
      FROM materials m JOIN files f ON f.material_id = m.id
      WHERE (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf') AND f.kind <> 'thumbnail'
      ORDER BY m.updated_at DESC, m.id DESC LIMIT 300`).all(),
    db.prepare(`SELECT j.id, j.material_id, j.source_language, j.target_language, j.output_mode,
      j.ocr_mode, j.status, j.progress, j.current_stage, j.page_count, j.processed_pages,
      j.error_message, j.created_at, j.updated_at, j.completed_at, j.output_size,
      m.ark, m.title_ar, m.title_orig
      FROM translation_jobs j LEFT JOIN materials m ON m.id = j.material_id
      ORDER BY j.created_at DESC LIMIT 100`).all(),
  ]);
  let engine = null;
  if (env.TRANSLATION_SERVICE_URL && env.TRANSLATION_SERVICE_TOKEN) {
    try {
      const response = await fetch(`${String(env.TRANSLATION_SERVICE_URL).replace(/\/$/, '')}/engine`, { headers: { 'X-Sidjil-Service-Token': env.TRANSLATION_SERVICE_TOKEN } });
      if (response.ok) engine = await response.json();
    } catch (_) {}
  }
  const total = Number(hits?.c || 0) + Number(misses?.c || 0);
  const hitRate = total ? Math.round(Number(hits?.c || 0) / total * 100) : 0;
  const cards = [['طلبات اليوم', today?.c || 0], ['Cache Hit Rate', `${hitRate}%`], ['Jobs الجارية', active?.c || 0], ['Jobs الفاشلة', failed?.c || 0], ['الصفحات المعالجة', pages?.c || 0]].map(([label, value]) => `<div class="stat-card"><div class="stat-num">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`).join('');
  const engineStatus = engine?.ollama?.available && engine?.ollama?.modelAvailable ? 'متصل' : 'غير متصل أو النموذج غير متاح';
  const materialOptions = (pdfMaterials.results || []).map((m) => `<option value="${esc(m.id)}">${esc(m.title_ar || m.title_orig || m.ark)} · ${esc(m.ark)}</option>`).join('');
  const langOptions = '<option value="auto">اكتشاف تلقائي</option><option value="ar">العربية</option><option value="fr">الفرنسية</option><option value="en">الإنجليزية</option>';
  const targetOptions = '<option value="ar" selected>العربية</option><option value="fr">الفرنسية</option><option value="en">الإنجليزية</option>';
  const jobRows = (recentJobs.results || []).map((j) => {
    const title = j.title_ar || j.title_orig || j.ark || j.material_id || '—';
    const state = { QUEUED: 'في الانتظار', ANALYZING: 'تحليل', EXTRACTING: 'استخراج', OCR_PROCESSING: 'OCR', TRANSLATING: 'ترجمة', REBUILDING: 'إعادة بناء', UPLOADING: 'رفع', COMPLETED: 'مكتملة', FAILED: 'فاشلة', CANCELLED: 'ملغاة' }[j.status] || j.status;
    const percent = Math.max(0, Math.min(100, Number(j.progress || 0)));
    return `<tr data-translation-job-row="${esc(j.id)}"><td class="check-cell"><input type="checkbox" data-translation-job-check value="${esc(j.id)}" aria-label="تحديد وظيفة ${esc(j.id)}"></td><td><strong>${esc(title)}</strong><br><span class="mono small">${esc(j.ark || '')}</span></td><td dir="ltr">${esc(j.source_language)} → ${esc(j.target_language)}</td><td>${esc(j.output_mode)}</td><td><span class="translation-job-status status-${esc(String(j.status).toLowerCase())}">${esc(state)}</span><div class="admin-translation-progress"><i style="width:${percent}%"></i></div><span class="muted tiny">${percent}% · ${esc(j.current_stage || '')}</span></td><td class="muted small">${fmtDate(j.updated_at || j.created_at)}</td><td><button class="btn btn-sm btn-danger" type="button" data-translation-job-delete="${esc(j.id)}">حذف</button></td></tr>`;
  }).join('');
  const body = `${pageHead('الترجمة', '<a class="btn btn-ghost" href="/admin">← لوحة التحكم</a>')}<div class="stats">${cards}</div>
  <section class="card"><h2>محرك الترجمة المحلي</h2><dl class="meta-grid"><div><dt>المحرك</dt><dd>Ollama</dd></div><div><dt>النموذج</dt><dd>${esc(engine?.model || 'qwen3:8b')}</dd></div><div><dt>حالة Ollama</dt><dd>${esc(engineStatus)}</dd></div><div><dt>الطابور</dt><dd>${esc(engine?.queueLength ?? '—')} · النشط ${esc(engine?.activeAiJobs ?? '—')} / الحد ${esc(engine?.maxAiJobs ?? 1)}</dd></div><div><dt>الترجمات المكتملة</dt><dd>${esc(engine?.completedJobs ?? '—')}</dd></div><div><dt>المتوسط</dt><dd>${engine?.averageTranslationTimeSeconds != null ? `${esc(engine.averageTranslationTimeSeconds)} ثانية` : '—'}</dd></div><div><dt>ترجمة النصوص</dt><dd>${settings?.text_enabled ? 'مفعّلة' : 'معطلة'}</dd></div><div><dt>ترجمة المستندات</dt><dd>${settings?.document_enabled && env.TRANSLATION_SERVICE_URL ? 'مفعّلة' : 'بانتظار خدمة PDF'}</dd></div><div><dt>OCR</dt><dd>${settings?.ocr_enabled && env.TRANSLATION_SERVICE_URL ? 'مفعّل' : 'بانتظار خدمة المعالجة'}</dd></div><div><dt>سياسة الكاش</dt><dd>${esc(settings?.cache_retention_policy || 'PERSISTENT')}</dd></div></dl><p class="muted">تُترجم الكتب في الخلفية كاملة مع حفظ التقدم، ويستطيع الباحث متابعة النسبة وتنزيل الملف عند اكتماله. لا يُعرض Ollama للعامة.</p></section>
  <section class="card translation-management" data-translation-manage><div class="section-head"><div><h2>ترجمة ملفات جديدة</h2><p class="muted">اختر ملفًا أو عدة كتب، ولغة هدف واحدة أو عدة لغات، وابدأ وظائف مستقلة. يمكن اختيار لغة المصدر تلقائيًا أو تحديدها.</p></div></div><div class="translation-admin-grid"><label class="field"><span>الملفات (PDF)</span><select id="translationBatchMaterials" multiple size="7">${materialOptions || '<option disabled>لا توجد ملفات PDF</option>'}</select></label><div class="translation-admin-options"><label class="field"><span>لغة المصدر</span><select id="translationBatchSource">${langOptions}</select></label><label class="field"><span>لغات الهدف (متعدد)</span><select id="translationBatchTargets" multiple size="3">${targetOptions}</select></label><label class="field"><span>صيغة الإخراج</span><select id="translationBatchMode"><option value="translated">PDF مترجم</option><option value="bilingual">PDF ثنائي اللغة</option><option value="text">نص مترجم</option></select></label><label class="field"><span>OCR</span><select id="translationBatchOcr"><option value="auto">تلقائي</option><option value="advanced">متقدم</option><option value="off">معطل</option></select></label><button class="btn btn-primary" type="button" data-translation-batch-start>بدء الترجمة المحددة</button></div></div><p class="muted tiny">تُرسل الوظائف بالتتابع من الواجهة مع بقاء كل نتيجة قابلة للمراجعة والحذف من هذا القسم.</p></section>
  <section class="card translation-management"><div class="section-head"><div><h2>وظائف الترجمة</h2><p class="muted">الحالة والتقدم والملفات المولدة في مكان واحد.</p></div><div class="translation-cleanup"><label>حذف المكتمل الأقدم من <input id="translationCleanupDays" type="number" min="1" max="3650" value="30"> يومًا</label><button class="btn btn-sm btn-danger" type="button" data-translation-cleanup>تنظيف الوظائف القديمة</button></div></div><section class="card" data-glossary-manage><div class="section-head"><div><h2>مسرد المصطلحات</h2><p class="muted">تثبيت ترجمة الأسماء والمصطلحات (أسماء تشاد، الأماكن، الشخصيات) قبل الترجمة الآلية — تُطبق تلقائيًا على ترجمة النصوص.</p></div></div>
  <form class="translation-admin-options" data-glossary-form style="margin-bottom:1rem">
    <label class="field"><span>من لغة</span><select name="source_lang"><option value="fr">الفرنسية</option><option value="ar">العربية</option><option value="en">الإنجليزية</option></select></label>
    <label class="field"><span>إلى لغة</span><select name="target_lang"><option value="ar">العربية</option><option value="fr">الفرنسية</option><option value="en">الإنجليزية</option></select></label>
    <label class="field"><span>المصطلح الأصلي</span><input name="source_term" required maxlength="200" placeholder="مثال: Ouaddaï"></label>
    <label class="field"><span>الترجمة المعتمدة</span><input name="target_term" required maxlength="200" placeholder="مثال: وداي"></label>
    <label class="field"><span>ملاحظة (اختياري)</span><input name="notes" maxlength="500"></label>
    <button class="btn btn-primary" type="submit">إضافة للمسرد</button>
  </form>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>المسار</th><th>المصطلح</th><th>الترجمة</th><th>ملاحظة</th><th>إجراء</th></tr></thead><tbody data-glossary-rows><tr><td colspan="5" class="muted">جارٍ التحميل…</td></tr></tbody></table></div>
</section>
<div class="table-wrap"><table class="tbl translation-jobs-table"><thead><tr><th><input type="checkbox" data-translation-select-all aria-label="تحديد الكل"></th><th>المادة</th><th>المسار</th><th>الصيغة</th><th>الحالة والتقدم</th><th>آخر تحديث</th><th>إجراء</th></tr></thead><tbody>${jobRows || '<tr><td colspan="7" class="muted">لا توجد وظائف ترجمة بعد.</td></tr>'}</tbody></table></div></section>`;
  return layout({ title: 'الترجمة', active: 'translation', user, body });
}

// ---------- 3) قائمة المواد ----------
async function materialsListPage(env, user, req) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || '';
  const type = url.searchParams.get('type') || '';
  const q = (url.searchParams.get('q') || '').trim();

  const where = [];
  const args = [];
  if (status) { where.push('publish_status = ?'); args.push(status); }
  if (type) { where.push('type = ?'); args.push(type); }
  if (q) { where.push('(title_ar LIKE ? OR title_orig LIKE ? OR ark LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `SELECT id, ark, type, title_ar, publish_status, year, created_at
    FROM materials ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT 200`;
  const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];

  const opt = (val, cur, label) => `<option value="${val}"${val === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const typeOpts = Object.entries(TYPE_LABELS).map(([v, l]) => opt(v, type, l)).join('');
  const statusOpts = Object.entries(STATUS_LABELS).map(([v, l]) => opt(v, status, l)).join('');

  const bodyRows = rows.map(m => `
    <tr>
      <td class="mono small">${esc(m.ark)}</td>
      <td><a href="/admin/materials/${m.id}">${esc(m.title_ar)}</a></td>
      <td>${esc(TYPE_LABELS[m.type] || m.type)}</td>
      <td>${m.year ?? '—'}</td>
      <td>${badge(STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</td>
      <td class="muted">${fmtDate(m.created_at)}</td>
      <td class="row-actions">
        <a class="btn btn-sm" href="/admin/materials/${m.id}">تعديل</a>
        <button class="btn btn-sm btn-danger" data-del-material="${m.id}" data-ark="${esc(m.ark)}" type="button">حذف</button>
      </td>
    </tr>`).join('');

  const body = `
  ${pageHead('المواد', `<a class="btn btn-primary" href="/admin/materials/new">+ مادة جديدة</a>`)}
  <form class="filters card" method="get" action="/admin/materials">
    <div class="filter-row">
      <input type="search" name="q" value="${esc(q)}" placeholder="بحث بالعنوان أو الرقم الأرشيفي…">
      <select name="type"><option value="">كل الأنواع</option>${typeOpts}</select>
      <select name="status"><option value="">كل الحالات</option>${statusOpts}</select>
      <button class="btn" type="submit">تصفية</button>
      <a class="btn btn-ghost" href="/admin/materials">مسح</a>
    </div>
  </form>
  <div class="card">
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>الرقم</th><th>العنوان</th><th>النوع</th><th>السنة</th><th>الحالة</th><th>أُضيفت</th><th>إجراءات</th></tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="7" class="muted">لا نتائج مطابقة.</td></tr>'}</tbody>
    </table></div>
  </div>`;
  return layout({ title: 'المواد', active: 'materials', user, body });
}

// ---------- 4) نموذج المادة (إنشاء / تعديل) ----------
// بيانات مرجعية للمنتقيات
async function lookupLists(env) {
  const db = env.DB;
  const [people, places, sources, tags, sections, collections] = await Promise.all([
    db.prepare('SELECT id, name_ar, name_orig FROM people ORDER BY name_ar').all(),
    db.prepare('SELECT id, name_ar, name_orig, region FROM places ORDER BY name_ar').all(),
    db.prepare('SELECT id, name, name_ar FROM sources ORDER BY name').all(),
    db.prepare('SELECT id, name_ar FROM tags ORDER BY name_ar').all(),
    db.prepare("SELECT id, title_ar FROM collections WHERE kind = 'section' ORDER BY sort_order, id").all(),
    db.prepare("SELECT id, title_ar FROM collections WHERE kind = 'collection' ORDER BY sort_order, title_ar").all(),
  ]);
  return {
    people: people.results || [], places: places.results || [],
    sources: sources.results || [], tags: tags.results || [],
    sections: sections.results || [], collections: collections.results || [],
  };
}

function selOpts(rows, selected, valFn = r => r.id, labelFn = r => r.name_ar) {
  const sel = new Set((selected || []).map(String));
  return rows.map(r => {
    const v = valFn(r);
    return `<option value="${esc(v)}"${sel.has(String(v)) ? ' selected' : ''}>${esc(labelFn(r))}${r.name_orig ? ' — ' + esc(r.name_orig) : ''}</option>`;
  }).join('');
}

async function materialFormPage(env, user, id) {
  const db = env.DB;
  const isNew = id === 'new';
  let m = null, files = [], versions = [], transcriptions = [], translations = [], relations = [];
  let selPeople = [], selPlaces = [], selTags = [], selCols = [];

  if (!isNew) {
    m = await db.prepare('SELECT * FROM materials WHERE id = ?').bind(id).first();
    if (!m) return htmlRes('غير موجود', 404);
    const [f, v, tr, tl, r] = await Promise.all([
      db.prepare('SELECT * FROM files WHERE material_id = ? ORDER BY created_at').bind(m.id).all(),
      db.prepare(`SELECT iv.*, f.filename, f.r2_key FROM image_versions iv
                  JOIN files f ON f.id = iv.file_id
                  WHERE iv.material_id = ? ORDER BY iv.sort_order, iv.created_at`).bind(m.id).all(),
      db.prepare('SELECT * FROM transcriptions WHERE material_id = ? ORDER BY layer').bind(m.id).all(),
      db.prepare('SELECT * FROM translations WHERE material_id = ? ORDER BY updated_at DESC').bind(m.id).all(),
      db.prepare(`SELECT mr.id, mr.relation, mr.note, mm.ark, mm.title_ar
                  FROM material_relations mr
                  JOIN materials mm ON mm.id = CASE WHEN mr.material_a = ? THEN mr.material_b ELSE mr.material_a END
                  WHERE mr.material_a = ? OR mr.material_b = ?`).bind(m.id, m.id, m.id).all(),
    ]);
    files = f.results || []; versions = v.results || [];
    transcriptions = tr.results || []; translations = tl.results || []; relations = r.results || [];
    const [p, pl, tg, cl] = await Promise.all([
      db.prepare('SELECT person_id FROM material_people WHERE material_id = ?').bind(m.id).all(),
      db.prepare('SELECT place_id FROM material_places WHERE material_id = ?').bind(m.id).all(),
      db.prepare('SELECT tag_id FROM material_tags WHERE material_id = ?').bind(m.id).all(),
      db.prepare('SELECT collection_id FROM material_collections WHERE material_id = ?').bind(m.id).all(),
    ]);
    selPeople = (p.results || []).map(r => r.person_id);
    selPlaces = (pl.results || []).map(r => r.place_id);
    selTags = (tg.results || []).map(r => r.tag_id);
    selCols = (cl.results || []).map(r => r.collection_id);
  }

  const L = await lookupLists(env);
  const val = (k) => esc(m?.[k] ?? '');
  const sel = (k, opts) => Object.entries(opts).map(([v, l]) =>
    `<option value="${v}"${String(m?.[k] ?? '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('');

  const confOpts = selOpts(
    Object.entries(CONF_LABELS).map(([id, name_ar]) => ({ id, name_ar })),
    [m?.date_confidence ?? 'unknown']);

  // --- الملفات ---
  const fileRows = files.map(f => `
    <tr>
      <td class="mono small">${esc(f.filename)}</td>
      <td>${esc(f.kind === 'original' ? 'أصلي' : f.kind === 'attachment' ? 'مرفق' : 'مصغرة')}</td>
      <td class="muted">${f.size ? (f.size / 1024).toFixed(1) + ' ك.ب' : '—'}</td>
      <td class="mono small" title="${esc(f.sha256 || '')}">${esc((f.sha256 || '').slice(0, 12))}${f.sha256 ? '…' : '—'}</td>
      <td class="row-actions">
        <a class="btn btn-sm" href="/file/${f.id}" target="_blank" rel="noopener">عرض</a>
        <button class="btn btn-sm btn-danger" data-del-file="${f.id}" type="button">حذف</button>
      </td>
    </tr>`).join('');

  const filesCard = isNew ? `
    <section class="card" id="cardFiles">
      <h2>الملفات</h2>
      <p class="muted">احفظ المادة أولًا، ثم أضف الملفات من صفحة التعديل.</p>
    </section>` : `
    <section class="card" id="cardFiles">
      <h2>الملفات <span class="muted small">(تُحفظ في R2، ولا يُستبدل الأصل أبدًا)</span></h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>اسم الملف</th><th>النوع</th><th>الحجم</th><th>البصمة</th><th>إجراءات</th></tr></thead>
        <tbody id="filesBody">${fileRows || '<tr><td colspan="5" class="muted">لا ملفات مرفوعة بعد.</td></tr>'}</tbody>
      </table></div>
      <form id="uploadForm" class="upload-row" data-material-id="${m.id}">
        <input type="file" name="file" required>
        <select name="kind">
          <option value="original">ملف أصلي</option>
          <option value="attachment">مرفق</option>
        </select>
        <button class="btn btn-primary" type="submit">رفع الملف</button>
        <span class="muted small">الحد الأقصى 100MB — الصيغ: pdf, doc, docx, jpg, jpeg, png, webp, tiff</span>
      </form>
    </section>`;

  // --- مدير نسخ الصور ---
  const versionRows = versions.map(v => `
    <tr>
      <td>${badge(VERSION_LABELS[v.version_type] || v.version_type, v.version_type === 'original' ? 'b-pub' : 'b-draft')}</td>
      <td class="mono small">${esc(v.filename)}</td>
      <td>${esc(v.process_note || '—')}</td>
      <td class="row-actions">
        <a class="btn btn-sm" href="/file/${v.file_id}" target="_blank" rel="noopener">عرض</a>
        <button class="btn btn-sm btn-danger" data-del-version="${v.id}" type="button">حذف</button>
      </td>
    </tr>`).join('');

  const versionsCard = isNew ? '' : `
    <section class="card" id="cardVersions">
      <h2>مدير نسخ الصور <span class="muted small">(الأصل لا يُستبدل — كل نسخة ملف مستقل في R2)</span></h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>النوع</th><th>الملف</th><th>بيان المعالجة</th><th>إجراءات</th></tr></thead>
        <tbody id="versionsBody">${versionRows || '<tr><td colspan="4" class="muted">لا نسخ مسجلة بعد.</td></tr>'}</tbody>
      </table></div>
      <form id="versionForm" class="stack" data-material-id="${m.id}">
        <div class="field">
          <label>الملف</label>
          <select name="fileId" required>
            <option value="">— اختر ملفًا من المرفوعات —</option>
            ${files.map(f => `<option value="${f.id}">${esc(f.filename)}</option>`).join('')}
          </select>
        </div>
        <fieldset class="choice-q">
          <legend>هل هذه الصورة <strong>أصلية</strong> أم <strong>نسخة مشتقة</strong>؟</legend>
          <label><input type="radio" name="kind" value="original" checked> أصلية — تُسجَّل كما وردت من المصدر</label>
          <label><input type="radio" name="kind" value="derived"> مشتقة — خضعت لمعالجة (تتطلب اختيار الأصل)</label>
        </fieldset>
        <div id="derivedFields" class="stack hidden">
          <div class="field-row">
            <div class="field">
              <label>الصورة الأصلية المرتبطة</label>
              <select name="originalVersionId">
                <option value="">— اختر الأصل —</option>
                ${versions.filter(v => v.version_type === 'original').map(v => `<option value="${v.id}">${esc(v.filename)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>نوع المعالجة</label>
              <select name="versionType">
                <option value="restored">ترميم</option>
                <option value="enhanced">تحسين</option>
                <option value="colorized">تلوين</option>
                <option value="annotated">تعليق / شرح</option>
                <option value="cropped">قصّ</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>بيان المعالجة <span class="muted">(يظهر للزائر تحت أداة المقارنة)</span></label>
            <textarea name="processNote" rows="3"></textarea>
          </div>
        </div>
        <div><button class="btn btn-primary" type="submit">تسجيل النسخة</button></div>
      </form>
    </section>`;

  // --- التفريغ والترجمة ---
  const trAuto = transcriptions.find(t => t.layer === 'auto');
  const trManual = transcriptions.find(t => t.layer === 'manual');
  const trl = translations[0] || null;

  const textCard = isNew ? '' : `
    <section class="card" id="cardText">
      <h2>التفريغ النصي <span class="muted small">(طبقتان مستقلتان — لا يستبدل أحدهما الآخر)</span></h2>
      <div class="grid-2">
        <div class="field">
          <label>النص المستخرج آليًا (OCR)</label>
          <textarea id="trAuto" rows="8" dir="auto">${esc(trAuto?.text || '')}</textarea>
        </div>
        <div class="field">
          <label>النص المصحح يدويًا</label>
          <textarea id="trManual" rows="8" dir="auto">${esc(trManual?.text || '')}</textarea>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>حالة التفريغ</label>
          <select id="trscStatus">${sel('transcription_status', TRSC_LABELS)}</select>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <div><button class="btn btn-primary" id="btnSaveTrsc" type="button" data-material-id="${m.id}">حفظ التفريغ</button></div>
        </div>
      </div>
    </section>
    <section class="card" id="cardTrl">
      <h2>الترجمة العربية <span class="muted small">(الترجمة لا تحل محل النص الأصلي)</span></h2>
      <div class="field-row">
        <div class="field">
          <label>لغة المصدر</label>
          <select id="trlSourceLang">
            <option value="fr"${(trl?.source_lang || 'fr') === 'fr' ? ' selected' : ''}>الفرنسية</option>
            <option value="ar"${trl?.source_lang === 'ar' ? ' selected' : ''}>العربية</option>
          </select>
        </div>
        <div class="field">
          <label>حالة الترجمة</label>
          <select id="trlStatus">
            <option value="none">غير مترجمة</option>
            ${Object.entries(TRL_LABELS).filter(([v]) => v !== 'none').map(([v, l]) =>
              `<option value="${v}"${trl?.status === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>المترجم</label>
          <input id="trlTranslator" type="text" value="${esc(trl?.translator || '')}">
        </div>
      </div>
      <div class="field">
        <label>نص الترجمة</label>
        <textarea id="trlText" rows="8" dir="auto">${esc(trl?.text || '')}</textarea>
      </div>
      <div><button class="btn btn-primary" id="btnSaveTrl" type="button" data-material-id="${m.id}">حفظ الترجمة</button></div>
      ${trl ? `<p class="muted small">آخر تحديث: ${fmtDate(trl.updated_at)}</p>` : ''}
    </section>`;

  // --- OCR اليدوي (لا يعمل تلقائيًا عند الرفع) ---
  const ocrCard = isNew ? '' : `
    <section class="card" id="cardOcr">
      <h2>OCR <span class="muted small">(يدوي فقط — الناتج يُحفظ خامًا في طبقة auto ولا يُعرض كمصحح)</span></h2>
      <div class="field-row">
        <div class="field"><label>الملف</label>
          <select id="ocrFile">
            <option value="">— اختر ملفًا —</option>
            ${files.map(f => `<option value="${f.id}">${esc(f.filename)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>لغة النص</label>
          <select id="ocrLang">
            <option value="fra">الفرنسية</option>
            <option value="ara">العربية</option>
          </select>
        </div>
        <div class="field"><label>&nbsp;</label>
          <div><button class="btn btn-primary" id="btnRunOcr" type="button" data-material-id="${m.id}">تشغيل OCR</button></div>
        </div>
      </div>
      <p class="muted small">يُنشأ سجل عملية (processing_jobs) لكل تشغيل. لا ينتقل الناتج إلى النص المصحح إلا بمراجعة بشرية.</p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>التاريخ</th><th>النوع</th><th>الحالة</th><th>المزود</th><th>ملاحظة</th></tr></thead>
        <tbody id="jobsBody" data-material-id="${m.id}"><tr><td colspan="5" class="muted">جارٍ التحميل…</td></tr></tbody>
      </table></div>
    </section>`;

  // --- مقاطع الترجمة: مراجعة متوازية ---
  const segmentsCard = isNew ? '' : `
    <section class="card" id="cardSegments">
      <h2>مقاطع الترجمة <span class="muted small">(مراجعة متوازية: النص الفرنسي | الترجمة العربية)</span></h2>
      <p class="muted small">كل مقطع يُراجع مستقلًا مع حفظ الترتيب وأرقام الصفحات. لا تُعتبر الترجمة «معتمدة» إلا بزر الاعتماد الصريح أدناه — أبدًا تلقائيًا.</p>
      <div id="segStatus" class="muted">جارٍ تحميل المقاطع…</div>
      <div id="segList" class="stack" data-material-id="${m.id}"></div>
      <div class="field-row">
        <div class="field"><label>&nbsp;</label><div><button class="btn" id="btnSplitText" type="button">تقسيم نص فرنسي إلى مقاطع</button></div></div>
        <div class="field"><label>&nbsp;</label><div><button class="btn btn-primary hidden" id="btnApproveTrl" type="button">اعتماد الترجمة (إجراء صريح)</button></div></div>
        <div class="field"><label>&nbsp;</label><div><button class="btn btn-ghost hidden" id="btnDelTrl" type="button">حذف الترجمة والمقاطع</button></div></div>
      </div>
      <div id="splitBox" class="hidden stack">
        <div class="field">
          <label>النص الفرنسي — افصل المقاطع بسطر فارغ (كل فقرة = مقطع)</label>
          <textarea id="splitSource" rows="10" dir="ltr" lang="fr" placeholder="الصق النص الفرنسي هنا…"></textarea>
        </div>
        <div class="field-row">
          <div class="field"><label>رقم الصفحة الأولى (اختياري)</label><input id="splitPage" type="number" min="1" dir="ltr"></div>
          <div class="field"><label>المترجم (اختياري)</label><input id="splitTranslator"></div>
          <div class="field"><label>&nbsp;</label><div><button class="btn btn-primary" id="btnDoSplit" type="button" data-material-id="${m.id}">إنشاء المقاطع</button></div></div>
        </div>
      </div>
    </section>`;

  // --- العلاقات مادة↔مادة ---
  const relRows = relations.map(r => `
    <tr>
      <td class="mono small">${esc(r.ark)}</td>
      <td>${esc(r.title_ar)}</td>
      <td>${esc(r.relation || '—')}</td>
      <td>${esc(r.note || '—')}</td>
    </tr>`).join('');
  const relationsCard = isNew ? '' : `
    <section class="card" id="cardRelations">
      <h2>مواد مرتبطة</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>الرقم</th><th>العنوان</th><th>العلاقة</th><th>ملاحظة</th></tr></thead>
        <tbody>${relRows || '<tr><td colspan="4" class="muted">لا علاقات بعد.</td></tr>'}</tbody>
      </table></div>
      <form id="relationForm" class="field-row" data-material-id="${m.id}">
        <div class="field"><label>الرقم الأرشيفي للمادة المرتبطة</label><input name="relatedArk" placeholder="ARC-TD-DOC-000001" required dir="ltr"></div>
        <div class="field"><label>نوع العلاقة</label><input name="relation" placeholder="ترد على / صورة لنفس المشهد…"></div>
        <div class="field"><label>ملاحظة</label><input name="note"></div>
        <div class="field"><label>&nbsp;</label><div><button class="btn" type="submit">إضافة</button></div></div>
      </form>
    </section>`;

  const title = isNew ? 'مادة جديدة' : `تعديل: ${m.ark}`;
  const actions = isNew ? '' : `
    <div class="publish-bar">
      <button class="btn" data-publish="${m.id}" data-status="draft" type="button">حفظ مسودة</button>
      <button class="btn btn-primary" data-publish="${m.id}" data-status="published" type="button">نشر</button>
      <button class="btn btn-ghost" data-publish="${m.id}" data-status="hidden" type="button">إخفاء</button>
      <button class="btn btn-danger" data-del-material="${m.id}" data-ark="${esc(m.ark)}" type="button">حذف المادة</button>
    </div>`;

  const body = `
  ${pageHead(title, `<a class="btn btn-ghost" href="/admin/materials">← رجوع للقائمة</a>`)}
  ${isNew ? '' : `<p class="ark-line">الرقم الأرشيفي: <span class="mono">${esc(m.ark)}</span> — ثابت ولا يتغير. الحالة: ${badge(STATUS_LABELS[m.publish_status], STATUS_CLASS[m.publish_status])}</p>`}
  <form id="materialForm" class="stack" data-material-id="${isNew ? '' : m.id}">
    <div class="grid-2">
      <section class="card">
        <h2>بيانات التعريف</h2>
        <div class="field"><label>العنوان بالعربية *</label><input name="title_ar" required value="${val('title_ar')}"></div>
        <div class="field"><label>العنوان الأصلي</label><input name="title_orig" dir="auto" value="${val('title_orig')}"></div>
        <div class="field-row">
          <div class="field"><label>نوع المادة *</label><select name="type">${sel('type', TYPE_LABELS)}</select></div>
          <div class="field"><label>اللغة</label><input name="language" dir="ltr" placeholder="fr / ar" value="${val('language')}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>السنة</label><input name="year" type="number" dir="ltr" value="${val('year')}"></div>
          <div class="field"><label>التاريخ (عرض حر)</label><input name="date_text" value="${val('date_text')}" placeholder="6 ديسمبر 1951"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>درجة ثقة التاريخ</label><select name="date_confidence">${confOpts}</select></div>
          <div class="field"><label>المؤلف / الجهة</label><input name="author" dir="auto" value="${val('author')}"></div>
          <div class="field"><label>المصور</label><input name="photographer" dir="auto" value="${val('photographer')}"></div>
        </div>
        <div class="field"><label>الوصف العلمي</label><textarea name="description" rows="4" dir="auto">${val('description')}</textarea></div>
      </section>
      <section class="card">
        <h2>المكان والمصدر</h2>
        <div class="field-row">
          <div class="field"><label>المكان</label>
            <select name="place_id"><option value="">—</option>${selOpts(L.places, m?.place_id ? [m.place_id] : [], r => r.id, r => `${r.name_ar}${r.region ? ' (' + r.region + ')' : ''}`)}</select>
          </div>
          <div class="field"><label>درجة ثقة المكان</label>
            <select name="place_confidence">${Object.entries(CONF_LABELS).map(([v, l]) => `<option value="${v}"${(m?.place_confidence || 'unknown') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field"><label>المصدر *</label>
          <select name="source_id"><option value="">—</option>${selOpts(L.sources, m?.source_id ? [m.source_id] : [], r => r.id, r => r.name_ar || r.name)}</select>
        </div>
        <div class="field-row">
          <div class="field"><label>المرجع الأرشيفي</label><input name="archive_ref" dir="ltr" value="${val('archive_ref')}" placeholder="5D 269"></div>
          <div class="field"><label>رابط المصدر الأصلي</label><input name="source_url" dir="ltr" type="url" value="${val('source_url')}"></div>
        </div>
        <div class="field"><label>حقوق الاستخدام</label><input name="rights" dir="auto" value="${val('rights')}"></div>
        <h2 class="mt">العلاقات</h2>
        <div class="field"><label>الشخصيات</label><select name="peopleIds" multiple size="4">${selOpts(L.people, selPeople)}</select></div>
        <div class="field"><label>أماكن إضافية</label><select name="placeIds" multiple size="4">${selOpts(L.places, selPlaces, r => r.id, r => `${r.name_ar}${r.region ? ' (' + r.region + ')' : ''}`)}</select></div>
        <div class="field"><label>الكلمات المفتاحية</label><select name="tagIds" multiple size="4">${selOpts(L.tags, selTags)}</select></div>
        <div class="field"><label>الأقسام</label>
          <div class="checks">${L.sections.map(s => `<label><input type="checkbox" name="sectionIds" value="${s.id}"${selCols.includes(s.id) ? ' checked' : ''}> ${esc(s.title_ar)}</label>`).join('')}</div>
        </div>
        <div class="field"><label>المجموعات الموضوعية</label><select name="collectionIds" multiple size="4">${selOpts(L.collections, selCols, r => r.id, r => r.title_ar)}</select></div>
      </section>
    </div>
    <div class="form-bar">
      <button class="btn btn-primary btn-lg" type="submit">${isNew ? 'إنشاء المادة (مسودة)' : 'حفظ التعديلات'}</button>
      ${actions}
    </div>
  </form>
  ${filesCard}
  ${versionsCard}
  ${ocrCard}
  ${textCard}
  ${segmentsCard}
  ${relationsCard}`;

  return layout({ title, active: 'materials', user, body });
}

// ---------- 5) صفحات الكيانات (CRUD) ----------
const ENTITIES = {
  people: {
    title: 'الشخصيات', singular: 'شخصية',
    cols: [['name_ar', 'الاسم بالعربية'], ['name_orig', 'الاسم الأصلي'], ['identity_confidence', 'هوية'], ['bio', 'نبذة']],
    fields: [
      { name: 'name_ar', label: 'الاسم بالعربية *', req: true },
      { name: 'name_orig', label: 'الاسم الأصلي', dir: 'auto' },
      { name: 'identity_confidence', label: 'درجة ثقة الهوية', type: 'select', options: { confirmed: 'مؤكدة', probable: 'محتملة', unknown: 'غير معروفة' } },
      { name: 'birth_year', label: 'سنة الميلاد', type: 'number', dir: 'ltr' },
      { name: 'death_year', label: 'سنة الوفاة', type: 'number', dir: 'ltr' },
      { name: 'bio', label: 'نبذة / سيرة', type: 'textarea' },
    ],
  },
  places: {
    title: 'الأماكن', singular: 'مكان',
    cols: [['name_ar', 'الاسم بالعربية'], ['name_orig', 'الاسم الأصلي'], ['region', 'المنطقة'], ['place_confidence', 'المكان']],
    fields: [
      { name: 'name_ar', label: 'الاسم بالعربية *', req: true },
      { name: 'name_orig', label: 'الاسم الأصلي', dir: 'auto' },
      { name: 'region', label: 'المنطقة', hint: 'وداي، كانم، باقرمي…' },
      { name: 'kind', label: 'النوع', type: 'select', options: { city: 'مدينة', region: 'منطقة', country: 'بلد', site: 'موقع' } },
      { name: 'place_confidence', label: 'درجة ثقة المكان', type: 'select', options: { confirmed: 'مؤكد', probable: 'مرجّح', unknown: 'غير محدد' } },
      { name: 'lat', label: 'خط العرض', type: 'number', step: 'any', dir: 'ltr' },
      { name: 'lng', label: 'خط الطول', type: 'number', step: 'any', dir: 'ltr' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
  },
  sources: {
    title: 'المصادر', singular: 'مصدر',
    cols: [['name', 'الاسم الأصلي'], ['name_ar', 'الاسم بالعربية'], ['kind', 'النوع']],
    fields: [
      { name: 'name', label: 'الاسم الأصلي *', req: true, dir: 'auto' },
      { name: 'name_ar', label: 'الاسم بالعربية' },
      { name: 'kind', label: 'النوع', type: 'select', options: { archive: 'أرشيف', library: 'مكتبة', museum: 'متحف', private: 'مجموعة خاصة', web: 'مصدر ويب', press: 'صحافة' } },
      { name: 'website', label: 'الموقع', dir: 'ltr', type: 'url' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
  },
  tags: {
    title: 'الكلمات المفتاحية', singular: 'كلمة مفتاحية',
    cols: [['name_ar', 'بالعربية'], ['name_orig', 'بالأصلية']],
    fields: [
      { name: 'name_ar', label: 'الكلمة بالعربية *', req: true },
      { name: 'name_orig', label: 'المقابل الأصلي', dir: 'auto' },
    ],
  },
  collections: {
    title: 'المجموعات الموضوعية', singular: 'مجموعة',
    cols: [['title_ar', 'العنوان'], ['title_fr', 'العنوان الفرنسي'], ['sort_order', 'الترتيب']],
    fields: [
      { name: 'title_ar', label: 'العنوان بالعربية *', req: true },
      { name: 'title_fr', label: 'العنوان بالفرنسية', dir: 'auto' },
      { name: 'description', label: 'الوصف', type: 'textarea' },
      { name: 'description_fr', label: 'الوصف بالفرنسية', type: 'textarea', dir: 'auto' },
      { name: 'sort_order', label: 'الترتيب', type: 'number', dir: 'ltr' },
    ],
  },
  announcements: {
    title: 'الإعلانات', singular: 'إعلان',
    cols: [['title_ar', 'العنوان'], ['active', 'الحالة'], ['sort_order', 'الترتيب'], ['starts_at', 'من'], ['ends_at', 'إلى']],
    fields: [
      { name: 'title_ar', label: 'العنوان بالعربية *', req: true },
      { name: 'title_fr', label: 'العنوان بالفرنسية', dir: 'auto' },
      { name: 'body_ar', label: 'النص بالعربية', type: 'textarea' },
      { name: 'body_fr', label: 'النص بالفرنسية', type: 'textarea' },
      { name: 'link_url', label: 'رابط (اختياري)', type: 'url', dir: 'ltr' },
      { name: 'active', label: 'مفعّل', type: 'checkbox' },
      { name: 'sort_order', label: 'الترتيب', type: 'number', dir: 'ltr' },
      { name: 'starts_at', label: 'يبدأ في (اختياري)', type: 'datetime-local', dir: 'ltr' },
      { name: 'ends_at', label: 'ينتهي في (اختياري)', type: 'datetime-local', dir: 'ltr' },
    ],
  },
  glossary: {
    title: 'قاموس الترجمة المتخصص', singular: 'مصطلح',
    cols: [['term_orig', 'المصطلح الأصلي'], ['term_ar', 'المقابل العربي'], ['domain', 'المجال']],
    fields: [
      { name: 'term_orig', label: 'المصطلح الأصلي *', req: true, dir: 'auto' },
      { name: 'term_ar', label: 'المقابل العربي *', req: true },
      { name: 'domain', label: 'المجال', hint: 'إدارة، جغرافيا، عسكرية…' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
  },
};

function entityField(f, val) {
  const v = esc(val ?? '');
  const req = f.req ? ' required' : '';
  const dir = f.dir ? ` dir="${f.dir}"` : '';
  const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
  let input;
  if (f.type === 'checkbox') {
    const checked = (val === undefined || val === null || val === '' || Number(val) === 1 || val === true || val === 'on') ? ' checked' : '';
    input = `<label class="check-inline"><input name="${f.name}" type="checkbox"${checked}> ${esc(f.label)}</label>`;
    return `<div class="field">${input}${hint}</div>`;
  } else if (f.type === 'datetime-local') {
    let dv = String(val ?? '').replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dv)) dv = dv.slice(0, 16);
    else dv = '';
    input = `<input name="${f.name}" type="datetime-local" value="${dv}"${req}${dir}>`;
  } else if (f.type === 'textarea') {
    input = `<textarea name="${f.name}" rows="3"${req}${dir}>${v}</textarea>`;
  } else if (f.type === 'select') {
    const opts = Object.entries(f.options).map(([ov, ol]) =>
      `<option value="${ov}"${String(val ?? '') === ov ? ' selected' : ''}>${esc(ol)}</option>`).join('');
    input = `<select name="${f.name}"${req}><option value="">—</option>${opts}</select>`;
  } else {
    const type = f.type || 'text';
    const step = f.step ? ` step="${f.step}"` : '';
    input = `<input name="${f.name}" type="${type}" value="${v}"${req}${dir}${step}>`;
  }
  return `<div class="field"><label>${esc(f.label)}${hint}</label>${input}</div>`;
}

async function entityPage(env, user, key) {
  const E = ENTITIES[key];
  if (!E) return htmlRes('غير موجود', 404);
  const rows = (await env.DB.prepare(`SELECT * FROM ${key} ORDER BY id DESC LIMIT 300`).all()).results || [];

  const tableRows = rows.map(r => {
    const cells = E.cols.map(([c]) => {
      let v = r[c];
      if (c === 'identity_confidence') v = { confirmed: 'مؤكدة', probable: 'محتملة', unknown: 'غير معروفة' }[v] || v;
      if (c === 'place_confidence') v = { confirmed: 'مؤكد', probable: 'مرجّح', unknown: 'غير محدد' }[v] || v;
      if (c === 'active') v = (Number(v) === 1) ? 'مفعّل' : 'موقوف';
      if (c === 'kind') v = { archive: 'أرشيف', library: 'مكتبة', museum: 'متحف', private: 'مجموعة خاصة', web: 'مصدر ويب', press: 'صحافة', city: 'مدينة', region: 'منطقة', country: 'بلد', site: 'موقع' }[v] || v;
      return `<td>${esc(v ?? '—')}</td>`;
    }).join('');
    return `<tr>
      <td class="mono small">#${r.id}</td>${cells}
      <td class="row-actions">
        <button class="btn btn-sm" data-ent-edit="${key}" data-id="${r.id}" data-row='${esc(JSON.stringify(r))}' type="button">تعديل</button>
        <button class="btn btn-sm btn-danger" data-ent-del="${key}" data-id="${r.id}" type="button">حذف</button>
      </td>
    </tr>`;
  }).join('');

  const thead = E.cols.map(([, l]) => `<th>${esc(l)}</th>`).join('');
  const fields = E.fields.map(f => entityField(f, '')).join('');

  const body = `
  ${pageHead(E.title, `<span class="muted">${rows.length} عنصرًا</span>`)}
  <div class="grid-2 flip">
    <section class="card">
      <h2>القائمة</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>#</th>${thead}<th>إجراءات</th></tr></thead>
        <tbody>${tableRows || `<tr><td colspan="${E.cols.length + 2}" class="muted">لا عناصر بعد.</td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="card">
      <h2 id="entFormTitle">إضافة ${E.singular} جديد</h2>
      <form id="entForm" class="stack" data-entity="${key}">
        <input type="hidden" name="__id" value="">
        ${fields}
        <div class="form-bar">
          <button class="btn btn-primary" type="submit">حفظ</button>
          <button class="btn btn-ghost hidden" id="entCancel" type="button">إلغاء التعديل</button>
        </div>
      </form>
    </section>
  </div>`;
  return layout({ title: E.title, active: key, user, body });
}

// ---------- 6) النسخ الاحتياطي ----------
async function backupPage(env, user) {
  const db = env.DB;
  const [fCount] = [await db.prepare('SELECT COUNT(*) c, COALESCE(SUM(size),0) s FROM files').first()];
  const manifest = await db.prepare(
    `SELECT f.id, f.filename, f.r2_key, f.size, f.sha256, f.created_at, m.ark, m.type
     FROM files f JOIN materials m ON m.id = f.material_id
     ORDER BY f.created_at DESC LIMIT 100`).all();
  const mRows = (manifest.results || []).map(f => `
    <tr>
      <td class="mono small">${esc(f.ark)}</td>
      <td class="mono small">${esc(f.filename)}</td>
      <td class="mono tiny" dir="ltr">${esc(f.r2_key)}</td>
      <td class="muted">${f.size ? (f.size / 1048576).toFixed(2) + ' م.ب' : '—'}</td>
      <td class="mono tiny" title="${esc(f.sha256 || '')}">${esc((f.sha256 || '').slice(0, 10))}…</td>
    </tr>`).join('');

  const instructions = `— التفريغ الكامل لقاعدة البيانات (D1):
  npm run db:export

  — تنزيل التفريغ JSON من اللوحة:
  زر «تنزيل التفريغ JSON» أدناه (GET /api/v1/admin/export)

  — قائمة ملفات R2 للتحقق:
  wrangler r2 object list sidjil-assets --prefix originals/ --output json > r2-originals.json
  wrangler r2 object list sidjil-assets --prefix derived/  --output json > r2-derived.json

  — نسخ الملفات الأصلية خارج Cloudflare (عبر S3 API):
  rclone sync :s3:sidjil-assets/originals ./backup/originals \\
    --s3-provider Cloudflare --s3-endpoint https://<account>.r2.cloudflarestorage.com

  — قاعدة التحقق: قارن manifest.csv (كل r2_key مع sha256) بما في R2 قبل أي استعادة.`;

  const body = `
  ${pageHead('النسخ الاحتياطي')}
  <div class="grid-2">
    <section class="card">
      <h2>التفريغ</h2>
      <p class="muted">تنزيل تفريغ JSON كامل لقاعدة البيانات (كل الجداول) — يُحفظ مع الملفات الأصلية خارج Cloudflare.</p>
      <div class="form-bar">
        <a class="btn btn-primary btn-lg" href="/api/v1/admin/export" download>⬇ تنزيل التفريغ JSON</a>
      </div>
      <p class="muted small">إجمالي الملفات المخزنة: <strong>${fCount?.c ?? 0}</strong> ملفًا
      (${((fCount?.s ?? 0) / 1048576).toFixed(1)} م.ب تقريبًا).</p>
    </section>
    <section class="card">
      <h2>تعليمات النسخ الاحتياطي الدوري</h2>
      <pre class="code" dir="ltr">${esc(instructions)}</pre>
    </section>
  </div>
  <section class="card">
    <h2>قائمة الملفات (manifest — أحدث 100)</h2>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>المادة</th><th>الملف</th><th>مفتاح R2</th><th>الحجم</th><th>البصمة</th></tr></thead>
      <tbody>${mRows || '<tr><td colspan="5" class="muted">لا ملفات بعد.</td></tr>'}</tbody>
    </table></div>
  </section>`;
  return layout({ title: 'النسخ الاحتياطي', active: 'backup', user, body });
}

// ---------- 7) سجل العمليات ----------
async function auditPage(env, user, req) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const per = 50, off = (page - 1) * per;
  const rows = await env.DB.prepare(
    `SELECT a.id, a.action, a.target, a.detail, a.ip, a.created_at, u.username
     FROM audit_log a LEFT JOIN admin_users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).bind(per, off).all();
  const total = await env.DB.prepare('SELECT COUNT(*) c FROM audit_log').first();

  const bodyRows = ((rows.results) || []).map(a => `
    <tr>
      <td class="mono small">#${a.id}</td>
      <td class="muted">${fmtDate(a.created_at)}</td>
      <td>${esc(a.username || '—')}</td>
      <td class="mono">${esc(a.action || '')}</td>
      <td class="mono small">${esc(a.target || '—')}</td>
      <td class="muted small">${esc(a.detail || '—')}</td>
      <td class="mono small" dir="ltr">${esc(a.ip || '—')}</td>
    </tr>`).join('');

  const pages = Math.max(1, Math.ceil((total?.c ?? 0) / per));
  const pager = pages > 1 ? `<div class="pager">
    ${page > 1 ? `<a class="btn btn-sm" href="/admin/audit?page=${page - 1}">→ السابق</a>` : ''}
    <span class="muted">صفحة ${page} من ${pages}</span>
    ${page < pages ? `<a class="btn btn-sm" href="/admin/audit?page=${page + 1}">التالي ←</a>` : ''}
  </div>` : '';

  const body = `
  ${pageHead('سجل العمليات', `<span class="muted">إجمالي العمليات: ${total?.c ?? 0}</span>`)}
  <div class="card">
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>#</th><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الهدف</th><th>التفاصيل</th><th>IP</th></tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="7" class="muted">لا عمليات مسجلة بعد.</td></tr>'}</tbody>
    </table></div>
    ${pager}
  </div>`;
  return layout({ title: 'سجل العمليات', active: 'audit', user, body });
}

// ---------- 8) طابور المراجعة ----------
async function reviewPage(env, user) {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.updated_at, u.username AS creator
     FROM materials m LEFT JOIN admin_users u ON u.id = m.created_by
     WHERE m.publish_status = 'in_review' ORDER BY m.updated_at ASC`).all();
  const items = rows.results || [];
  const editRequests = await env.DB.prepare(
    `SELECT r.id, r.material_id, r.requested_at, m.ark, m.title_ar, m.title_orig,
            COALESCE(u.display_name, u.username, 'باحث') AS researcher_name
     FROM material_edit_requests r
     JOIN materials m ON m.id = r.material_id
     JOIN admin_users u ON u.id = r.researcher_id
     WHERE r.status = 'pending' AND m.publish_status = 'published'
     ORDER BY r.requested_at ASC, r.id ASC`
  ).all();
  const editRequestRows = (editRequests.results || []).map(r => `
    <tr><td class="mono">${esc(r.ark)}</td><td><a href="/admin/materials/${r.material_id}">${esc(r.title_ar || r.title_orig || '—')}</a></td>
      <td>${esc(r.researcher_name)}</td><td class="muted">${fmtDate(r.requested_at)}</td>
      <td class="row-actions"><button class="btn btn-sm btn-primary" data-material-edit-approve="${r.id}" type="button">السماح بالتعديل</button>
      <button class="btn btn-sm btn-ghost" data-material-edit-reject="${r.id}" type="button">رفض الطلب</button></td></tr>`).join('');
  const bodyRows = items.map(m => `
    <tr>
      <td class="mono">${esc(m.ark)}</td>
      <td><a href="/admin/materials/${m.id}">${esc(m.title_ar || m.title_orig || '—')}</a></td>
      <td>${esc(TYPE_LABELS[m.type] || m.type)}</td>
      <td>${esc(m.creator || '—')}</td>
      <td class="muted">${fmtDate(m.updated_at)}</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-primary" data-review-approve="${m.id}" type="button">اعتماد ونشر</button>
        <button class="btn btn-sm btn-ghost" data-review-reject="${m.id}" data-review-title="${esc(m.title_ar || m.title_orig || '')}" type="button">إعادة بملاحظة</button>
      </td>
    </tr>`).join('');

  const body = `
  ${pageHead('طلبات تعديل المواد المنشورة', `<span class="muted">${(editRequests.results || []).length} طلب</span>`)}
  <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>المادة</th><th>الباحث</th><th>تاريخ الطلب</th><th>القرار</th></tr></thead>
    <tbody>${editRequestRows || '<tr><td colspan="5" class="muted">لا توجد طلبات تعديل معلقة.</td></tr>'}</tbody></table></div></div>
  ${pageHead('طابور المراجعة', `<span class="muted">${items.length} مادة بانتظار القرار</span>`)}
  <div class="card">
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>الرقم</th><th>العنوان</th><th>النوع</th><th>الباحث</th><th>أُرسلت</th><th>القرار</th></tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="6" class="muted">لا مواد قيد المراجعة — الطابور فارغ.</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="modal-veil" id="reviewModal" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="reviewModalH">
      <h3 id="reviewModalH">إعادة المادة إلى الباحث</h3>
      <p class="muted small" id="reviewModalTitle"></p>
      <div class="field">
        <label for="reviewNote">ملاحظة المراجعة (تظهر للباحث — مطلوبة)</label>
        <textarea id="reviewNote" rows="4" placeholder="ما الذي يحتاج إلى تعديل قبل النشر؟"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="reviewRejectConfirm" type="button">تأكيد الإعادة</button>
        <button class="btn btn-ghost" id="reviewModalClose" type="button">إلغاء</button>
      </div>
    </div>
  </div>`;
  return layout({ title: 'طابور المراجعة', active: 'review', user, body });
}

// ---------- إدارة المجلة: مراجعة المقالات ورفع أعداد PDF ----------
async function journalAdminPage(env, user) {
  const [pending, issues] = await Promise.all([
    env.DB.prepare(`SELECT m.id, m.ark, m.title_ar, m.description, m.updated_at,
       COALESCE(u.display_name, u.username, 'باحث') AS researcher_name,
       (SELECT COUNT(*) FROM files f WHERE f.material_id = m.id) AS files_count
       FROM materials m LEFT JOIN admin_users u ON u.id = m.created_by
       WHERE m.type = 'article' AND m.publish_status = 'in_review'
       ORDER BY m.updated_at ASC, m.id ASC LIMIT 100`).all(),
    env.DB.prepare(`SELECT id, issue_number, year, title, description, comment, filename, size
       FROM journal_pdf_issues ORDER BY year DESC, id DESC LIMIT 100`).all(),
  ]);
  const pendingRows = (pending.results || []).map(m => `
    <article class="social-card journal-inbox-card">
      <div class="journal-inbox-meta"><span class="badge b-review">بانتظار المراجعة</span><span class="mono">${esc(m.ark)}</span><span>${esc(m.researcher_name)}</span><time>${fmtDate(m.updated_at)}</time></div>
      <h3>${esc(m.title_ar || 'مقال بلا عنوان')}</h3><p>${esc(String(m.description || '').slice(0, 560))}${String(m.description || '').length > 560 ? '…' : ''}</p>
      <div class="journal-inbox-actions"><a class="btn btn-ghost btn-sm" href="/admin/materials/${m.id}">مراجعة التفاصيل والملفات (${Number(m.files_count || 0)})</a><button class="btn btn-primary btn-sm" type="button" data-review-approve="${m.id}">اعتماد ونشر المقال</button><button class="btn btn-ghost btn-sm" type="button" data-review-reject="${m.id}" data-review-title="${esc(m.title_ar || '')}">إعادة للباحث بملاحظة</button></div>
    </article>`).join('');
  const issueRows = (issues.results || []).map(issue => `
    <article class="journal-issue-admin-card"><div><strong>${esc(issue.title)}</strong><div class="post-meta">العدد ${esc(issue.issue_number)} · ${esc(String(issue.year))} · ${esc(issue.filename)} · ${(Number(issue.size) / (1024 * 1024)).toFixed(1)} MB</div>${issue.description ? `<p>${esc(issue.description)}</p>` : ''}${issue.comment ? `<p class="muted small">تعليق: ${esc(issue.comment)}</p>` : ''}</div><div class="journal-issue-admin-actions"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="/journal/issues/${issue.id}/pdf">معاينة PDF</a></div></article>`).join('');
  const body = `
  ${pageHead('إدارة المجلة', '<span class="muted">مراجعة مقالات الباحثين ورفع أعداد PDF</span>')}
  <nav class="journal-admin-tabs" aria-label="مسارات إدارة المجلة"><a href="#inbox">استقبال ومراجعة المقالات</a><a href="#issues">رفع عدد PDF</a></nav>
  <section class="journal-admin-section" id="inbox"><div class="social-section-head"><div><h2>استقبال مقالات الباحثين</h2><p>راجع النص والمرفقات، ثم اعتمد المقال للنشر أو أعده للباحث مع ملاحظة تحريرية.</p></div><span class="badge b-review">${(pending.results || []).length} قيد المراجعة</span></div>
    <div class="journal-inbox-list">${pendingRows || '<div class="card empty-state">لا توجد مقالات جديدة بانتظار المراجعة.</div>'}</div>
    <div class="modal-veil" id="reviewModal" hidden><div class="modal" role="dialog" aria-modal="true" aria-labelledby="reviewModalH"><h3 id="reviewModalH">إعادة المقال إلى الباحث</h3><p class="muted small" id="reviewModalTitle"></p><div class="field"><label for="reviewNote">ملاحظة التحرير (مطلوبة)</label><textarea id="reviewNote" rows="4" placeholder="اكتب التعديلات المطلوبة قبل النشر"></textarea></div><div class="modal-actions"><button class="btn btn-primary" id="reviewRejectConfirm" type="button">تأكيد الإعادة</button><button class="btn btn-ghost" id="reviewModalClose" type="button">إلغاء</button></div></div></div>
  </section>
  <section class="journal-admin-section" id="issues"><div class="social-section-head"><div><h2>رفع أعداد المجلة</h2><p>ارفع العدد كاملًا بصيغة PDF، وأضف توصيفًا وتعليقًا يظهران للباحثين.</p></div></div>
    <form class="card journal-new-issue" data-journal-pdf-upload><div class="grid-2"><div class="field"><label for="jpi-title">عنوان العدد *</label><input id="jpi-title" name="title" required maxlength="180"></div><div class="field"><label for="jpi-number">رقم العدد *</label><input id="jpi-number" name="issue_number" required maxlength="32"></div><div class="field"><label for="jpi-year">سنة الإصدار *</label><input id="jpi-year" name="year" type="number" min="1800" max="2200" required value="${new Date().getFullYear()}"></div><div class="field"><label for="jpi-file">ملف العدد PDF *</label><input id="jpi-file" name="file" type="file" accept="application/pdf,.pdf" required><small class="muted">حتى 90 ميغابايت</small></div></div>
      <div class="field"><label for="jpi-description">توصيف العدد</label><textarea id="jpi-description" name="description" rows="3" maxlength="4000" placeholder="نبذة موجزة عن محتويات العدد"></textarea></div><div class="field"><label for="jpi-comment">تعليق على العدد</label><textarea id="jpi-comment" name="comment" rows="2" maxlength="2000" placeholder="ملاحظة أو كلمة تقديمية للقراء"></textarea></div><div class="composer-footer"><span class="muted small" data-journal-upload-status></span><button class="btn btn-primary" type="submit">رفع ونشر العدد</button></div>
    </form><div class="journal-issue-admin-list">${issueRows || '<div class="card empty-state">لم يُرفع أي عدد بعد.</div>'}</div>
  </section>`;
  return layout({ title: 'إدارة المجلة', active: 'journal', user, body, head: '<script src="/journal-admin.js?v=20261004-journal-pdf-upload-v1" defer></script>' });
}
// ---------- 9) المستخدمون ----------
async function usersPage(env, user) {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.role, u.is_active, u.is_verified, u.verification_type, u.display_name, u.affiliation, u.created_at,
            (SELECT COUNT(*) FROM materials m WHERE m.created_by = u.id) AS materials_count
     FROM admin_users u ORDER BY u.id ASC`).all();
  const bodyRows = (rows.results || []).map(u => {
    const self = Number(u.id) === Number(user.id);
    const isResearcher = u.role === 'researcher';
    const verifiedBadge = isResearcher
      ? (Number(u.is_verified) ? verificationBadge(u.verification_type) : badge('بانتظار التوثيق', 'b-draft'))
      : '<span class="muted">—</span>';
    const actions = self ? '<span class="muted small">—</span>' : `
        <button class="btn btn-sm" data-user-role="${u.id}" data-role="${u.role === 'admin' ? 'researcher' : 'admin'}" type="button">${u.role === 'admin' ? 'جعله باحثًا' : 'جعله مديرًا'}</button>
        <button class="btn btn-sm ${Number(u.is_active) ? 'btn-ghost' : 'btn-primary'}" data-user-toggle="${u.id}" data-active="${Number(u.is_active) ? 0 : 1}" type="button">${Number(u.is_active) ? 'إيقاف' : 'تفعيل'}</button>
        <button class="btn btn-sm btn-ghost" data-user-pass="${u.id}" data-username="${esc(u.username)}" type="button">كلمة مرور جديدة</button>
        `;
    const nameCell = `<strong>${esc(u.username)}</strong>${u.display_name ? `<br><span class="muted small">${esc(u.display_name)}${u.affiliation ? ' — ' + esc(u.affiliation) : ''}</span>` : ''}${self ? ' <span class="badge b-draft">أنت</span>' : ''}`;
    return `
    <tr>
      <td class="mono">#${u.id}</td>
      <td>${nameCell}</td>
      <td>${u.role === 'admin' ? badge('مدير', 'b-pub') : badge('باحث', 'b-review')}</td>
      <td>${Number(u.is_active) ? badge('نشط', 'b-pub') : badge('موقوف', 'b-hidden')}</td>
      <td>${verifiedBadge}</td>
      <td class="mono">${u.materials_count}</td>
      <td class="muted">${fmtDate(u.created_at)}</td>
      <td class="row-actions">${actions}</td>
    </tr>`;
  }).join('');

  const body = `
  ${pageHead('المستخدمون', '')}
  <div class="grid-2">
    <section class="card">
      <h2>حسابات الدخول</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>التوثيق</th><th>المواد</th><th>أُنشئ</th><th>إجراءات</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table></div>
    </section>
    <section class="card">
      <h2>+ حساب جديد</h2>
      <form id="userForm">
        <div class="field"><label for="nu-username">اسم المستخدم</label><input id="nu-username" name="username" required minlength="3" dir="ltr" placeholder="مثال: researcher_ahmed"></div>
        <div class="field"><label for="nu-password">كلمة المرور (8 أحرف على الأقل)</label><input id="nu-password" name="password" type="password" required minlength="8" dir="ltr"></div>
        <div class="field"><label for="nu-role">الدور</label>
          <select id="nu-role" name="role"><option value="researcher">باحث</option><option value="admin">مدير</option></select>
        </div>
        <button class="btn btn-primary" type="submit">إنشاء الحساب</button>
      </form>
      <p class="muted small">الباحث يرى منشوراته فقط، وينشئ مسودات تُراجَع قبل النشر — ولا يملك النشر المباشر.</p>
    </section>
  </div>`;
  return layout({ title: 'المستخدمون', active: 'users', user, body });
}

async function verificationPage(env, user) {
  const rows = await env.DB.prepare(
    `SELECT id, username, display_name, affiliation, is_active, is_verified, verification_type
     FROM admin_users WHERE role = 'researcher' ORDER BY id ASC`
  ).all();
  const bodyRows = (rows.results || []).map((r) => {
    const name = r.display_name || r.username;
    const current = Number(r.is_verified) ? verificationBadge(r.verification_type) : badge('بانتظار التوثيق', 'b-draft');
    const disabled = Number(r.is_active) ? '' : ' disabled';
    const actions = `<button class="btn btn-sm" data-verification-type="research" data-verify-researcher="${r.id}" type="button"${disabled}>${verificationBadge('research')} بحثية</button>
         <button class="btn btn-sm" data-verification-type="administrative" data-verify-researcher="${r.id}" type="button"${disabled}>${verificationBadge('administrative')} إدارية</button>
         <button class="btn btn-sm" data-verification-type="participation" data-verify-researcher="${r.id}" type="button"${disabled}>${verificationBadge('participation')} مشاركة</button>
         ${Number(r.is_verified) ? `<button class="btn btn-sm btn-ghost" data-verification-type="none" data-verify-researcher="${r.id}" type="button">إلغاء التوثيق</button>` : ''}`;
    return `<tr><td class="mono">#${r.id}</td><td><strong>${esc(name)}</strong><br><span class="muted small">@${esc(r.username)}${r.affiliation ? ` · ${esc(r.affiliation)}` : ''}</span></td><td>${Number(r.is_active) ? badge('نشط', 'b-pub') : badge('موقوف', 'b-hidden')}</td><td>${current}</td><td class="row-actions verification-actions">${actions}</td></tr>`;
  }).join('');
  const body = `${pageHead('توثيق الباحثين', '')}<section class="card"><p class="muted">الأصفر للباحثين، والرمادي للتوثيق الإداري، والأخضر للمشاركة.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>الباحث</th><th>الحساب</th><th>الحالة الحالية</th><th>تعيين التوثيق</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="5" class="muted">لا توجد حسابات باحثين.</td></tr>'}</tbody></table></div></section>`;
  return layout({ title: 'التوثيق', active: 'verification', user, body });
}

// ---------- الإشراف على النقاشات ----------
async function adminDiscussionsPage(env, user) {
  const rows = await env.DB.prepare(
    `SELECT d.id, d.kind, d.title, d.status, d.created_at,
            COALESCE(u.display_name, u.username) AS author_name,
            m.ark AS material_ark,
            (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id) AS replies_count
     FROM discussions d
     LEFT JOIN admin_users u ON u.id = d.author_id
     LEFT JOIN materials m ON m.id = d.material_id
     ORDER BY d.id DESC LIMIT 300`
  ).all();
  const kindL = { comment: 'تعليق', review: 'مراجعة', critique: 'نقد', idea: 'نقد فكرة', text: 'نقد نص' };
  const bodyRows = (rows.results || []).map(d => `
    <tr>
      <td class="mono">#${d.id}</td>
      <td><a href="/discussion/${d.id}" target="_blank">${esc(d.title)}</a>
        ${d.material_ark ? `<br><span class="muted small mono" dir="ltr">${esc(d.material_ark)}</span>` : '<br><span class="muted small">عام</span>'}</td>
      <td>${esc(d.author_name || '')}</td>
      <td>${esc(kindL[d.kind] || d.kind)}</td>
      <td>${d.status === 'published' ? badge('منشور', 'b-pub') : badge('مخفي', 'b-hidden')}</td>
      <td class="mono">${d.replies_count}</td>
      <td class="muted">${fmtDate(d.created_at)}</td>
      <td class="row-actions">
        <button class="btn btn-sm ${d.status === 'published' ? 'btn-ghost' : 'btn-primary'}" data-disc-mod="${d.id}" data-status="${d.status === 'published' ? 'hidden' : 'published'}" type="button">${d.status === 'published' ? 'إخفاء' : 'إظهار'}</button>
        <button class="btn btn-sm btn-ghost" data-disc-del="${d.id}" type="button">حذف</button>
      </td>
    </tr>`).join('');
  const body = `
  ${pageHead('النقاشات', '')}
  <section class="card">
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>#</th><th>العنوان</th><th>الباحث</th><th>النوع</th><th>الحالة</th><th>الردود</th><th>أُنشئ</th><th>إجراءات</th></tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="8" class="muted">لا نقاشات بعد.</td></tr>'}</tbody>
    </table></div>
  </section>
  <p class="muted small">الإخفاء يحجب النقاش عن الزوار دون حذفه. الباحثون الموثّقون فقط من ينشر — والتوثيق من صفحة المستخدمين.</p>`;
  return layout({ title: 'النقاشات', active: 'discussions', user, body });
}

// ---------- الموجّه ----------
export async function renderAdmin(pathname, req, env, user) {
  // صفحة الدخول: متاحة بدون جلسة فقط
  if (pathname === '/admin/login' || pathname === '/admin/login/') {
    if (user) return redirect('/admin');
    return htmlRes(loginPage());
  }
  // دفاع إضافي: أي صفحة أخرى تتطلب جلسة (الموجّه الرئيسي يفحص أيضًا)
  if (!user) return redirect('/admin/login');
  // الباحثون لا يدخلون لوحة الإدارة — لهم واجهتهم الخاصة
  if (user.role !== 'admin') return redirect('/researcher');

  const clean = pathname.replace(/\/+$/, '') || '/admin';
  if (clean === '/admin') return htmlRes(await dashboardPage(env, user));
  if (clean === '/admin/translation') return htmlRes(await translationPage(env, user));
  if (clean === '/admin/journal') return htmlRes(await journalAdminPage(env, user));
  if (clean === '/admin/materials') return htmlRes(await materialsListPage(env, user, req));
  if (clean === '/admin/materials/new') return htmlRes(await materialFormPage(env, user, 'new'));

  const mEdit = clean.match(/^\/admin\/materials\/(\d+)$/);
  if (mEdit) return htmlRes(await materialFormPage(env, user, mEdit[1]));

  const ent = clean.match(/^\/admin\/(people|places|sources|tags|collections|glossary|announcements)$/);
  if (ent) return htmlRes(await entityPage(env, user, ent[1]));

  if (clean === '/admin/backup') return htmlRes(await backupPage(env, user));
  if (clean === '/admin/audit') return htmlRes(await auditPage(env, user, req));
  if (clean === '/admin/review') return htmlRes(await reviewPage(env, user));
  if (clean === '/admin/users') return htmlRes(await usersPage(env, user));
  if (clean === '/admin/verification') return htmlRes(await verificationPage(env, user));
  if (clean === '/admin/discussions') return htmlRes(await adminDiscussionsPage(env, user));

  return htmlRes(layout({
    title: 'غير موجود', active: '', user,
    body: `<div class="card"><h2>صفحة غير موجودة</h2><p><a href="/admin">العودة إلى لوحة التحكم</a></p></div>`,
  }), 404);
}

// ============================================================
// واجهة الباحث — مساحة مبسطة: منشوراتي / مادة جديدة / مقال للمجلة
// ============================================================

const RESEARCHER_NAV = [
  ['mine', '/researcher/materials', 'منشوراتي'],
  ['journal', '/researcher/journal', 'المجلة'],
  ['discussions', '/researcher/discussions', 'نقاشاتي ومراجعاتي'],
  ['new', '/researcher/new', '+ مادة جديدة'],
];
const RESEARCHER_NAV_ICONS = { mine: 'home', journal: 'journal', discussions: 'chat', new: 'plus' };

const RESEARCHER_STATUS_LABELS = { draft: 'مسودة', in_review: 'قيد المراجعة', published: 'منشورة', hidden: 'مخفية' };

function researcherAvatarMarkup(user, size = '') {
  const displayName = user?.display_name || user?.username || 'باحث';
  const initial = String(displayName).trim().slice(0, 1) || 'ب';
  const classes = `researcher-avatar${size ? ` ${size}` : ''}`;
  const src = String(user?.avatar_public_path || '').trim()
    || (user?.avatar_r2_key ? '/researcher/avatar' : String(user?.avatar_url || '').trim());
  return src
    ? `<img class="${classes} researcher-avatar-image" src="${esc(src)}" alt="${esc(displayName)}" loading="lazy">`
    : `<span class="${classes}" aria-hidden="true">${esc(initial)}</span>`;
}

function researcherBioMarkup(value) {
  const lines = String(value || '')
    .split(/\r?\n+/)
    .map(line => line.replace(/^\s*[*•-]+\s*/, '').replace(/\*+/g, '').trim())
    .filter(Boolean);
  return lines.map(line => `<p>${esc(line)}</p>`).join('');
}

function researcherSelfAvatarLink(user, size = '') {
  const href = `/researcher/profile/${encodeURIComponent(user?.id || '')}`;
  return `<a class="researcher-avatar-link" href="${href}" aria-label="صفحتي الشخصية">${researcherAvatarMarkup(user, size)}</a>`;
}

function researcherMaterialData(material, thumbId = '') {
  const values = {
    id: material?.id,
    title: material?.title_ar || material?.title_orig || material?.ark || 'مادة من الأرشيف',
    type: TYPE_LABELS[material?.type] || material?.type || 'مادة',
    year: material?.year,
    ark: material?.ark,
    source: material?.source_name_ar || material?.source_name,
    author: material?.author,
    photographer: material?.photographer,
    place: material?.place_name,
    archive: material?.archive_ref,
    date: material?.date_text,
    description: material?.description,
    summary: material?.summary,
    image: thumbId ? `/file/${thumbId}` : '',
    pdf: material?.pdf_id ? `/file/${material.pdf_id}` : '',
    pdfDownload: material?.pdf_id ? `/file/${material.pdf_id}?download=1` : '',
  };
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && String(value) !== '')
    .map(([key, value]) => `data-material-${key}="${esc(String(value).slice(0, 1600))}"`)
    .join(' ');
}

/* أيقونات SVG حديثة موحدة لمساحة الباحث (Feather-style بخط 1.8) */
const SJ_SVG = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const SJ_ICONS = {
  bell: SJ_SVG('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  home: SJ_SVG('<path d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22v-8h6v8"/>'),
  plus: SJ_SVG('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  chat: SJ_SVG('<path d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-5 4.5v-14a1 1 0 0 1 1-1Z"/>'),
  user: SJ_SVG('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  journal: SJ_SVG('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  logout: SJ_SVG('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
  send: SJ_SVG('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>'),
  share: SJ_SVG('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  image: SJ_SVG('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  file: SJ_SVG('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>'),
};

function researcherUploadFields(prefix, { article = false, coverExists = false, imageCount = 0, fileExists = false } = {}) {
  if (article) {
    return `<div class="researcher-upload-fields researcher-article-file-field" data-upload-fields data-article="true" data-existing-images="0">
      <div class="researcher-upload-field"><strong>ملف المقال (اختياري)</strong><p>يمكن إرفاق ملف PDF أو Word واحد.</p>
        <input id="${prefix}-content-file" name="contentFile" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden${fileExists ? ' disabled' : ''}>
        <label class="researcher-upload-picker${fileExists ? ' is-disabled' : ''}" for="${prefix}-content-file"><span class="rup-icon">${SJ_ICONS.file}</span><span>${fileExists ? 'تم رفع الملف' : 'اختيار ملف المقال'}</span></label><span class="researcher-upload-selection" data-picker-label="${prefix}-content-file" data-empty-label="ملف PDF أو Word واحد">${fileExists ? 'الملف الحالي محفوظ' : 'ملف PDF أو Word واحد'}</span>
      </div>
    </div>`;
  }
  const contentAccept = article
    ? '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : '.pdf,application/pdf';
  return `<div class="researcher-upload-fields" data-upload-fields data-article="${article ? 'true' : 'false'}" data-existing-images="${imageCount}">
    <div class="researcher-upload-field"><strong>1. صورة الغلاف</strong><p>اختر صورة واحدة من الاستوديو لتظهر غلافًا للمادة.</p>
      <input id="${prefix}-cover" name="cover" type="file" accept="image/*" hidden${coverExists ? ' disabled' : ''}>
      <label class="researcher-upload-picker${coverExists ? ' is-disabled' : ''}" for="${prefix}-cover"><span class="rup-icon">${SJ_ICONS.image}</span><span>${coverExists ? 'تم رفع الغلاف' : 'اختيار صورة الغلاف'}</span></label><span class="researcher-upload-selection" data-picker-label="${prefix}-cover" data-empty-label="لم تُختر صورة">${coverExists ? 'الغلاف الحالي محفوظ' : 'لم تُختر صورة'}</span>
    </div>
    <div class="researcher-upload-field"><strong>2. المضمون المصوّر</strong><p>${article ? 'أضف عدة صور للمقال، ويمكنك إضافة ملف واحد أيضًا.' : 'أضف عدة صور للمضمون، أو ملف PDF واحدًا.'}</p>
      <input id="${prefix}-images" name="contentImages" type="file" accept="image/*" multiple hidden${(!article && fileExists) ? ' disabled' : ''}>
      <label class="researcher-upload-picker${(!article && fileExists) ? ' is-disabled' : ''}" for="${prefix}-images"><span class="rup-icon">${SJ_ICONS.image}</span><span>إضافة صور${imageCount ? ` أخرى (${imageCount})` : ''}</span></label><span class="researcher-upload-selection" data-picker-label="${prefix}-images" data-empty-label="يمكن اختيار أكثر من صورة">${imageCount ? `${imageCount} صورة محفوظة` : 'يمكن اختيار أكثر من صورة'}</span>
    </div>
    <div class="researcher-upload-field"><strong>${article ? '3. ملف المقال' : '3. ملف المضمون'}</strong><p>${article ? 'ملف واحد بصيغة PDF أو Word.' : 'ملف PDF واحد بدلًا من صور المضمون.'}</p>
      <input id="${prefix}-content-file" name="contentFile" type="file" accept="${contentAccept}" hidden${(fileExists || (!article && imageCount > 0)) ? ' disabled' : ''}>
      <label class="researcher-upload-picker${(fileExists || (!article && imageCount > 0)) ? ' is-disabled' : ''}" for="${prefix}-content-file"><span class="rup-icon">${SJ_ICONS.file}</span><span>${fileExists ? 'تم رفع الملف' : (!article && imageCount > 0 ? 'المضمون يحتوي صورًا' : 'اختيار ملف')}</span></label><span class="researcher-upload-selection" data-picker-label="${prefix}-content-file" data-empty-label="ملف واحد فقط">${fileExists ? 'الملف الحالي محفوظ' : (!article && imageCount > 0 ? 'احذف الصور لاختيار PDF بدلًا منها' : 'ملف واحد فقط')}</span>
    </div>
  </div>`;
}

function researcherLayout({ title, active, user, body }) {
  const canCreateDiscussion = Number(user?.is_verified) === 1;
  const nav = RESEARCHER_NAV.map(([key, href, label]) =>
    `<a href="${href}" class="nav-item${active === key ? ' active' : ''}">${esc(label)}</a>`
  ).join('');
  const accountNav = RESEARCHER_NAV.filter(([key]) => !['journal', 'discussions'].includes(key)).map(([key, href, label]) => {
    const icon = SJ_ICONS[RESEARCHER_NAV_ICONS[key]] || '';
    return `<a class="researcher-account-nav-link${active === key ? ' active' : ''}" href="${href}"><span class="ran-icon" aria-hidden="true">${icon}</span><span>${esc(label)}</span></a>`;
  }).join('');
  const csrfMeta = user && user.csrfToken
    ? `<meta name="csrf-token" content="${esc(user.csrfToken)}">` : '';
  const displayName = user?.display_name || user?.username || 'باحث';
  const verifiedBadge = Number(user?.is_verified) === 1 ? verificationBadge(user?.verification_type) : '';
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
${THEME_INIT}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${csrfMeta}
<title>${esc(title)} — سِجِل | مساحة الباحث</title>
<link rel="manifest" href="/app-manifest.json">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1220" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="stylesheet" href="/admin.css?v=20261004-journal-pdf-v2">
</head>
<body class="researcher-body">
<div class="admin-shell researcher-shell">
  <div class="topbar">
    <a class="topbar-brand researcher-brand-logo" href="/researcher" aria-label="العودة إلى الصفحة الرئيسية لمساحة الباحث"><img class="researcher-logo" src="/sidjil-logo.png" alt="سِجِل"><span class="researcher-wordmark">سجل</span></a>
    <div class="researcher-account-wrap">
      <button class="researcher-profile-chip" id="researcherAccountToggle" type="button" aria-expanded="false" aria-controls="researcherAccountMenu">
        ${researcherAvatarMarkup(user, 'small')}<span class="researcher-profile-name">${esc(displayName)}${verifiedBadge}</span><span class="researcher-account-chevron" aria-hidden="true"></span>
      </button>
      <div class="researcher-account-menu" id="researcherAccountMenu" hidden>
        <a class="researcher-account-menu-head researcher-account-menu-profile-link" href="/researcher/profile/${encodeURIComponent(user?.id || '')}" aria-label="الانتقال إلى الصفحة الشخصية">
          ${researcherAvatarMarkup(user, 'small')}
          <div class="researcher-account-menu-id"><strong>${esc(displayName)}${verifiedBadge}</strong><span class="post-meta">مساحة الباحث</span></div>
        </a>
        <div class="researcher-account-menu-group">
          <div class="researcher-account-menu-title">التنقل</div>
          ${accountNav}
        </div>
        <div class="researcher-account-menu-divider"></div>
        <div class="researcher-account-menu-group">
          <div class="researcher-account-menu-title">الحساب</div>
          <a class="researcher-account-nav-link${active === 'account' ? ' active' : ''}" href="/researcher/account"><span class="ran-icon" aria-hidden="true">${SJ_ICONS.user}</span><span>حسابي وإعداداتي</span></a>
          <div class="account-display-controls" aria-label="المظهر واللغة">
            <button class="theme-toggle" id="themeToggle" type="button" aria-label="تبديل المظهر الليلي/النهاري" title="تبديل المظهر الليلي/النهاري">
              <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
              <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
              <span>المظهر</span>
            </button>
            <button class="language-preview" type="button" disabled aria-label="اللغة الفرنسية، ستتوفر لاحقًا" title="ستتوفر لاحقًا"><span class="language-preview-code">FR</span><span>Français</span></button>
          </div>
          <button type="button" data-account-logout><span class="ran-icon" aria-hidden="true">${SJ_ICONS.logout}</span><span>تسجيل الخروج</span></button>
        </div>
      </div>
    </div>
  </div>
  <main class="main researcher-main">
    <div class="toast-zone" id="toastZone" aria-live="polite"></div>
    <div class="researcher-page-grid">
      <div class="researcher-content">${body}</div>
      <aside class="researcher-rail" aria-label="اختصارات الباحث">
        <section class="social-card researcher-rail-profile">
          <div class="researcher-rail-cover"></div>
          <div class="researcher-rail-profile-body">${researcherSelfAvatarLink(user)}<strong><a class="researcher-own-profile-link" href="/researcher/profile/${encodeURIComponent(user.id)}">${esc(displayName)}</a></strong><span class="post-meta">باحث ومساهم في سِجِل</span><a class="btn btn-ghost btn-sm" href="/researcher/account">حسابي</a></div>
        </section>
        <section class="social-card researcher-rail-card"><h2>اختصارات</h2><a href="/researcher/new">＋ إضافة مادة جديدة</a><a href="/researcher/journal#write">＋ مقال للمجلة</a><a href="/researcher/discussions">💬 النقاشات والمراجعات</a></section>
        <section class="social-card researcher-rail-card"><h2>دليل المشاركة</h2><p>شارك مصادر موثقة، واربط كل مراجعة بالمادة التي تناقشها. تمر موادك على اعتماد الإدارة قبل ظهورها للزوار.</p></section>
      </aside>
    </div>
    <footer class="researcher-footer"><span>سِجِل · مجتمع الباحثين والذاكرة الرقمية لتشاد</span><nav><a class="researcher-exit-link" href="/">الخروج إلى الموقع العام</a></nav></footer>
  </main>
</div>
<nav class="researcher-bottom-nav" aria-label="تنقل الهاتف">
  <a href="/researcher" class="${active === 'mine' ? 'active' : ''}"><span class="bn-icon">${SJ_ICONS.home}</span><span class="bn-label">الرئيسية</span></a>
  <button type="button" class="bn-bell" id="notifBell" aria-label="التنبيهات" aria-haspopup="true" aria-expanded="false"><span class="bn-icon">${SJ_ICONS.bell}<span class="notif-badge" id="notifBadge" hidden></span></span><span class="bn-label">التنبيهات</span></button>
  <a href="/researcher/discussions?view=community" class="${active === 'discussions' ? 'active' : ''}"><span class="bn-icon">${SJ_ICONS.chat}</span><span class="bn-label">المجتمع</span></a>
  <a href="/researcher/journal" class="${active === 'journal' ? 'active' : ''}"><span class="bn-icon">${SJ_ICONS.journal}</span><span class="bn-label">المجلة</span></a>
  <div class="notif-panel" id="notifPanel" hidden><div class="notif-panel-head"><strong>التنبيهات</strong><button type="button" class="notif-panel-close" id="notifPanelClose" aria-label="إغلاق اللوحة">×</button></div><div id="notifList"></div></div>
</nav>
<div class="researcher-modal-veil" id="researcherMaterialModal" hidden>
  <div class="researcher-material-modal" role="dialog" aria-modal="true" aria-labelledby="researcherMaterialModalTitle">
    <button class="researcher-modal-close" type="button" data-researcher-modal-close aria-label="إغلاق">×</button>
    <div class="researcher-material-modal-media" id="researcherMaterialModalMedia"></div>
    <div class="researcher-material-modal-content">
      <span class="eyebrow" id="researcherMaterialModalType"></span>
      <h2 id="researcherMaterialModalTitle"></h2>
      <div class="researcher-material-modal-meta" id="researcherMaterialModalMeta"></div>
      <p id="researcherMaterialModalText"></p>
      <div class="researcher-material-modal-actions researcher-pdf-actions">
        <button class="rpdf-action" id="researcherMaterialModalTranslate" type="button" data-translate-document hidden><span class="rpdf-action-icon" aria-hidden="true">🌐</span><span class="rpdf-action-label">ترجمة الكتاب</span></button>
        <a class="rpdf-action" id="researcherMaterialModalDownload" href="#" hidden><span class="rpdf-action-icon" aria-hidden="true">⬇️</span><span class="rpdf-action-label">تنزيل PDF الأصلي</span></a>
        <button class="rpdf-action" id="researcherMaterialModalDiscussion" type="button" aria-expanded="false" aria-controls="researcherMaterialModalDiscussionPanel"><span class="rpdf-action-icon" aria-hidden="true">💬</span><span class="rpdf-action-label">فتح النقاش</span></button>
      </div>
      <section class="researcher-modal-discussion" id="researcherMaterialModalDiscussionPanel" hidden>
        ${canCreateDiscussion ? `<form class="researcher-modal-discussion-form" id="researcherMaterialModalDiscussionForm" data-inline-discussion data-material="">
          <div class="fb-kind-chips" role="group" aria-label="نوع المشاركة">
            <label class="fb-kind-chip"><input type="radio" name="kind" value="comment" checked><span>💬 تعليق</span></label>
            <label class="fb-kind-chip"><input type="radio" name="kind" value="text"><span>📝 تلخيص</span></label>
            <label class="fb-kind-chip"><input type="radio" name="kind" value="review"><span>✦ مراجعة</span></label>
            <label class="fb-kind-chip"><input type="radio" name="kind" value="critique"><span>⚖ نقد</span></label>
            <label class="fb-kind-chip"><input type="radio" name="kind" value="idea"><span>💡 فكرة</span></label>
          </div>
          <input name="title" required maxlength="200" placeholder="عنوان المشاركة" aria-label="عنوان المشاركة">
          <textarea name="body" rows="3" required maxlength="20000" placeholder="اكتب تعليقك أو تلخيصك أو مراجعتك..." aria-label="نص المشاركة"></textarea>
          <div class="composer-footer"><span class="muted small">ستُنشر المشاركة مرتبطة بهذه المادة.</span><button class="btn btn-primary btn-sm" type="submit">نشر</button></div>
        </form>` : `<div class="researcher-modal-discussion-locked"><strong>المشاركة متاحة بعد توثيق الحساب.</strong><span>يمكنك اختيار تعليق أو تلخيص أو مراجعة بعد اعتماد حسابك.</span></div>`}
      </section>
    </div>
  </div>
</div>
<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
</script>
<script type="module" src="/js/researcher-pdf.js?v=20261004-mobile-pdf-reader-v1"></script>
<script src="/researcher-feed-v5.js?v=20261004-material-edit-community" defer></script>
<script src="/translate-inline.js?v=20261004-translation-head-v1" defer></script>
<script>
(() => {
  const init = () => {
    const toggle = document.getElementById('sideToggle');
    const sidebar = document.getElementById('adminNav');
    const shell = document.querySelector('.researcher-shell');
    if (toggle && sidebar && shell && !toggle.dataset.sjBound) {
      toggle.dataset.sjBound = '1';
      const setOpen = (open) => {
        sidebar.classList.toggle('open', open);
        shell.classList.toggle('nav-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      toggle.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); setOpen(!sidebar.classList.contains('open')); });
      sidebar.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => setOpen(false)));
      document.addEventListener('click', (event) => {
        if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
      });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
    }
    const account = document.getElementById('researcherAccountToggle');
    const menu = document.getElementById('researcherAccountMenu');
    if (account && menu && !account.dataset.sjBound) {
      account.dataset.sjBound = '1';
      const setAccountOpen = (open) => {
        menu.hidden = !open;
        menu.style.display = open ? 'grid' : 'none';
        menu.setAttribute('aria-hidden', open ? 'false' : 'true');
        account.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      setAccountOpen(false);
      account.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        setAccountOpen(menu.hidden);
      });
      document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && !account.contains(event.target)) setAccountOpen(false);
      });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setAccountOpen(false); });
    }
  };
  init();
})();
</script>
</body>
</html>`;
}

const DISCUSSION_KIND_LABELS = { comment: 'تعليق', review: 'مراجعة', critique: 'نقد', idea: 'فكرة', text: 'تلخيص / وصف' };

/* بطاقة مادة في موجز مساحة الباحث (تُستخدم في: اكتشف / الأحدث / المتابَعون / الاعتمادات) */
function researcherMaterialCard(m, feed, verified) {
  const title = m.title_ar || m.title_orig || m.ark;
  const inlineId = `researcherInlineDiscussion${m.id}`;
  const materialData = researcherMaterialData(m, m.thumb_id);
  const image = m.thumb_id
    ? `<button class="researcher-media-trigger" type="button" data-material-lightbox="/file/${m.thumb_id}" aria-label="عرض الصورة ${esc(title)}"><img class="researcher-feed-image" src="/file/${m.thumb_id}" alt="${esc(title)}" loading="lazy"></button>`
    : `<button class="researcher-media-trigger researcher-feed-placeholder" type="button" data-material-details ${materialData} aria-label="عرض تفاصيل ${esc(title)}">${esc(TYPE_LABELS[m.type] || m.type)}</button>`;
  const detailsButton = `<button class="researcher-details-btn" type="button" data-material-details ${materialData}>عرض التفاصيل</button>`;
  const excerpt = m.summary || m.description || '';
  const sourceDetails = [
    `المعرف الأرشيفي: ${m.ark}`,
    `نوع المادة: ${TYPE_LABELS[m.type] || m.type}`,
    m.year ? `السنة: ${m.year}` : '',
    m.source_name_ar || m.source_name ? `المصدر: ${m.source_name_ar || m.source_name}` : '',
    m.author ? `المؤلف/الجهة: ${m.author}` : '',
    m.photographer ? `المصور: ${m.photographer}` : '',
    m.place_name ? `الموضع: ${m.place_name}` : '',
    m.archive_ref ? `المرجع: ${m.archive_ref}` : '',
    m.date_text ? `التاريخ: ${m.date_text}` : '',
  ].filter(Boolean);
  const sourceBlock = sourceDetails.length
    ? `<div class="researcher-feed-source"><span class="researcher-feed-source-label">تفاصيل المصدر</span><div>${sourceDetails.map(item => `<span>${esc(item)}</span>`).join('')}</div></div>`
    : '';
  const officialNotice = feed === 'official'
    ? `<div class="researcher-official-notice"><span class="researcher-official-icon" aria-hidden="true">✓</span><div><strong>اعتماد من الإدارة</strong><span>اعتمدت الإدارة هذه المادة ونشرتها في أرشيف سِجِل · ${fmtDate(m.approved_at || m.updated_at)}</span></div></div>`
    : '';
  const discussionAction = (kind, label) => `<button class="researcher-feed-action-trigger" type="button" data-discussion-open="${inlineId}" data-discussion-kind="${kind}" aria-controls="${inlineId}" aria-expanded="false">${label}</button>`;
  const inlineComposer = verified
    ? `<div id="${inlineId}" class="researcher-inline-discussion fb-composer-box" data-discussion-composer hidden>
        <form data-inline-discussion data-material="${esc(m.id)}">
          <div class="fb-comment-row">
            <div class="post-avatar fb-comment-avatar">س</div>
            <div class="fb-comment-main">
              <div class="fb-kind-chips" role="group" aria-label="نوع المشاركة">${['comment|💬 تعليق', 'text|📝 تلخيص', 'review|✦ مراجعة', 'critique|⚖ نقد', 'idea|💡 فكرة'].map((pair) => { const [val, lab] = pair.split('|'); return `<label class="fb-kind-chip"><input type="radio" name="kind" value="${val}"${val === 'comment' ? ' checked' : ''}><span>${lab}</span></label>`; }).join('')}</div>
              <div class="field"><input name="title" required maxlength="200" value="${esc(title)}" placeholder="عنوان المشاركة" aria-label="عنوان المشاركة"></div>
              <textarea name="body" rows="2" required maxlength="20000" placeholder="اكتب تعليقك أو تلخيصك هنا..." aria-label="نص المشاركة" data-autogrow></textarea>
              <div class="fb-comment-footer"><span class="muted small">سيُنشر داخل مساحة الباحث.</span><button class="btn btn-primary btn-sm" type="submit">نشر</button></div>
            </div>
            <button class="fb-comment-collapse" type="button" data-discussion-close aria-label="إغلاق">×</button>
          </div>
        </form>
      </div>`
    : `<div id="${inlineId}" class="researcher-inline-discussion" data-discussion-composer hidden><div class="notice-card"><strong>المشاركة متاحة بعد توثيق الحساب.</strong><span class="muted small">يمكنك فتح الحساب من قائمة المستخدم ومتابعة حالة التوثيق.</span></div></div>`;
  const creatorId = Number(m.creator_id) || 0;
  const cardAuthor = creatorId ? (m.creator_name || m.author_name || 'باحث') : 'أرشيف سِجِل';
  const avatarSrc = creatorId
    ? (m.creator_avatar_r2_key ? `/researcher/avatar/${encodeURIComponent(creatorId)}` : String(m.creator_avatar_url || '').trim())
    : '/sidjil-logo.png';
  const avatar = avatarSrc
    ? `<img class="feed-brand-avatar-image${creatorId ? ' researcher-post-avatar-image' : ''}" src="${esc(avatarSrc)}" alt="${esc(cardAuthor)}" loading="lazy">`
    : `<span class="feed-brand-avatar-fallback">${esc(String(cardAuthor).trim().slice(0, 1) || 'ب')}</span>`;
  const cardAvatar = creatorId
    ? `<a class="post-avatar feed-brand-avatar" href="/researcher/profile/${encodeURIComponent(creatorId)}" aria-label="صفحة ${esc(cardAuthor)}">${avatar}</a>`
    : `<span class="post-avatar feed-brand-avatar" aria-label="أرشيف سِجِل">${avatar}</span>`;
  return `<article class="researcher-feed-post social-card">
    ${officialNotice}
    ${sourceBlock}
    <div class="post-head">${cardAvatar}<div><strong>${esc(cardAuthor)}</strong><div class="post-meta">${esc(TYPE_LABELS[m.type] || m.type)}${m.year ? ` · ${esc(m.year)}` : ''} · ${fmtDate(m.updated_at)}</div></div><span class="post-kind-label">منشور</span></div>
    <button class="researcher-feed-title researcher-material-trigger" type="button" data-material-details ${materialData}>${esc(title)}</button>
    ${image}
    ${detailsButton}
    ${excerpt ? `<p class="researcher-feed-excerpt">${esc(String(excerpt).slice(0, 420))}</p>` : ''}
    <div class="researcher-feed-actions">
      ${discussionAction('comment', '💬 علّق')}
      ${discussionAction('text', '📝 لخّص')}
      ${discussionAction('review', '✦ راجع')}
      <span class="feed-discussion-count">${Number(m.discussions_count || 0)} نقاش</span>
    </div>
    ${inlineComposer}
  </article>`;
}

async function attachDiscussionImages(db, rows) {
  const ids = [...new Set((rows || []).map(row => Number(row.id)).filter(Number.isFinite))];
  if (!ids.length) return rows;
  const result = await db.prepare(`SELECT id, discussion_id, filename, mime FROM discussion_files WHERE discussion_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all();
  const byDiscussion = new Map();
  for (const file of result.results || []) {
    if (!byDiscussion.has(Number(file.discussion_id))) byDiscussion.set(Number(file.discussion_id), []);
    byDiscussion.get(Number(file.discussion_id)).push(file);
  }
  for (const row of rows) row.attachments = byDiscussion.get(Number(row.id)) || [];
  return rows;
}

function researcherDiscussionImagesMarkup(discussion) {
  const images = (discussion.attachments || []).filter(file => String(file.mime || '').startsWith('image/'));
  if (!images.length) return '';
  return `<div class="researcher-post-image-grid">${images.map((image, index) => `<a href="/discussion-file/${image.id}" target="_blank" rel="noopener" aria-label="عرض صورة ${index + 1} للمنشور"><img src="/discussion-file/${image.id}" alt="صورة مرفقة بالمنشور" loading="lazy"></a>`).join('')}</div>`;
}

/* بطاقة نقاش باحث في موجز المجتمع */
function researcherDiscussionCard(d) {
  return `<article class="researcher-community-post social-card">
    <div class="post-head"><a class="post-avatar post-profile-link" href="/researcher/profile/${encodeURIComponent(d.author_id)}" aria-label="صفحة ${esc(d.author_name)}">${esc(String(d.author_name || 'ب').slice(0, 1))}</a><div><strong><a class="post-author-link" href="/researcher/profile/${encodeURIComponent(d.author_id)}">${esc(d.author_name)}</a></strong><div class="post-meta">${esc(DISCUSSION_KIND_LABELS[d.kind] || d.kind)} · ${fmtDate(d.created_at)}</div></div></div>
    <h3><a href="/researcher/discussions?focus=${encodeURIComponent(d.id)}">${esc(d.title)}</a></h3><p>${esc(String(d.body || '').slice(0, 360))}</p>
    ${researcherDiscussionImagesMarkup(d)}
    ${d.material_title ? `<div class="post-linked">حول: ${esc(d.material_title || d.material_ark)}</div>` : ''}
    <div class="researcher-feed-actions"><a href="/researcher/discussions?focus=${encodeURIComponent(d.id)}">💬 فتح والرد</a><span class="feed-discussion-count">${Number(d.replies_count || 0)} رد</span></div>
  </article>`;
}

async function researcherDashPage(env, user, req) {
  const url = new URL(req.url);
  const feed = ['discover', 'latest', 'official', 'following'].includes(url.searchParams.get('feed'))
    ? url.searchParams.get('feed')
    : 'discover';
  const feedLabels = { discover: 'اكتشف', latest: 'الأحدث', official: 'اعتمادات الإدارة', following: 'المتابَعون' };
  const sectionScope = feed === 'official' ? ' AND m.created_by = ?' : '';
  const sectionRows = feed === 'official'
    ? await env.DB.prepare(
      `SELECT c.id, c.title_ar, c.sort_order, COUNT(DISTINCT m.id) AS material_count
       FROM collections c
       JOIN material_collections mc ON mc.collection_id = c.id
       JOIN materials m ON m.id = mc.material_id AND m.publish_status = 'published'
       WHERE c.kind = 'section'${sectionScope}
       GROUP BY c.id, c.title_ar, c.sort_order
       HAVING COUNT(DISTINCT m.id) > 0
       ORDER BY c.sort_order, c.id`
    ).bind(user.id).all()
    : await env.DB.prepare(
      `SELECT c.id, c.title_ar, c.sort_order, COUNT(DISTINCT m.id) AS material_count
       FROM collections c
       JOIN material_collections mc ON mc.collection_id = c.id
       JOIN materials m ON m.id = mc.material_id AND m.publish_status = 'published'
       WHERE c.kind = 'section'
       GROUP BY c.id, c.title_ar, c.sort_order
       HAVING COUNT(DISTINCT m.id) > 0
       ORDER BY c.sort_order, c.id`
    ).all();
  const sections = sectionRows.results || [];
  const requestedSection = url.searchParams.get('section');
  const selectedSection = requestedSection && requestedSection !== 'all'
    ? sections.find(s => String(s.id) === requestedSection)
    : null;
  const rows = await env.DB.prepare(
    `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.publish_status, m.review_note, m.updated_at,
            (SELECT COUNT(*) FROM files f WHERE f.material_id = m.id) AS files_count
     FROM materials m WHERE m.created_by = ? ORDER BY m.updated_at DESC LIMIT 200`
  ).bind(user.id).all();
  const items = rows.results || [];

  // تبويب «اعتمادات الإدارة» هو صندوق تنبيهات للباحث: يعرض مواده ومقالاته
  // التي سجلت الإدارة اعتمادها ونشرتها، بدل إعادة عرض مواد الأرشيف العامة.
  const officialFilter = feed === 'official'
    ? ` AND m.created_by = ? AND EXISTS (SELECT 1 FROM audit_log approval WHERE approval.action = 'material.review_approve' AND approval.target = m.ark)`
    : '';
  const approvedAtSelect = feed === 'official'
    ? `COALESCE((SELECT MAX(a.created_at) FROM audit_log a WHERE a.action = 'material.review_approve' AND a.target = m.ark), m.updated_at) AS approved_at,`
    : `m.updated_at AS approved_at,`;
  const feedOrder = feed === 'discover'
    ? 'ORDER BY discussions_count DESC, m.updated_at DESC, m.id DESC'
    : 'ORDER BY m.updated_at DESC, m.id DESC';
  const sectionFilter = selectedSection
    ? ` AND EXISTS (SELECT 1 FROM material_collections mc_filter WHERE mc_filter.material_id = m.id AND mc_filter.collection_id = ?)`
    : '';
  const publishedQuery =
    `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.description, m.summary, m.year, m.date_text,
            m.author, m.photographer, m.archive_ref, m.updated_at,
            creator.id AS creator_id, creator.display_name AS creator_name, creator.avatar_url AS creator_avatar_url, creator.avatar_r2_key AS creator_avatar_r2_key,
            ${approvedAtSelect}
            s.name_ar AS source_name_ar, s.name AS source_name,
            p.name_ar AS place_name,
            (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.kind IN ('thumbnail', 'cover') OR f.mime LIKE 'image/%')
             ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 WHEN f.mime LIKE 'image/%' THEN 2 ELSE 3 END, f.id LIMIT 1) AS thumb_id,
            (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf')
             ORDER BY f.id LIMIT 1) AS pdf_id,
            (SELECT COUNT(*) FROM discussions d WHERE d.material_id = m.id AND d.status = 'published') AS discussions_count
     FROM materials m
     LEFT JOIN sources s ON s.id = m.source_id
     LEFT JOIN places p ON p.id = m.place_id
     LEFT JOIN admin_users creator ON creator.id = m.created_by AND creator.role = 'researcher'
     WHERE m.publish_status = 'published'${officialFilter}${sectionFilter}
     ${feedOrder} LIMIT 18`;
  const publishedParams = [];
  if (feed === 'official') publishedParams.push(user.id);
  if (selectedSection) publishedParams.push(selectedSection.id);
  const publishedRows = publishedParams.length
    ? await env.DB.prepare(publishedQuery).bind(...publishedParams).all()
    : await env.DB.prepare(publishedQuery).all();
  const verified = Number(user.is_verified) === 1;
  const publishedFeed = (publishedRows.results || []).map(m => researcherMaterialCard(m, feed, verified)).join('');

  /* تبويب «المتابَعون»: مواد ونقاشات الباحثين الذين يتابعهم المستخدم — تُبنى خادوميًا */
  let followingFeed = '';
  if (feed === 'following') {
    const fMats = await env.DB.prepare(
      `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.description, m.summary, m.year, m.date_text,
              m.author, m.photographer, m.archive_ref, m.updated_at,
              m.updated_at AS sort_date,
              COALESCE(u.display_name, u.username, 'باحث') AS author_name,
              u.id AS creator_id, u.display_name AS creator_name, u.avatar_url AS creator_avatar_url, u.avatar_r2_key AS creator_avatar_r2_key,
              (SELECT f2.id FROM files f2 WHERE f2.material_id = m.id AND (f2.kind IN ('thumbnail', 'cover') OR f2.mime LIKE 'image/%') ORDER BY CASE WHEN f2.kind = 'cover' THEN 0 WHEN f2.kind = 'thumbnail' THEN 1 ELSE 2 END, f2.id LIMIT 1) AS thumb_id,
              (SELECT f2.id FROM files f2 WHERE f2.material_id = m.id AND (f2.mime = 'application/pdf' OR lower(f2.filename) LIKE '%.pdf') ORDER BY f2.id LIMIT 1) AS pdf_id,
              (SELECT COUNT(*) FROM discussions d WHERE d.material_id = m.id AND d.status = 'published') AS discussions_count
       FROM materials m
       JOIN researcher_follows fl ON fl.followed_id = m.created_by
       LEFT JOIN admin_users u ON u.id = m.created_by AND u.role = 'researcher'
       WHERE fl.follower_id = ? AND m.publish_status = 'published'
       ORDER BY m.updated_at DESC, m.id DESC LIMIT 30`
    ).bind(user.id).all();
    const fDiscs = await env.DB.prepare(
      `SELECT d.id, d.author_id, d.title, d.body, d.kind, d.created_at,
              d.created_at AS sort_date,
              COALESCE(u.display_name, u.username, 'باحث') AS author_name,
              m.title_ar AS material_title, m.ark AS material_ark,
              (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count
       FROM discussions d
       JOIN researcher_follows fl ON fl.followed_id = d.author_id
       JOIN admin_users u ON u.id = d.author_id
       LEFT JOIN materials m ON m.id = d.material_id
       WHERE fl.follower_id = ? AND d.status = 'published'
       ORDER BY d.created_at DESC, d.id DESC LIMIT 30`
    ).bind(user.id).all();
    await attachDiscussionImages(env.DB, fDiscs.results || []);
    const merged = [
      ...((fMats.results || []).map(m => ({ sort: String(m.sort_date || ''), html: researcherMaterialCard(m, 'following', verified) }))),
      ...((fDiscs.results || []).map(d => ({ sort: String(d.sort_date || ''), html: researcherDiscussionCard(d) }))),
    ].sort((a, b) => (b.sort < a.sort ? -1 : b.sort > a.sort ? 1 : 0));
    followingFeed = merged.map(x => x.html).join('');
  }
  const communityRows = feed === 'discover' ? await env.DB.prepare(
    `SELECT d.id, d.author_id, d.title, d.body, d.kind, d.created_at,
            u.id AS author_id, COALESCE(u.display_name, u.username, 'باحث') AS author_name,
            m.title_ar AS material_title, m.ark AS material_ark,
            (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count
     FROM discussions d JOIN admin_users u ON u.id = d.author_id
     LEFT JOIN materials m ON m.id = d.material_id
     WHERE d.status = 'published' ORDER BY d.created_at DESC, d.id DESC LIMIT 12`
  ).all() : { results: [] };
  await attachDiscussionImages(env.DB, communityRows.results || []);
  const communityFeed = (communityRows.results || []).map(d => researcherDiscussionCard(d)).join('');

  const researcherRows = feed === 'discover' ? await env.DB.prepare(
    `SELECT id, username, display_name, avatar_url, avatar_r2_key, job_title
     FROM admin_users
     WHERE role = 'researcher' AND is_active = 1
     ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT 8`
  ).all() : { results: [] };
  const storyItems = (researcherRows.results || []).map(researcher => {
    const name = researcher.display_name || researcher.username || 'باحث';
    const initial = String(name).trim().slice(0, 1) || 'ب';
    const avatarSrc = researcher.avatar_r2_key
      ? `/researcher/avatar/${encodeURIComponent(researcher.id)}`
      : String(researcher.avatar_url || '').trim();
    const avatar = avatarSrc
      ? `<img class="researcher-story-avatar" src="${esc(avatarSrc)}" alt="${esc(name)}" loading="lazy">`
      : `<span class="researcher-story-avatar" aria-hidden="true">${esc(initial)}</span>`;
    return `<a class="researcher-story" href="/researcher/profile/${encodeURIComponent(researcher.id)}" aria-label="صفحة ${esc(name)}">${avatar}<span class="researcher-story-name">${esc(String(name).slice(0, 28))}</span>${researcher.job_title ? `<small>${esc(String(researcher.job_title).slice(0, 36))}</small>` : ''}</a>`;
  }).join('');
  const categoryTabs = [
    `<a class="${selectedSection ? '' : 'active'}" href="/researcher?feed=${encodeURIComponent(feed)}#feed">الكل</a>`,
    ...sections.map(section => `<a class="${selectedSection && Number(selectedSection.id) === Number(section.id) ? 'active' : ''}" href="/researcher?feed=${encodeURIComponent(feed)}&section=${encodeURIComponent(section.id)}#feed">${esc(section.title_ar)} <small>(${Number(section.material_count || 0)})</small></a>`),
  ].join('');

  const postCards = items.map(m => {
    const note = m.publish_status === 'draft' && m.review_note
      ? `<div class="review-note"><strong>ملاحظة المراجعة:</strong> ${esc(m.review_note)}</div>` : '';
    const actions = `
      <a class="btn btn-sm" href="/researcher/${m.id}">تعديل</a>
      ${m.publish_status === 'draft' ? `<button class="btn btn-sm btn-primary" data-r-submit="${m.id}" type="button">إرسال للمراجعة</button>
      <button class="btn btn-sm btn-ghost" data-r-delete="${m.id}" type="button">حذف</button>` : ''}`;
    return `<article class="researcher-material-card social-card">
      <div class="post-head"><div class="post-avatar">س</div><div><strong>${esc(TYPE_LABELS[m.type] || m.type)}</strong><div class="post-meta">${fmtDate(m.updated_at)} · ${m.files_count} ملف</div></div><span class="post-status">${badge(RESEARCHER_STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</span></div>
      <h3><a href="/researcher/${m.id}">${esc(m.title_ar || m.title_orig || '—')}</a></h3>
      ${note}
      <div class="post-actions"><a class="post-action" href="/researcher/${m.id}">فتح وتحرير</a>${m.publish_status === 'draft' ? `<button class="post-action post-action-button" data-r-submit="${m.id}" type="button">إرسال للمراجعة</button><button class="post-action post-action-danger" data-r-delete="${m.id}" type="button">حذف</button>` : ''}</div>
    </article>`;
  }).join('');

  const firstName = esc(String(user.display_name || user.username || 'باحث').split(' ')[0]);
  const dashboardComposer = verified ? `
  <section class="researcher-composer social-card fb-composer" aria-label="إنشاء منشور">
    <button class="fb-composer-trigger" type="button" id="fbComposerTrigger" aria-expanded="false" aria-controls="fbComposerForm">
      ${researcherSelfAvatarLink(user, 'small')}
      <span class="fb-composer-hint">بم تفكر يا ${firstName}؟</span>
    </button>
    <form id="discussionForm" class="researcher-post-form dashboard-post-form fb-composer-form" hidden>
      <div class="fb-kind-chips" role="group" aria-label="نوع المنشور">
        <label class="fb-kind-chip"><input type="radio" name="kind" value="comment" checked><span>💬 تعليق</span></label>
        <label class="fb-kind-chip"><input type="radio" name="kind" value="review"><span>✦ مراجعة</span></label>
        <label class="fb-kind-chip"><input type="radio" name="kind" value="critique"><span>⚖ نقد</span></label>
        <label class="fb-kind-chip"><input type="radio" name="kind" value="idea"><span>💡 فكرة</span></label>
        <label class="fb-kind-chip"><input type="radio" name="kind" value="text"><span>📝 تلخيص</span></label>
      </div>
      <input id="nd-material" name="material_id" type="hidden" value="">
      <div class="field"><input id="nd-title" name="title" required maxlength="200" placeholder="عنوان المنشور" aria-label="عنوان المنشور"></div>
      <div class="field"><textarea id="nd-body" name="body" rows="3" required maxlength="20000" placeholder="اكتب تعليقك أو تلخيصك أو مراجعتك..." aria-label="نص المنشور" data-autogrow></textarea></div>
      <div class="researcher-post-attachments"><input id="nd-images" name="images" type="file" accept="image/*" multiple hidden><label class="researcher-upload-picker" for="nd-images"><span class="rup-icon">${SJ_ICONS.image}</span><span>إضافة صور</span></label><span class="researcher-upload-selection" data-picker-label="nd-images">يمكن اختيار عدة صور</span><div class="researcher-selected-images" id="ndImagesPreview" hidden></div></div>
      <div class="composer-footer"><button class="btn btn-ghost btn-sm" type="button" id="fbComposerCancel">إلغاء</button><button class="btn btn-primary" type="submit">نشر المنشور</button></div>
    </form>
  </section>` : `<section class="researcher-composer social-card researcher-composer-locked"><div class="composer-profile">${researcherSelfAvatarLink(user, 'small')}<div><strong>المنشورات متاحة بعد توثيق الحساب</strong><span class="post-meta">يمكنك تصفح المواد الآن، وستتمكن من التعليق والمراجعة بعد اعتماد الإدارة لحسابك.</span></div></div></section>`;
  const feedHead = {
    discover: ['اكتشف · منشورات المجتمع', 'تصفح منشورات المجتمع بحسب أقسام الأرشيف، وناقش المصدر داخل مساحة الباحث.'],
    latest: ['الأحدث · منشورات المجتمع', 'أحدث المواد المنشورة في سِجِل مرتبة زمنيًا.'],
    following: ['المتابَعون · جديد من تتابعه', 'مواد ونقاشات الباحثين الذين تتابعهم، مرتبة زمنيًا.'],
    official: ['تنبيهات الإدارة · اعتمادات منشوراتك', 'تظهر هنا المواد والمقالات التي اعتمدتها الإدارة ونشرتها في الأرشيف العام.'],
  }[feed] || ['منشورات المجتمع', ''];
  const feedEmpty = feed === 'official'
    ? 'لا توجد اعتمادات جديدة من الإدارة لموادك أو مقالاتك.'
    : feed === 'following'
      ? 'تابع باحثين لترى جديد موادهم ونقاشاتهم هنا.'
      : `لا توجد مواد في تصفية «${feedLabels[feed]}».`;
  const body = `
  <section class="researcher-feed-tabs social-card" aria-label="تصفية الموجز"><a class="researcher-feed-tab${feed === 'discover' ? ' active' : ''}" href="/researcher?feed=discover#feed">اكتشف</a><a class="researcher-feed-tab${feed === 'following' ? ' active' : ''}" href="/researcher?feed=following#feed">المتابَعون</a><a class="researcher-feed-tab${feed === 'latest' ? ' active' : ''}" href="/researcher?feed=latest#feed">الأحدث</a><a class="researcher-feed-tab${feed === 'official' ? ' active' : ''}" href="/researcher?feed=official#feed">اعتمادات الإدارة</a></section>
  ${feed === 'discover' ? `<section class="researcher-stories social-card"><div class="researcher-stories-head"><strong>مجتمع الباحثين</strong><a href="/researcher/discussions?view=researchers">عرض الكل</a></div>${storyItems ? `<div class="researcher-story-row">${storyItems}</div>` : '<p class="researcher-stories-empty">لا توجد حسابات باحثين مسجلة بعد.</p>'}</section>` : ''}
  ${dashboardComposer}
  ${feed === 'following' ? '' : `<nav class="researcher-category-filter" aria-label="تصفية المواد بحسب القسم"><span>القسم</span><div class="researcher-category-tabs">${categoryTabs}</div></nav>`}
  <section class="social-section-head" id="feed"><div><h2>${feedHead[0]}${selectedSection && feed !== 'following' ? ` · ${esc(selectedSection.title_ar)}` : ''}</h2><p>${feedHead[1]}</p></div></section>
  <div class="researcher-published-feed">${(feed === 'following' ? followingFeed : publishedFeed) || `<div class="social-card empty-state">${feedEmpty}</div>`}</div>
  ${feed === 'discover' ? `<section class="social-section-head researcher-own-head"><div><h2>آخر نقاشات الباحثين</h2><p>اقرأ ما كتبه الباحثون الآخرون وافتح النقاش للرد والمراجعة.</p></div><a class="btn btn-ghost" href="/researcher/discussions?view=community">عرض كل النقاشات</a></section>
  <div class="researcher-community-feed">${communityFeed || '<div class="social-card empty-state">لا توجد نقاشات منشورة بعد.</div>'}</div>` : ''}
  <section class="social-section-head researcher-own-head"><div><h2>منشوراتي وموادي</h2><p>مسوداتك وحالات الاعتماد والملاحظات الإدارية.</p></div><a class="btn btn-ghost" href="/researcher/new">إنشاء مادة</a></section>
  <div class="researcher-material-feed">${postCards || '<div class="social-card empty-state">لا منشورات بعد — ابدأ بمادة جديدة.</div>'}</div>
  <p class="muted small researcher-help">كل مادة يرسلها الباحث تمر على مراجعة الإدارة قبل النشر. يمكنك متابعة الملاحظات وإعادة التعديل من البطاقة.</p>`;
  return researcherLayout({ title: 'منشوراتي', active: 'mine', user, body });
}

async function researcherAccountPage(user) {
  const avatarSrc = user?.avatar_r2_key ? '/researcher/avatar' : String(user?.avatar_url || '').trim();
  const v = (key) => esc(user?.[key] || '');
  const body = `
  <section class="researcher-hero social-card researcher-account-hero" aria-label="حسابي">
    <p class="researcher-account-intro">عدّل بياناتك وصورتك الشخصية التي تظهر في مشاركاتك.</p>
  </section>
  <section class="researcher-account-grid">
    <article class="social-card researcher-account-photo-card">
      <div class="researcher-account-photo-head"><div>${researcherSelfAvatarLink(user, 'large')}</div><div><h2>الصورة الشخصية</h2><p class="post-meta">JPG أو PNG أو WEBP أو GIF، بحد أقصى 5 ميغابايت.</p></div></div>
      <div class="researcher-account-photo-actions">
        <label class="btn btn-primary" for="profileAvatarInput">${avatarSrc ? 'تغيير الصورة' : 'رفع صورة الملف الشخصي'}</label>
        <input id="profileAvatarInput" data-profile-avatar type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
        ${avatarSrc ? '<button class="btn btn-ghost" type="button" data-profile-avatar-remove>حذف الصورة</button>' : ''}
      </div>
      <p class="muted small" data-profile-avatar-status>يتم رفع الصورة فور اختيارها.</p>
    </article>
    <form id="researcherProfileForm" class="social-card researcher-account-form">
      <div class="social-section-head"><div><h2>بيانات الحساب</h2><p>هذه البيانات تظهر للزوار والباحثين بحسب إعدادات النشر.</p></div><span class="badge ${Number(user?.is_verified) === 1 ? 'b-pub' : 'b-review'}">${Number(user?.is_verified) === 1 ? 'حساب موثّق' : 'بانتظار التوثيق'}</span></div>
      <div class="researcher-account-fields">
        <div class="field"><label for="profileDisplayName">الاسم الظاهر</label><input id="profileDisplayName" name="display_name" required maxlength="80" value="${v('display_name')}" autocomplete="name"></div>
        <div class="field"><label for="profileUsername">اسم المستخدم</label><input id="profileUsername" value="${v('username')}" dir="ltr" readonly><small class="muted">لا يمكن تغييره من مساحة الباحث.</small></div>
        <div class="field"><label for="profileEmail">البريد الإلكتروني</label><input id="profileEmail" name="email" type="email" required maxlength="160" value="${v('email')}" dir="ltr" autocomplete="email"></div>
        <div class="field"><label for="profilePhone">رقم الهاتف</label><input id="profilePhone" name="phone" type="tel" required maxlength="40" value="${v('phone')}" dir="ltr" autocomplete="tel"></div>
        <div class="field"><label for="profileJobTitle">الصفة أو المسمى الوظيفي</label><input id="profileJobTitle" name="job_title" required maxlength="160" value="${v('job_title')}"></div>
        <div class="field"><label for="profileAffiliation">الجهة أو المؤسسة</label><input id="profileAffiliation" name="affiliation" maxlength="160" value="${v('affiliation')}"></div>
        <div class="field"><label for="profileSpecialty">التخصص</label><input id="profileSpecialty" name="specialty" maxlength="160" value="${v('specialty')}"></div>
        <div class="field"><label for="profileWebsite">رابط فيسبوك</label><input id="profileWebsite" name="website" type="url" maxlength="300" value="${v('website')}" dir="ltr" placeholder="https://facebook.com/..."></div>
        <div class="field researcher-account-bio"><label for="profileBio">النبذة التعريفية</label><textarea id="profileBio" name="bio" required maxlength="1000" rows="5">${v('bio')}</textarea></div>
      </div>
      <div class="composer-footer"><span class="muted small" data-profile-status></span><button class="btn btn-primary" type="submit">حفظ بيانات الحساب</button></div>
    </form>
  </section>`;
  const passwordBody = `
  <form id="researcherPasswordForm" class="social-card researcher-password-card" novalidate>
    <div class="social-section-head"><div><h2>تغيير كلمة المرور</h2><p>أدخل كلمة المرور الحالية ثم اختر كلمة مرور جديدة لحماية حسابك.</p></div></div>
    <div class="researcher-password-fields">
      <div class="field researcher-password-field"><label for="currentPassword">كلمة المرور الحالية</label><div class="researcher-password-control"><input id="currentPassword" name="current_password" type="password" required autocomplete="current-password"><button type="button" class="password-visibility-toggle" data-password-target="currentPassword" aria-label="إظهار كلمة المرور">إظهار</button></div></div>
      <div class="field researcher-password-field"><label for="newPassword">كلمة المرور الجديدة</label><div class="researcher-password-control"><input id="newPassword" name="new_password" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="password-visibility-toggle" data-password-target="newPassword" aria-label="إظهار كلمة المرور">إظهار</button></div><div class="researcher-password-strength" data-password-strength><span></span></div><small class="muted" data-password-strength-label>8 أحرف على الأقل</small></div>
      <div class="field researcher-password-field"><label for="confirmPassword">تأكيد كلمة المرور الجديدة</label><div class="researcher-password-control"><input id="confirmPassword" name="confirm_password" type="password" required minlength="8" autocomplete="new-password"><button type="button" class="password-visibility-toggle" data-password-target="confirmPassword" aria-label="إظهار كلمة المرور">إظهار</button></div><small class="muted" data-password-match></small></div>
    </div>
    <div class="composer-footer"><span class="muted small" data-password-status></span><button class="btn btn-primary" type="submit">تغيير كلمة المرور</button></div>
  </form>`;
  const completeBody = body + passwordBody;
  return researcherLayout({ title: 'حسابي', active: 'account', user, body: completeBody });
}

async function researcherProfilePage(env, viewer, researcherId) {
  const target = await env.DB.prepare(
    `SELECT id, username, display_name, avatar_url, avatar_r2_key, verification_type, job_title,
            affiliation, specialty, bio, website, created_at
     FROM admin_users
     WHERE id = ? AND role = 'researcher' AND is_active = 1`
  ).bind(researcherId).first();
  if (!target) {
    return researcherLayout({
      title: 'الباحث غير موجود', active: 'mine', user: viewer,
      body: `<div class="card"><h2>الباحث غير موجود</h2><p><a href="/researcher">العودة إلى مساحة الباحث</a></p></div>`,
    });
  }

  target.avatar_public_path = `/researcher/avatar/${encodeURIComponent(target.id)}`;
  const [discussionRows, replyRows, materialRows, followCounts] = await Promise.all([
    env.DB.prepare(
      `SELECT d.id, d.title, d.body, d.kind, d.created_at, d.material_id,
              m.title_ar AS material_title, m.ark AS material_ark,
              (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count
       FROM discussions d LEFT JOIN materials m ON m.id = d.material_id
       WHERE d.author_id = ? AND d.status = 'published'
       ORDER BY d.created_at DESC, d.id DESC LIMIT 100`
    ).bind(target.id).all(),
    env.DB.prepare(
      `SELECT r.id, r.body, r.created_at, r.discussion_id,
              d.title AS discussion_title,
              m.title_ar AS material_title
       FROM discussion_replies r
       JOIN discussions d ON d.id = r.discussion_id AND d.status = 'published'
       LEFT JOIN materials m ON m.id = d.material_id
       WHERE r.author_id = ? AND r.status = 'published'
       ORDER BY r.created_at DESC, r.id DESC LIMIT 100`
    ).bind(target.id).all(),
    env.DB.prepare(
      `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.description,
              m.year, m.updated_at,
              (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.kind IN ('thumbnail', 'cover') OR f.mime LIKE 'image/%')
               ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 WHEN f.mime LIKE 'image/%' THEN 2 ELSE 3 END, f.id LIMIT 1) AS thumb_id,
              (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf')
               ORDER BY f.id LIMIT 1) AS pdf_id
       FROM materials m
       WHERE m.created_by = ? AND m.publish_status = 'published'
       ORDER BY m.updated_at DESC, m.id DESC LIMIT 100`
    ).bind(target.id).all(),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM researcher_follows WHERE followed_id = ?) AS followers,
              (SELECT COUNT(*) FROM researcher_follows WHERE follower_id = ?) AS following`
    ).bind(target.id, target.id).first(),
  ]);
  await attachDiscussionImages(env.DB, discussionRows.results || []);

  const kindLabels = { comment: 'تعليق', review: 'مراجعة', critique: 'نقد', idea: 'فكرة', text: 'تلخيص / وصف' };
  const discussionCards = (discussionRows.results || []).map(d => `
    <article class="researcher-profile-post social-card">
      <div class="post-head"><div class="post-avatar">${esc(String(target.display_name || target.username || 'ب').slice(0, 1))}</div><div><strong>${esc(target.display_name || target.username || 'باحث')}${verificationBadge(target.verification_type)}</strong><div class="post-meta">${esc(kindLabels[d.kind] || d.kind)} · ${fmtDate(d.created_at)}</div></div></div>
      <h3><a href="/researcher/discussions?focus=${encodeURIComponent(d.id)}">${esc(d.title)}</a></h3>
      <p>${esc(String(d.body || '').slice(0, 520))}</p>
      ${researcherDiscussionImagesMarkup(d)}
      ${d.material_title ? `<div class="post-linked">حول: ${esc(d.material_title || d.material_ark)}</div>` : ''}
      <div class="researcher-feed-actions"><a href="/researcher/discussions?focus=${encodeURIComponent(d.id)}">💬 فتح النقاش</a><span class="feed-discussion-count">${Number(d.replies_count || 0)} رد</span></div>
    </article>`).join('');

  const replyCards = (replyRows.results || []).map(r => `
    <article class="researcher-profile-post social-card researcher-profile-reply">
      <div class="post-head"><div class="post-avatar">${esc(String(target.display_name || target.username || 'ب').slice(0, 1))}</div><div><strong>${esc(target.display_name || target.username || 'باحث')}${verificationBadge(target.verification_type)}</strong><div class="post-meta">ردّ في نقاش · ${fmtDate(r.created_at)}</div></div></div>
      <p>${esc(String(r.body || '').slice(0, 520))}</p>
      <div class="post-linked">${r.material_title ? `حول: ${esc(r.material_title)}` : 'نقاش عام'} · <a href="/researcher/discussions?focus=${encodeURIComponent(r.discussion_id)}">${esc(r.discussion_title || 'فتح النقاش')}</a></div>
    </article>`).join('');

  const materialCards = (materialRows.results || []).map(m => {
    const title = m.title_ar || m.title_orig || m.ark;
    const materialData = researcherMaterialData(m, m.thumb_id);
    const image = m.thumb_id
      ? `<img class="researcher-profile-material-image" src="/file/${m.thumb_id}" alt="" loading="lazy">`
      : `<div class="researcher-profile-material-image researcher-feed-placeholder">${esc(TYPE_LABELS[m.type] || m.type)}</div>`;
    return `<button class="researcher-profile-material social-card researcher-material-trigger" type="button" data-material-details ${materialData}>${image}<span class="researcher-profile-material-body"><strong>${esc(title)}</strong><small>${esc(TYPE_LABELS[m.type] || m.type)}${m.year ? ` · ${esc(m.year)}` : ''}</small></span></button>`;
  }).join('');

  const profileName = target.display_name || target.username || 'باحث';
  const profileIsViewer = Number(viewer?.id) === Number(target.id);
  const jobTitle = String(target.job_title || '').trim();
  const affiliation = String(target.affiliation || '').trim();
  const specialty = String(target.specialty || '').trim();
  const bio = String(target.bio || '').trim();
  const socialLink = String(target.website || '').trim();
  const body = `
  <section class="researcher-profile-cover social-card">
    <div class="researcher-profile-cover-art"></div>
    <div class="researcher-profile-card">
      <div class="researcher-profile-avatar-wrap">
        ${researcherAvatarMarkup(target, 'profile-avatar')}
      </div>
      <div class="researcher-profile-identity">
        <h1 class="researcher-profile-name">${esc(profileName)}${verificationBadge(target.verification_type)}</h1>
        <p class="researcher-profile-username">@${esc(target.username || '')}</p>
        ${jobTitle ? `<p class="researcher-profile-role">${esc(jobTitle)}</p>` : ''}
        ${affiliation ? `<p class="researcher-profile-org">${esc(affiliation)}</p>` : ''}
        ${specialty && specialty !== jobTitle ? `<p class="researcher-profile-specialty">${esc(specialty)}</p>` : ''}
        ${bio ? `<div class="researcher-profile-bio">${researcherBioMarkup(bio)}</div>` : ''}
        ${socialLink ? `<a class="researcher-profile-social" href="${esc(socialLink)}" target="_blank" rel="noopener noreferrer">فيسبوك</a>` : ''}
      </div>
      ${profileIsViewer ? '' : `<button class="btn btn-primary researcher-follow-btn" type="button" data-follow-toggle="${target.id}">تابِع</button>`}
    </div>
  </section>
  <section class="researcher-profile-stats social-card"><span><strong>${(discussionRows.results || []).length}</strong><small>منشورًا ونقاشًا</small></span><span><strong>${(replyRows.results || []).length}</strong><small>ردًا وتعليقًا</small></span><span><strong>${(materialRows.results || []).length}</strong><small>مادة منشورة</small></span><span><strong data-followers-count>${Number(followCounts?.followers || 0)}</strong><small>متابِع</small></span><span><strong>${Number(followCounts?.following || 0)}</strong><small>يتابع</small></span></section>
  ${materialCards ? `<section class="social-section-head researcher-profile-section-head"><div><h2>المواد المنشورة</h2><p>المواد التي أضافها الباحث إلى أرشيف سِجِل.</p></div></section><div class="researcher-profile-materials">${materialCards}</div>` : ''}
  <section class="social-section-head researcher-profile-section-head"><div><h2>${profileIsViewer ? 'نقاشاتي ومراجعاتي' : `نقاشات ومراجعات ${esc(profileName)}`}</h2><p>المراجعات والتلخيصات والأفكار التي شاركها في المجتمع.</p></div>${profileIsViewer ? '<a class="btn btn-ghost" href="/researcher/discussions?view=received">ردود الباحثين علي</a>' : ''}</section>
  <div class="researcher-profile-feed">${discussionCards || '<div class="social-card empty-state">لا توجد منشورات أو مناقشات منشورة بعد.</div>'}</div>
  ${replyCards ? `<section class="social-section-head researcher-profile-section-head"><div><h2>التعليقات والردود</h2><p>مداخلاته في نقاشات الباحثين الآخرين.</p></div></section><div class="researcher-profile-feed">${replyCards}</div>` : ''}`;
  return researcherLayout({ title: profileName, active: 'profile', user: viewer, body });
}

async function researcherDirectoryPage(env, user, req) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const perPage = 36;
  const [count, rows] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM admin_users WHERE role = 'researcher' AND is_active = 1").first(),
    env.DB.prepare(
      `SELECT id, username, display_name, avatar_url, avatar_r2_key, verification_type,
              job_title, affiliation, is_verified
       FROM admin_users WHERE role = 'researcher' AND is_active = 1
       ORDER BY COALESCE(display_name, username), id LIMIT ? OFFSET ?`
    ).bind(perPage, (page - 1) * perPage).all(),
  ]);
  const total = Number(count?.total || 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cards = (rows.results || []).map(researcher => {
    const name = researcher.display_name || researcher.username || 'باحث';
    if (researcher.avatar_r2_key) researcher.avatar_public_path = `/researcher/avatar/${encodeURIComponent(researcher.id)}`;
    return `<a class="researcher-directory-card social-card" href="/researcher/profile/${encodeURIComponent(researcher.id)}">
      ${researcherAvatarMarkup(researcher, 'directory-avatar')}<span class="researcher-directory-copy"><strong>${esc(name)}${Number(researcher.is_verified) === 1 ? verificationBadge(researcher.verification_type) : ''}</strong>
      <span>${esc(researcher.job_title || researcher.affiliation || 'باحث مسجل في سِجِل')}</span></span>
    </a>`;
  }).join('');
  const pager = pages > 1 ? `<nav class="researcher-directory-pager" aria-label="صفحات دليل الباحثين">${page > 1 ? `<a class="btn btn-ghost btn-sm" href="?view=researchers&page=${page - 1}">السابق</a>` : ''}<span>صفحة ${page} من ${pages}</span>${page < pages ? `<a class="btn btn-ghost btn-sm" href="?view=researchers&page=${page + 1}">التالي</a>` : ''}</nav>` : '';
  const body = `<section class="researcher-hero social-card"><div><span class="eyebrow">المجتمع البحثي</span><h1>الباحثون المسجلون</h1><p>دليل الباحثين النشطين في سِجِل (${total}).</p></div><a class="btn btn-ghost" href="/researcher?feed=discover">العودة إلى اكتشف</a></section><div class="researcher-directory-grid">${cards || '<div class="social-card empty-state">لا يوجد باحثون مسجلون.</div>'}</div>${pager}`;
  return researcherLayout({ title: 'الباحثون المسجلون', active: 'discussions', user, body });
}

async function researcherMaterialsPage(env, user) {
  const result = await env.DB.prepare(
    `SELECT m.id, m.title_ar, m.title_orig, m.type, m.publish_status,
            m.review_note, m.updated_at,
            (SELECT COUNT(*) FROM files f WHERE f.material_id = m.id) AS files_count
     FROM materials m
     WHERE m.created_by = ? AND m.publish_status IN ('draft', 'in_review', 'published')
     ORDER BY m.updated_at DESC, m.id DESC LIMIT 200`
  ).bind(user.id).all();
  const materials = result.results || [];
  const cards = materials.map(m => `
    <article class="researcher-activity-material social-card">
      <div class="post-head">
        <div class="post-avatar">${esc(String(TYPE_LABELS[m.type] || m.type || 'م').slice(0, 1))}</div>
        <div><strong>${esc(TYPE_LABELS[m.type] || m.type || 'مادة')}</strong><div class="post-meta">${fmtDate(m.updated_at)} · ${Number(m.files_count || 0)} ملف</div></div>
        <span class="post-status">${badge(RESEARCHER_STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</span>
      </div>
      <h3><a href="/researcher/${m.id}">${esc(m.title_ar || m.title_orig || 'مادة بلا عنوان')}</a></h3>
      ${m.publish_status === 'draft' && m.review_note ? `<div class="review-note">${esc(m.review_note)}</div>` : ''}
      <div class="post-actions"><a class="post-action" href="/researcher/${m.id}">${m.publish_status === 'draft' ? 'متابعة تحرير المسودة' : 'عرض المادة'}</a></div>
    </article>`).join('');
  const body = `
    <section class="social-section-head researcher-own-head">
      <div><h2>منشوراتي</h2><p>مسوداتك والمواد المنشورة أو التي تنتظر مراجعة الإدارة.</p></div>
      <a class="btn btn-primary" href="/researcher/new">＋ إضافة مادة</a>
    </section>
    <div class="researcher-activity-feed">${cards || '<div class="social-card empty-state">لا توجد مسودات أو مواد منشورة أو قيد المراجعة بعد.</div>'}</div>`;
  return researcherLayout({ title: 'منشوراتي', active: 'mine', user, body });
}

async function researcherDiscussionsPage(env, user, req) {
  const verified = Number(user.is_verified) === 1;
  const notice = verified ? '' : `<div class="card notice-card"><strong>حسابك بانتظار التوثيق من الإدارة.</strong> يمكنك تصفح النقاشات، لكن النشر سيُتاح بعد التوثيق.</div>`;
  const url = new URL(req.url);
  const rawFocus = url.searchParams.get('focus') || '';
  const focusId = /^\d+$/.test(rawFocus) ? rawFocus : '';
  const rawView = url.searchParams.get('view');
  if (rawView === 'researchers') return researcherDirectoryPage(env, user, req);
  const activityView = rawView === 'received' ? 'received' : rawView === 'community' ? 'community' : 'my';

  const rows = await env.DB.prepare(
    `SELECT d.id, d.kind, d.title, d.status, d.created_at, d.material_id,
            m.ark AS material_ark, m.title_ar AS material_title,
            (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id) AS replies_count
     FROM discussions d LEFT JOIN materials m ON m.id = d.material_id
     WHERE d.author_id = ? ORDER BY d.id DESC LIMIT 200`
  ).bind(user.id).all();
  await attachDiscussionImages(env.DB, rows.results || []);

  const materialRows = await env.DB.prepare(
    `SELECT m.id, m.title_ar, m.title_orig, m.type, m.publish_status, m.review_note, m.updated_at,
            (SELECT COUNT(*) FROM files f WHERE f.material_id = m.id) AS files_count
     FROM materials m
     WHERE m.created_by = ?
     ORDER BY m.updated_at DESC, m.id DESC LIMIT 200`
  ).bind(user.id).all();
  const ownReplyRows = await env.DB.prepare(
    `SELECT r.id, r.body, r.created_at, r.discussion_id,
            d.title AS discussion_title, d.author_id AS discussion_author_id,
            COALESCE(u.display_name, u.username, 'باحث') AS discussion_author,
            m.title_ar AS material_title
     FROM discussion_replies r
     JOIN discussions d ON d.id = r.discussion_id AND d.status = 'published'
     LEFT JOIN admin_users u ON u.id = d.author_id
     LEFT JOIN materials m ON m.id = d.material_id
     WHERE r.author_id = ? AND r.status = 'published'
     ORDER BY r.created_at DESC, r.id DESC LIMIT 200`
  ).bind(user.id).all();
  const receivedReplyRows = await env.DB.prepare(
    `SELECT r.id, r.body, r.created_at, r.discussion_id,
            d.title AS discussion_title,
            u.id AS author_id,
            COALESCE(u.display_name, u.username, 'باحث') AS author_name,
            u.avatar_url, u.avatar_r2_key,
            m.title_ar AS material_title
     FROM discussion_replies r
     JOIN discussions d ON d.id = r.discussion_id AND d.status = 'published'
     JOIN admin_users u ON u.id = r.author_id
     LEFT JOIN materials m ON m.id = d.material_id
     WHERE d.author_id = ? AND r.author_id != ? AND r.status = 'published'
     ORDER BY r.created_at DESC, r.id DESC LIMIT 200`
  ).bind(user.id, user.id).all();

  let focusedBlock = '';
  if (focusId) {
    const focused = await env.DB.prepare(
      `SELECT d.id, d.title, d.body, d.kind, d.created_at, d.author_id,
              COALESCE(u.display_name, u.username, 'باحث') AS author_name,
              m.title_ar AS material_title
       FROM discussions d JOIN admin_users u ON u.id = d.author_id
       LEFT JOIN materials m ON m.id = d.material_id
       WHERE d.id = ? AND d.status = 'published'`
    ).bind(focusId).first();
    if (focused) {
      await attachDiscussionImages(env.DB, [focused]);
      const focusedReplies = await env.DB.prepare(
        `SELECT r.id, r.body, r.created_at,
                COALESCE(u.display_name, u.username, 'باحث') AS author_name
         FROM discussion_replies r JOIN admin_users u ON u.id = r.author_id
         WHERE r.discussion_id = ? AND r.status = 'published'
         ORDER BY r.created_at ASC, r.id ASC LIMIT 200`
      ).bind(focus.id).all();
      const replyCards = (focusedReplies.results || []).map(r => `<div class="researcher-focus-reply"><strong>${esc(r.author_name)}</strong><span class="post-meta">${fmtDate(r.created_at)}</span><p>${esc(r.body)}</p></div>`).join('');
      focusedBlock = `<section class="researcher-focus-discussion social-card"><div class="researcher-focus-head"><div class="post-avatar">${esc(String(focused.author_name || 'ب').slice(0, 1))}</div><div><strong>${esc(focused.author_name)}</strong><div class="post-meta">${esc({ comment: 'تعليق', review: 'مراجعة', critique: 'نقد', idea: 'فكرة', text: 'تلخيص / وصف' }[focused.kind] || focused.kind)} · ${fmtDate(focused.created_at)}</div></div><a class="btn btn-ghost btn-sm" href="/researcher/discussions?view=${activityView}">إغلاق</a></div><h2>${esc(focused.title)}</h2><p class="researcher-focus-body">${esc(focused.body)}</p>${researcherDiscussionImagesMarkup(focused)}${focused.material_title ? `<div class="post-linked">حول: ${esc(focused.material_title)}</div>` : ''}<div class="researcher-focus-replies"><h3>الردود (${(focusedReplies.results || []).length})</h3>${replyCards || '<p class="muted small">لا توجد ردود بعد.</p>'}</div>${verified ? `<form class="researcher-focus-reply-form" data-discussion-reply="${focused.id}"><textarea name="body" rows="3" required maxlength="10000" placeholder="اكتب ردك داخل مساحة الباحث..."></textarea><button class="btn btn-primary" type="submit">إرسال الرد</button></form>` : ''}</section>`;
    }
  }

  const discussionCards = (rows.results || []).map(d => `
    <article class="researcher-discussion-card social-card">
      <div class="post-head"><div class="post-avatar">${esc(String(user.username || 'ب').slice(0, 1))}</div><div><strong>${esc(user.display_name || user.username || 'باحث')}</strong><div class="post-meta">${esc({ comment: 'تعليق', review: 'مراجعة', critique: 'نقد', idea: 'نقد فكرة', text: 'نقد نص' }[d.kind] || d.kind)} · ${fmtDate(d.created_at)}</div></div><span class="post-status">${d.status === 'published' ? badge('منشور', 'b-pub') : badge('مخفي', 'b-hidden')}</span></div>
      <h3><a href="/researcher/discussions?focus=${encodeURIComponent(d.id)}">${esc(d.title)}</a></h3>
      ${researcherDiscussionImagesMarkup(d)}
      ${d.material_id ? `<p class="post-linked">حول: ${esc(d.material_title || d.material_ark)}</p>` : ''}
      <div class="post-actions"><a class="post-action" href="/researcher/discussions?focus=${encodeURIComponent(d.id)}">فتح النقاش · 💬 ${d.replies_count}</a><button class="post-action post-action-danger" data-del-discussion="${d.id}" type="button">حذف</button></div>
    </article>`).join('');

  const ownReplyCards = (ownReplyRows.results || []).map(r => `
    <article class="researcher-discussion-card social-card researcher-activity-reply">
      <div class="post-head">${researcherSelfAvatarLink(user, 'small')}<div><strong>${esc(user.display_name || user.username || 'باحث')}</strong><div class="post-meta">ردّ في نقاش · ${fmtDate(r.created_at)}</div></div></div>
      <p class="researcher-activity-body">${esc(r.body)}</p>
      <div class="post-linked">${r.material_title ? `حول: ${esc(r.material_title)}` : 'نقاش عام'} · <a href="/researcher/discussions?focus=${encodeURIComponent(r.discussion_id)}">${esc(r.discussion_title || 'فتح النقاش')}</a></div>
    </article>`).join('');

  const receivedReplyCards = (receivedReplyRows.results || []).map(r => {
    const name = r.author_name || 'باحث';
    const initial = String(name).trim().slice(0, 1) || 'ب';
    const avatarSrc = r.avatar_r2_key ? `/researcher/avatar/${encodeURIComponent(r.author_id)}` : String(r.avatar_url || '').trim();
    const avatar = avatarSrc
      ? `<img class="researcher-activity-avatar" src="${esc(avatarSrc)}" alt="${esc(name)}" loading="lazy">`
      : `<span class="researcher-activity-avatar" aria-hidden="true">${esc(initial)}</span>`;
    return `<article class="researcher-discussion-card social-card researcher-activity-reply"><div class="post-head"><a class="researcher-avatar-link" href="/researcher/profile/${encodeURIComponent(r.author_id)}" aria-label="صفحة ${esc(name)}">${avatar}</a><div><strong><a class="post-author-link" href="/researcher/profile/${encodeURIComponent(r.author_id)}">${esc(name)}</a></strong><div class="post-meta">ردّ على نقاشك · ${fmtDate(r.created_at)}</div></div></div><p class="researcher-activity-body">${esc(r.body)}</p><div class="post-linked">${r.material_title ? `حول: ${esc(r.material_title)}` : 'نقاش عام'} · <a href="/researcher/discussions?focus=${encodeURIComponent(r.discussion_id)}">${esc(r.discussion_title || 'فتح النقاش')}</a></div></article>`;
  }).join('');

  const materialCards = (materialRows.results || []).map(m => `<article class="researcher-activity-material social-card"><div class="post-head"><div class="post-avatar">${esc(String(TYPE_LABELS[m.type] || m.type || 'م').slice(0, 1))}</div><div><strong>${esc(TYPE_LABELS[m.type] || m.type || 'مادة')}</strong><div class="post-meta">${fmtDate(m.updated_at)} · ${m.files_count} ملف</div></div><span class="post-status">${badge(RESEARCHER_STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</span></div><h3><a href="/researcher/${m.id}">${esc(m.title_ar || m.title_orig || 'مادة بلا عنوان')}</a></h3>${m.review_note ? `<div class="review-note">${esc(m.review_note)}</div>` : ''}<div class="post-actions"><a class="post-action" href="/researcher/${m.id}">عرض المادة وتحريرها</a></div></article>`).join('');

  /* عرض المجتمع: مناقشات الباحثين الآخرين مع رد ومشاركة */
  const communityDiscussionRows = await env.DB.prepare(
    `SELECT d.id, d.author_id, d.title, d.body, d.kind, d.created_at, d.material_id,
            COALESCE(u.display_name, u.username, 'باحث') AS author_name,
            u.avatar_url, u.avatar_r2_key,
            m.title_ar AS material_title,
            (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count
     FROM discussions d JOIN admin_users u ON u.id = d.author_id
     LEFT JOIN materials m ON m.id = d.material_id
     WHERE d.status = 'published' AND d.author_id != ?
     ORDER BY d.created_at DESC, d.id DESC LIMIT 60`
  ).bind(user.id).all();
  await attachDiscussionImages(env.DB, communityDiscussionRows.results || []);
  const communityCards = (communityDiscussionRows.results || []).map(d => {
    const name = d.author_name || 'باحث';
    const initial = String(name).trim().slice(0, 1) || 'ب';
    const avatarSrc = d.avatar_r2_key ? `/researcher/avatar/${encodeURIComponent(d.author_id)}` : String(d.avatar_url || '').trim();
    const avatar = avatarSrc
      ? `<img class="researcher-activity-avatar" src="${esc(avatarSrc)}" alt="${esc(name)}" loading="lazy">`
      : `<span class="researcher-activity-avatar" aria-hidden="true">${esc(initial)}</span>`;
    const replyForm = verified
      ? `<form class="fb-reply-form" data-discussion-reply="${d.id}"><span class="fb-reply-avatar">${researcherAvatarMarkup(user, 'small')}</span><textarea name="body" rows="1" required maxlength="10000" placeholder="اكتب ردك..." aria-label="اكتب ردك" data-autogrow></textarea><button class="fb-reply-send" type="submit" aria-label="إرسال الرد">${SJ_ICONS.send}</button></form>`
      : '';
    return `<article class="researcher-discussion-card social-card">
      <div class="post-head"><a class="researcher-avatar-link" href="/researcher/profile/${encodeURIComponent(d.author_id)}" aria-label="صفحة ${esc(name)}">${avatar}</a><div><strong><a class="post-author-link" href="/researcher/profile/${encodeURIComponent(d.author_id)}">${esc(name)}</a></strong><div class="post-meta">${esc(DISCUSSION_KIND_LABELS[d.kind] || d.kind)} · ${fmtDate(d.created_at)}</div></div></div>
      <h3><a href="/researcher/discussions?view=community&focus=${encodeURIComponent(d.id)}">${esc(d.title)}</a></h3>
      <p class="researcher-activity-body">${esc(String(d.body || '').slice(0, 500))}</p>
      ${researcherDiscussionImagesMarkup(d)}
      ${d.material_title ? `<div class="post-linked">حول: ${esc(d.material_title)}</div>` : ''}
      <div class="post-actions"><a class="post-action" href="/researcher/discussions?view=community&focus=${encodeURIComponent(d.id)}">💬 ${Number(d.replies_count || 0)} رد · فتح النقاش</a><button class="post-action post-action-button" type="button" data-share-discussion="${d.id}"><span class="post-action-icon" aria-hidden="true">${SJ_ICONS.share}</span> مشاركة</button></div>
      ${replyForm}
    </article>`;
  }).join('');

  const activityTabs = `<section class="researcher-activity-tabs social-card" aria-label="نشاط الباحث"><a class="researcher-activity-tab${activityView === 'community' ? ' active' : ''}" href="/researcher/discussions?view=community">مجتمع الباحثين</a><a class="researcher-activity-tab${activityView === 'my' ? ' active' : ''}" href="/researcher/discussions?view=my">مناقشاتي وردودي</a><a class="researcher-activity-tab${activityView === 'received' ? ' active' : ''}" href="/researcher/discussions?view=received">ردود الباحثين علي</a></section>`;
  const activityContent = activityView === 'community'
    ? `<section class="social-section-head researcher-own-head"><div><h2>مناقشات الباحثين الآخرين</h2><p>اقرأ مشاركات الباحثين، وردّ عليها أو شاركها.</p></div></section><div class="researcher-activity-feed">${communityCards || '<div class="social-card empty-state">لا توجد مناقشات من باحثين آخرين بعد.</div>'}</div>`
    : activityView === 'received'
    ? `<section class="social-section-head researcher-own-head"><div><h2>ردود الباحثين علي</h2><p>كل الردود الجديدة على نقاشاتك ومراجعاتك.</p></div></section><div class="researcher-activity-feed">${receivedReplyCards || '<div class="social-card empty-state">لا توجد ردود من الباحثين على نقاشاتك بعد.</div>'}</div>`
    : `<section class="social-section-head researcher-own-head"><div><h2>مناقشاتي ومراجعاتي</h2><p>تعليقاتك ومراجعاتك وتلخيصاتك وأفكارك المنشورة.</p></div></section><div class="researcher-activity-feed">${discussionCards || '<div class="social-card empty-state">لا توجد مناقشات أو مراجعات منشورة بعد.</div>'}</div><section class="social-section-head researcher-own-head"><div><h2>ردودي</h2><p>الردود التي كتبتها داخل نقاشات الباحثين.</p></div></section><div class="researcher-activity-feed">${ownReplyCards || '<div class="social-card empty-state">لا ردود لك بعد.</div>'}</div><section class="social-section-head researcher-own-head"><div><h2>كتاباتي وموادي ومقالاتي</h2><p>المواد والمقالات التي أنشأتها وحالات اعتمادها.</p></div><a class="btn btn-ghost" href="/researcher/new">إضافة مادة</a></section><div class="researcher-activity-feed">${materialCards || '<div class="social-card empty-state">لا توجد مواد أو مقالات بعد.</div>'}</div>`;

  const body = `
  <section class="researcher-hero social-card">${researcherSelfAvatarLink(user, 'hero-avatar')}<div><span class="eyebrow">المجتمع البحثي</span><h1>نقاشاتي ومراجعاتي</h1><p>اكتب، ناقش، وراجع المواد مع الباحثين الموثقين.</p></div><a class="btn btn-ghost" href="/researcher">العودة إلى مساحة الباحث</a></section>
  ${activityTabs}
  ${notice}
  ${focusedBlock}
  <div class="researcher-activity-layout">
    <section class="researcher-feed-column">${activityContent}</section>
  </div>
  <p class="muted small">المشاركة والردود متاحة للباحثين المسجلين، بينما تعتمد الإدارة الحسابات وتدير المخالفات.</p>`;
  return researcherLayout({ title: 'نقاشاتي ومراجعاتي', active: 'discussions', user, body });
}

async function researcherFormPage(env, user, mode, id) {
  const db = env.DB;
  let m = null;
  if (id) {
    m = await db.prepare('SELECT * FROM materials WHERE id = ? AND created_by = ?').bind(id, user.id).first();
    if (!m) {
      return researcherLayout({ title: 'غير موجود', active: 'mine', user,
        body: `<div class="card"><h2>المادة غير موجودة</h2><p><a href="/researcher">العودة إلى منشوراتي</a></p></div>` });
    }
  }
  const isEdit = !!m;
  const editRequest = isEdit && m.publish_status === 'published'
    ? await db.prepare("SELECT status, note FROM material_edit_requests WHERE material_id = ? AND researcher_id = ? ORDER BY id DESC LIMIT 1").bind(m.id, user.id).first()
    : null;
  const editApproved = editRequest?.status === 'approved';
  const canEditMaterial = isEdit && (m.publish_status === 'draft' || editApproved);
  const fieldDisabled = isEdit && !canEditMaterial ? ' disabled' : '';
  const defType = isEdit ? m.type : (mode === 'article' ? 'article' : 'document');
  const typeOpts = Object.entries(TYPE_LABELS).filter(([value]) => !(mode === 'new' && value === 'article'))
    .map(([v, l]) => `<option value="${v}"${defType === v ? ' selected' : ''}>${esc(l)}</option>`).join('');

  const sections = await db.prepare(
    "SELECT id, title_ar FROM collections WHERE kind = 'section' ORDER BY sort_order, id").all();
  let mySectionIds = new Set();
  if (isEdit) {
    const r = await db.prepare(
      `SELECT mc.collection_id FROM material_collections mc
       JOIN collections c ON c.id = mc.collection_id
       WHERE mc.material_id = ? AND c.kind = 'section'`).bind(m.id).all();
    mySectionIds = new Set((r.results || []).map(x => x.collection_id));
  }
  const secBoxes = (sections.results || []).map(s =>
    `<label class="check"><input type="checkbox" name="sectionIds" value="${s.id}"${mySectionIds.has(s.id) ? ' checked' : ''}${fieldDisabled}> ${esc(s.title_ar)}</label>`
  ).join('');

  let filesBlock = '';
  if (isEdit) {
    const fr = await db.prepare('SELECT id, kind, filename, size, mime FROM files WHERE material_id = ? ORDER BY id').bind(m.id).all();
    const currentFiles = fr.results || [];
    const coverExists = currentFiles.some(f => f.kind === 'cover');
    const imageCount = currentFiles.filter(f => f.kind === 'attachment' && /^image\//i.test(f.mime || '')).length;
    const fileExists = currentFiles.some(f => f.kind === 'attachment' && !/^image\//i.test(f.mime || ''));
    const frows = (fr.results || []).map(f => `
      <tr><td>${esc(f.filename || '—')}</td><td>${esc(f.kind || '')}</td>
      <td class="mono">${f.size ? (f.size / 1024).toFixed(0) + ' ك.ب' : '—'}</td>
      <td>${canEditMaterial ? `<button class="btn btn-sm btn-ghost" data-r-file-del="${f.id}" type="button">حذف</button>` : ''}</td></tr>`).join('');
    filesBlock = `
    <section class="card">
      <h2>الملفات (${(fr.results || []).length})</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>الاسم</th><th>النوع</th><th>الحجم</th><th></th></tr></thead>
        <tbody>${frows || '<tr><td colspan="4" class="muted">لا ملفات مرفوعة بعد.</td></tr>'}</tbody>
      </table></div>
      ${canEditMaterial ? `<form id="rUploadForm" data-material="${m.id}" data-article="${m.type === 'article' ? 'true' : 'false'}">
        ${researcherUploadFields('rUpload', { article: m.type === 'article', coverExists, imageCount, fileExists })}
        <button class="btn btn-primary" type="submit">رفع الملفات المحددة</button>
      </form>` : '<p class="muted small">تعديل الملفات متاح بعد موافقة الإدارة على طلب التعديل.</p>'}
    </section>`;
  }

  const statusBlock = isEdit ? `
    <section class="card">
      <h2>النشر</h2>
      <p>الحالة: ${badge(RESEARCHER_STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</p>
      ${m.publish_status === 'draft' && m.review_note ? `<div class="review-note"><strong>ملاحظة المراجعة:</strong> ${esc(m.review_note)}</div>` : ''}
      ${m.publish_status === 'draft' ? `<button class="btn btn-primary" data-r-submit="${m.id}" type="button">إرسال للمراجعة</button>
      <button class="btn btn-ghost" data-r-delete="${m.id}" type="button">حذف المسودة</button>` : ''}
      ${m.publish_status === 'in_review' ? '<p class="muted small">المادة قيد مراجعة الإدارة — لا يمكن تعديلها الآن.</p>' : ''}
      ${m.publish_status === 'published' && editApproved ? '<p class="notice-card">وافقت الإدارة على طلب التعديل. يمكنك تحرير بيانات المادة وملفاتها أدناه.</p>' : ''}
      ${m.publish_status === 'published' && !editApproved && editRequest?.status === 'pending' ? '<p class="muted small">طلب تعديل المادة قيد مراجعة الإدارة.</p>' : ''}
      ${m.publish_status === 'published' && !editApproved && editRequest?.status !== 'pending' ? `<button class="btn btn-primary" type="button" data-r-edit-request="${m.id}">طلب تعديل المادة</button>${editRequest?.status === 'rejected' && editRequest.note ? `<div class="review-note">ملاحظة الإدارة: ${esc(editRequest.note)}</div>` : ''}` : ''}
    </section>` : '';

  const ro = isEdit && !canEditMaterial ? 'disabled' : '';
  const title = isEdit ? 'تعديل المادة' : (mode === 'article' ? 'مقال جديد للمجلة' : 'مادة جديدة');
  const active = isEdit ? 'mine' : mode;
  const body = `
  ${pageHead(title, `<a class="btn btn-ghost" href="/researcher">→ منشوراتي</a>`)}
  <form id="rMaterialForm" data-mode="${isEdit ? 'edit' : 'new'}" data-id="${m ? m.id : ''}" data-after="${mode === 'article' ? 'article' : 'new'}">
    <section class="card">
      <h2>بيانات المادة</h2>
      <div class="field"><label for="rf-type">النوع</label><select id="rf-type" name="type" ${ro}>${typeOpts}</select></div>
      <div class="field"><label for="rf-title">العنوان (عربي) *</label><input id="rf-title" name="title_ar" required value="${esc(m?.title_ar || '')}" ${ro}></div>
      <div class="field"><label for="rf-title-orig">العنوان الأصلي</label><input id="rf-title-orig" name="title_orig" value="${esc(m?.title_orig || '')}" ${ro}></div>
      <div class="field"><label for="rf-desc">الوصف</label><textarea id="rf-desc" name="description" rows="4" ${ro}>${esc(m?.description || '')}</textarea></div>
      <div class="grid-2">
        <div class="field"><label for="rf-lang">اللغة</label>
          <select id="rf-lang" name="language" ${ro}>
            ${['ar', 'fr', 'ota', 'en'].map(l => `<option value="${l}"${(m?.language || 'ar') === l ? ' selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="field"><label for="rf-year">السنة</label><input id="rf-year" name="year" type="number" min="1500" max="2100" value="${esc(m?.year ?? '')}" ${ro}></div>
      </div>
      <div class="field"><span class="field-label">الأقسام</span><div class="checks">${secBoxes || '<span class="muted">لا أقسام معرّفة بعد.</span>'}</div></div>
      ${!isEdit ? `<section class="researcher-upload-card"><h3>صور وملفات المادة</h3><p class="muted small">حدد صورة الغلاف والمضمون الآن؛ سيرفعهما التطبيق بعد إنشاء المسودة.</p>${researcherUploadFields('rNewUpload')}</section>` : ''}
      ${!isEdit ? '<button class="btn btn-primary" type="submit">إنشاء المسودة</button>' : (canEditMaterial ? '<button class="btn btn-primary" type="submit">حفظ التعديلات</button>' : '')}
    </section>
  </form>
  ${filesBlock}
  ${statusBlock}`;
  return researcherLayout({ title, active, user, body });
}

/* ============================================================
   صفحة المجلة: أعداد PDF + كتابة مقال بمرفق
   ============================================================ */
async function researcherJournalPage(env, user) {
  const verified = Number(user.is_verified) === 1;
  const [legacyIssues, pdfIssues] = await Promise.all([env.DB.prepare(
    `SELECT m.id, m.ark, m.title_ar, m.title_orig, m.description, m.year,
            (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf') ORDER BY f.id LIMIT 1) AS pdf_id,
            (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.kind IN ('thumbnail', 'cover') OR f.mime LIKE 'image/%') ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 ELSE 2 END, f.id LIMIT 1) AS thumb_id
     FROM materials m WHERE m.type = 'journal' AND m.publish_status = 'published'
     ORDER BY m.year DESC, m.id DESC`
  ).all(), env.DB.prepare(
    `SELECT id, issue_number, year, title, description, comment FROM journal_pdf_issues ORDER BY year DESC, id DESC`
  ).all()]);
  const legacyCards = (legacyIssues.results || []).map(m => {
    const title = m.title_ar || m.title_orig || m.ark || 'عدد مجلة';
    const cover = m.thumb_id
      ? `<div class="journal-card-cover"><img src="/file/${m.thumb_id}" alt="${esc(title)}" loading="lazy"></div>`
      : `<div class="journal-card-cover placeholder" aria-hidden="true">📓</div>`;
    return `<article class="social-card journal-card">
      ${cover}
      <div class="journal-card-body">
        <h3>${esc(title)}</h3>
        ${m.year ? `<div class="post-meta">سنة الإصدار: ${esc(String(m.year))}</div>` : ''}
        ${m.description ? `<p>${esc(String(m.description).slice(0, 220))}</p>` : ''}
        <div class="journal-card-actions">
          ${m.pdf_id
            ? `<button class="btn btn-primary btn-sm" type="button" data-material-details data-material-pdf="/file/${m.pdf_id}" data-material-pdf-download="/file/${m.pdf_id}?download=1" data-material-title="${esc(title)}" data-material-type="عدد مجلة">📖 عرض العدد</button><a class="btn btn-ghost btn-sm" href="/file/${m.pdf_id}?download=1">⬇ تحميل PDF</a>`
            : '<span class="muted small">لا يوجد ملف PDF لهذا العدد بعد.</span>'}
        </div>
      </div>
    </article>`;
  }).join('');
  const uploadedCards = (pdfIssues.results || []).map(issue => `
    <article class="social-card journal-card"><div class="journal-card-cover placeholder" aria-hidden="true">📓</div><div class="journal-card-body">
      <h3>${esc(issue.title)}</h3><div class="post-meta">العدد ${esc(issue.issue_number)} · ${esc(String(issue.year))}</div>
      ${issue.description ? `<p>${esc(issue.description)}</p>` : ''}${issue.comment ? `<p class="muted small"><strong>تعليق:</strong> ${esc(issue.comment)}</p>` : ''}
      <div class="journal-card-actions"><a class="btn btn-primary btn-sm" href="/journal/issues/${issue.id}/pdf" target="_blank" rel="noopener">📖 عرض العدد</a><a class="btn btn-ghost btn-sm" href="/journal/issues/${issue.id}/pdf?download=1">⬇ تحميل PDF</a></div>
    </div></article>`).join('');
  const issueCards = uploadedCards + legacyCards;

  const composer = verified ? `
  <section class="social-card journal-write" id="write" aria-label="كتابة مقال للمجلة">
    <h2>✍ اكتب مقالًا للمجلة</h2>
    <p class="muted small">اكتب مقالك وأرفق ملف PDF أو Word واحدًا إن رغبت؛ ثم أرسله للإدارة للمراجعة.</p>
    <form id="journalArticleForm">
      <div class="field"><label for="ja-title">عنوان المقال *</label><input id="ja-title" name="title" required maxlength="200" placeholder="عنوان المقال"></div>
      <div class="field"><label for="ja-body">نص المقال *</label><textarea id="ja-body" name="body" rows="8" required maxlength="50000" placeholder="اكتب مقالك هنا..." data-autogrow></textarea></div>
      ${researcherUploadFields('jaUpload', { article: true })}
      <div class="composer-footer"><span class="muted small" id="jaStatus"></span><button class="btn btn-primary" type="submit" id="jaSubmit">إرسال المقال</button></div>
    </form>
  </section>` : `
  <section class="social-card journal-write" id="write" aria-label="كتابة مقال للمجلة">
    <h2>✍ اكتب مقالًا للمجلة</h2>
    <div class="notice-card"><strong>كتابة المقالات متاحة بعد توثيق الحساب.</strong><span class="muted small">يمكنك تصفح الأعداد الآن.</span></div>
  </section>`;

  const body = `
  <section class="social-section-head" id="issues"><div><h2>📓 مجلة سِجِل</h2><p>أعداد المجلة الصادرة بصيغة PDF — تصفحها وحمّلها، أو ساهم بمقال.</p></div></section>
  <div class="journal-issues">${issueCards || '<div class="social-card empty-state">لم يصدر أي عدد من المجلة بعد.</div>'}</div>
  ${composer}`;
  return researcherLayout({ title: 'المجلة', active: 'journal', user, body });
}

export async function renderResearcher(pathname, req, env, user) {
  if (!user) return redirect('/admin/login');
  if (user.role === 'admin') return redirect('/admin');

  const clean = pathname.replace(/\/+$/, '') || '/researcher';
  if (clean === '/researcher') return htmlRes(await researcherDashPage(env, user, req));
  if (clean === '/researcher/materials') return htmlRes(await researcherMaterialsPage(env, user));
  if (clean === '/researcher/account') return htmlRes(await researcherAccountPage(user));
  const mProfile = clean.match(/^\/researcher\/profile\/(\d+)$/);
  if (mProfile) return htmlRes(await researcherProfilePage(env, user, parseInt(mProfile[1], 10)));
  if (clean === '/researcher/new') return htmlRes(await researcherFormPage(env, user, 'new', null));
  if (clean === '/researcher/journal') return htmlRes(await researcherJournalPage(env, user));
  if (clean === '/researcher/article') return redirect('/researcher/journal#write');
  if (clean === '/researcher/discussions') return htmlRes(await researcherDiscussionsPage(env, user, req));

  const mEdit = clean.match(/^\/researcher\/(\d+)$/);
  if (mEdit) return htmlRes(await researcherFormPage(env, user, 'edit', parseInt(mEdit[1], 10)));

  return htmlRes(researcherLayout({
    title: 'غير موجود', active: 'mine', user,
    body: `<div class="card"><h2>صفحة غير موجودة</h2><p><a href="/researcher">العودة إلى منشوراتي</a></p></div>`,
  }), 404);
}
