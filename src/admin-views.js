// ============================================================
// SIDJIL — لوحة الإدارة: كل صفحات الإدارة (HTML)
// عربية فقط، RTL. لا منطق توجيه هنا: الموجّه في index.js يفحص
// الجلسة ثم يستدعي renderAdmin(pathname, req, env, user).
// كل الكتابة تتم عبر /api/v1/admin/* (تُنفَّذ من public/admin.js).
// ملاحظة أمنية: نعيد فحص الجلسة هنا دفاعيًا (عدا /admin/login).
// ============================================================

// ---------- ثوابت العرض ----------
import { syncContentRepairQueue } from './admin-api.js';
import { MATERIAL_LEVELS, materialLevelLabel, materialLevelDescription } from './lib/material-levels.js';

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
const MATERIAL_LEVEL_LABELS = Object.fromEntries(Object.entries(MATERIAL_LEVELS).map(([key, value]) => [key, value.ar]));
const MATERIAL_LEVEL_OPTIONS = Object.entries(MATERIAL_LEVELS)
  .map(([value, item]) => `<option value="${esc(value)}">${esc(item.ar)}</option>`)
  .join('');
const STATUS_LABELS = { draft: 'مسودة', in_review: 'قيد المراجعة', changes_requested: 'مطلوب تعديلها', published: 'منشورة', hidden: 'مخفية' };
const STATUS_CLASS = { draft: 'b-draft', in_review: 'b-review', changes_requested: 'b-review', published: 'b-pub', hidden: 'b-hidden' };
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
  ['quality', '/admin/content-health', 'صحة المحتوى'],
  ['repair', '/admin/content-repair', 'طابور إصلاح المحتوى'],
  ['verification', '/admin/verification', 'التوثيق'],
  ['users', '/admin/users', 'المستخدمون'],
  ['discussions', '/admin/discussions', 'النقاشات'],
  ['social-reports', '/admin/social-reports', 'بلاغات المجتمع'],
  ['metrics', '/admin/metrics', 'مؤشرات الأداء'],
  ['backup', '/admin/backup', 'النسخ الاحتياطي'],
  ['audit', '/admin/audit', 'سجل العمليات'],
];
const NAV_MARKS = {
  dashboard: '⌂', materials: '▦', review: '✓', people: '♙', places: '⌖', sources: '◈',
  tags: '#', collections: '▤', journal: '▣', announcements: '!', glossary: 'Aa', translation: '文',
  verification: '✓', quality: '◇', repair: '⚙', users: '♙', discussions: '◌', 'social-reports': '⚑', metrics: '▥', backup: '⇩', audit: '≡',
};
const NAV_GROUPS = [
  { id: 'overview', label: 'الرئيسية', items: ['dashboard', 'metrics'] },
  { id: 'archive', label: 'الأرشيف والمحتوى', items: ['materials', 'review', 'quality', 'repair'] },
  { id: 'reference', label: 'البيانات المرجعية', items: ['people', 'places', 'sources', 'tags', 'collections'] },
  { id: 'publishing', label: 'النشر والتحرير', items: ['journal', 'announcements', 'verification'] },
  { id: 'translation', label: 'الترجمة', items: ['translation', 'glossary'] },
  { id: 'community', label: 'المجتمع والحسابات', items: ['users', 'discussions', 'social-reports'] },
  { id: 'system', label: 'النظام والمراقبة', items: ['backup', 'audit'] },
];

// ---------- أدوات ----------
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildResearcherFtsQuery(value) {
  const tokens = String(value || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .split(/\s+/)
    .map(token => token.replace(/["*:()]/g, '').trim())
    .filter(token => token.length > 0)
    .slice(0, 8);
  return tokens.length ? tokens.map(token => `"${token}"*`).join(' ') : '';
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
  const navMap = new Map(NAV.map(([key, href, label]) => [key, { href, label }]));
  const activeGroup = NAV_GROUPS.find((group) => group.items.includes(active))?.id || 'overview';
  const nav = NAV_GROUPS.map((group) => {
    const isOpen = group.id === activeGroup;
    const items = group.items.map((key) => {
      const item = navMap.get(key);
      if (!item) return '';
      return `<a href="${item.href}" class="nav-item${active === key ? ' active' : ''}" title="${esc(item.label)}"><span class="nav-item-icon" aria-hidden="true">${NAV_MARKS[key] || '•'}</span><span class="nav-item-label">${esc(item.label)}</span></a>`;
    }).join('');
    return `<section class="nav-group${isOpen ? ' is-open' : ''}" data-nav-group="${group.id}"><button class="nav-group-toggle" type="button" data-nav-group-toggle="${group.id}" aria-expanded="${isOpen ? 'true' : 'false'}"><span class="nav-group-label">${esc(group.label)}</span><span class="nav-group-chevron" aria-hidden="true">⌄</span></button><div class="nav-group-items">${items}</div></section>`;
  }).join('');
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
<link rel="stylesheet" href="/admin.css?v=20261005-admin-redesign-v2">
${head}
</head>
<body>
  <div class="admin-shell">
  <div class="topbar">
    <button class="nav-toggle-admin" id="sideToggle" type="button" aria-expanded="false" aria-controls="adminNav" aria-label="القائمة">
      <span></span><span></span><span></span>
    </button>
    <div class="topbar-context"><strong>لوحة الإدارة</strong><span>${esc(title)}</span></div>
    <form class="admin-global-search" action="/admin/materials" method="get" role="search"><span class="admin-global-search-icon" aria-hidden="true">⌕</span><input name="q" type="search" placeholder="ابحث في المواد..." aria-label="البحث في المواد"><kbd>Ctrl K</kbd></form>
    <div class="topbar-actions"><a class="btn btn-primary btn-sm topbar-add" href="/admin/materials/new">+ مادة جديدة</a><a class="topbar-review-link" href="/admin/review"><span aria-hidden="true">✓</span><span>المراجعة</span></a>${THEME_TOGGLE_ADMIN}<details class="admin-account-menu"><summary><span class="account-avatar" aria-hidden="true">${esc(String(user?.display_name || user?.username || 'م').slice(0, 1))}</span><span class="admin-account-name">${esc(user?.display_name || user?.username || 'المدير')}</span><span class="admin-account-chevron" aria-hidden="true">⌄</span></summary><div class="admin-account-dropdown"><strong>${esc(user?.display_name || user?.username || 'المدير')}</strong><span class="muted small">${esc(user?.role || 'admin')}</span><a href="/admin/users">إدارة الحسابات</a><button id="btnLogout" type="button">تسجيل الخروج</button></div></details></div>
  </div>
  <aside class="sidebar" id="adminNav">
    <div class="brand">
      <div class="brand-head">
        <a class="brand-link" href="/admin" aria-label="لوحة التحكم">
          <span class="brand-mark" aria-hidden="true">س</span>
          <span class="brand-copy"><span class="brand-name">سِجِل</span><span class="brand-sub">لوحة الإدارة</span></span>
        </a>
        <button class="sidebar-collapse" id="sidebarCollapse" type="button" aria-expanded="true" aria-controls="adminNav" aria-label="طي القائمة الجانبية" title="طي القائمة الجانبية"><span aria-hidden="true">‹</span></button>
      </div>
    </div>
    <nav class="nav" aria-label="أقسام لوحة الإدارة">${nav}</nav>
    <div class="side-foot">
      <div class="who"><span class="side-user-label">جلسة الإدارة</span><strong>${esc(user?.username || '')}</strong></div>
      <a class="side-account-link" href="/admin/users">إدارة الحسابات ←</a>
    </div>
  </aside>
  <main class="main">
    <div class="toast-zone" id="toastZone" aria-live="polite"></div>
    ${body}
  </main>
</div>
<script src="/admin.js?v=20261005-admin-redesign-v1" defer></script>
</body>
</html>`;
}

const PAGE_DESCRIPTIONS = {
  'لوحة التحكم': 'نظرة تشغيلية سريعة على الأرشيف، وما يحتاج إلى قرار أو متابعة الآن.',
  'المواد': 'إدارة الوثائق والكتب والصور والمخطوطات المحفوظة في سِجِل.',
  'طابور المراجعة': 'راجع المواد الواردة واتخذ قرار النشر أو طلب التعديل.',
  'صحة المحتوى': 'تحقق من اكتمال البيانات والملفات المرتبطة بكل مادة.',
  'طابور إصلاح المحتوى': 'تابع النواقص الفنية والمواد التي تحتاج إلى مصدر أو معالجة.',
  'الترجمة': 'أدر محرك الترجمة والوظائف والملفات اليدوية من مساحة واحدة.',
  'المستخدمون': 'إدارة حسابات المديرين والباحثين وحالات الوصول.',
  'بلاغات المجتمع': 'راجع البلاغات الواردة من مساحة الباحثين وسجل قرارات المعالجة.',
  'سجل العمليات': 'تتبع التغييرات الإدارية المهمة مع تفاصيل قابلة للمراجعة.',
};
function pageHead(title, extra = '', description = '') {
  const pageDescription = description || PAGE_DESCRIPTIONS[title] || '';
  const breadcrumb = title === 'لوحة التحكم'
    ? '<span>الرئيسية</span>'
    : `<a href="/admin">لوحة التحكم</a><span aria-hidden="true">›</span><span>${esc(title)}</span>`;
  return `<div class="page-head"><div class="page-head-copy"><div class="breadcrumbs" aria-label="مسار الصفحة">${breadcrumb}</div><h1>${esc(title)}</h1>${pageDescription ? `<p class="page-head-description">${esc(pageDescription)}</p>` : ''}</div><div class="page-actions">${extra}</div></div>`;
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
<link rel="stylesheet" href="/admin.css?v=20261004-admin-ui-v6">
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
<script src="/admin.js?v=20261004-material-edit-requests-v3" defer></script>
</body>
</html>`;
}

// ---------- 2) لوحة التحكم ----------
async function dashboardPage(env, user, req) {
  const db = env.DB;
  const requestedDays = Number(new URL(req?.url || 'https://sidjil.org/admin').searchParams.get('days'));
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
  const activityStatement = days === 7
    ? db.prepare(`SELECT substr(created_at, 1, 10) AS bucket, substr(created_at, 6, 5) AS label, COUNT(*) AS c
      FROM materials WHERE created_at >= date('now', ?) GROUP BY bucket ORDER BY bucket`).bind(`-${days - 1} day`)
    : db.prepare(`SELECT strftime('%Y-%W', created_at) AS bucket, strftime('%W', created_at) AS label, COUNT(*) AS c
      FROM materials WHERE created_at >= date('now', ?) GROUP BY bucket ORDER BY bucket`).bind(`-${days - 1} day`);
  const [publishedCount, reviewCount, repairCount, trlPending, trlFailed, reportsOpen, visitorsToday, latest, audits, activity] = await Promise.all([
    db.prepare("SELECT COUNT(*) c FROM materials WHERE publish_status='published'").first(),
    db.prepare("SELECT COUNT(*) c FROM materials WHERE publish_status='in_review'").first(),
    db.prepare("SELECT COUNT(*) c FROM content_repair_queue WHERE status IN ('pending','processing','blocked')").first(),
    db.prepare("SELECT COUNT(*) c FROM translation_jobs WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED')").first().catch(() => ({ c: 0 })),
    db.prepare("SELECT COUNT(*) c FROM translation_jobs WHERE status='FAILED'").first().catch(() => ({ c: 0 })),
    db.prepare("SELECT COUNT(*) c FROM social_reports WHERE status IN ('open','reviewing')").first(),
    db.prepare("SELECT COUNT(DISTINCT visitor_hash) c FROM visitor_daily WHERE day=date('now')").first(),
    db.prepare(`SELECT id, ark, type, material_level, title_ar, publish_status, created_at
      FROM materials ORDER BY created_at DESC LIMIT 6`).all(),
    db.prepare(`SELECT a.id, a.action, a.target, a.created_at, u.username
      FROM audit_log a LEFT JOIN admin_users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 8`).all(),
    activityStatement.all(),
  ]);

  const metric = (row) => Number(row?.c || 0);
  const cards = [
    ['المواد المنشورة', metric(publishedCount), 'k-pub', '/admin/materials?status=published'],
    ['قيد المراجعة', metric(reviewCount), 'k-review', '/admin/review'],
    ['تحتاج إصلاحًا', metric(repairCount), 'k-draft', '/admin/content-repair'],
    ['الترجمات الجارية', metric(trlPending), 'k-trl', '/admin/translation?tab=jobs'],
    ['بلاغات مفتوحة', metric(reportsOpen), 'k-review', '/admin/social-reports?status=open'],
    ['زوار اليوم', metric(visitorsToday), 'k-total', '/admin/metrics'],
  ].map(([label, value, cls, href]) => `<a class="stat-card ${cls} dashboard-stat-link" href="${href}"><span class="stat-card-mark" aria-hidden="true"></span><div class="stat-num">${esc(value)}</div><div class="stat-label">${esc(label)}</div><span class="stat-card-arrow" aria-hidden="true">←</span></a>`).join('');

  const matRows = (latest.results || []).map(m => `
    <tr>
      <td class="mono">${esc(m.ark)}</td>
      <td><a href="/admin/materials/${m.id}">${esc(m.title_ar)}</a></td>
      <td>${esc(MATERIAL_LEVEL_LABELS[m.material_level] || TYPE_LABELS[m.type] || m.type)}</td>
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

  const attentionItems = [
    [metric(reviewCount), 'مواد بانتظار المراجعة', '/admin/review', 'k-review'],
    [metric(repairCount), 'عناصر تحتاج إصلاحًا', '/admin/content-repair', 'k-draft'],
    [metric(trlFailed), 'وظائف ترجمة فاشلة', '/admin/translation?tab=jobs', 'k-trl'],
    [metric(reportsOpen), 'بلاغات مجتمع مفتوحة', '/admin/social-reports?status=open', 'k-review'],
  ].filter(([value]) => value > 0).map(([value, label, href, cls]) => `<a class="attention-item ${cls}" href="${href}"><strong>${esc(value)}</strong><span>${esc(label)}</span><span aria-hidden="true">←</span></a>`).join('');
  const activityRows = activity.results || [];
  const maxActivity = Math.max(1, ...activityRows.map((row) => Number(row.c || 0)));
  const activityBuckets = days === 7
    ? Array.from({ length: 7 }, (_, index) => {
      const bucket = new Date(Date.now() - (6 - index) * 86400000).toISOString().slice(0, 10);
      const row = activityRows.find((item) => item.bucket === bucket);
      return { bucket, label: bucket.slice(5), count: Number(row?.c || 0) };
    })
    : activityRows.map((row) => ({ bucket: row.bucket, label: row.label, count: Number(row.c || 0) }));
  const activityBars = (activityBuckets.length ? activityBuckets : [{ bucket: '', label: '—', count: 0 }]).map(({ bucket, label, count }) => {
    const height = count ? Math.max(10, Math.round(count / maxActivity * 100)) : 4;
    return `<div class="activity-bar-wrap"><span class="activity-count">${count || ''}</span><i class="activity-bar" style="height:${height}%" title="${esc(bucket || label)}: ${count}"></i><small>${esc(label)}</small></div>`;
  }).join('');
  const activityRangeLinks = [7, 30, 90].map((range) => `<a class="dashboard-range-link${days === range ? ' is-active' : ''}" href="/admin?days=${range}"${days === range ? ' aria-current="page"' : ''}>${range} أيام</a>`).join('');
  const serviceRows = [
    ['D1', 'قاعدة البيانات', 'متصل', 'service-ok'],
    ['R2', 'الملفات والأصول', 'متصل', 'service-ok'],
    ['Worker', 'الواجهة والخدمات', 'نشط', 'service-ok'],
    ['Translation API', 'محرك الترجمة', env.TRANSLATION_SERVICE_URL ? 'مهيأ' : 'غير مهيأ', env.TRANSLATION_SERVICE_URL ? 'service-ok' : 'service-warn'],
  ].map(([name, label, state, cls]) => `<div class="service-row"><span class="service-dot ${cls}" aria-hidden="true"></span><div><strong>${esc(name)}</strong><small>${esc(label)}</small></div><b class="${cls}">${esc(state)}</b></div>`).join('');

  const body = `
  ${pageHead('لوحة التحكم', `<a class="btn btn-primary" href="/admin/materials/new">+ مادة جديدة</a>`)}
  <div class="stats dashboard-stats">${cards}</div>
  <section class="dashboard-attention card"><div class="section-head"><div><h2>يتطلب انتباهك</h2><p class="muted">أهم الأعمال التي تنتظر إجراءً إداريًا.</p></div><a class="btn btn-ghost btn-sm" href="/admin/review">فتح مركز العمل ←</a></div><div class="attention-list">${attentionItems || '<div class="dashboard-empty"><strong>لا توجد مهام عاجلة</strong><span>كل الطوابير الأساسية محدثة حاليًا.</span></div>'}</div></section>
  <div class="dashboard-grid">
    <section class="card dashboard-activity"><div class="section-head"><div><h2>نشاط المواد</h2><p class="muted">المواد المضافة خلال آخر ${days} أيام.</p></div><div class="dashboard-section-actions"><div class="dashboard-range-tabs" aria-label="النطاق الزمني">${activityRangeLinks}</div><a class="btn btn-ghost btn-sm" href="/admin/metrics">تفاصيل الأداء</a></div></div><div class="activity-chart activity-chart-${days}" aria-label="مخطط نشاط المواد">${activityBars}</div></section>
    <section class="card dashboard-services"><div class="section-head"><div><h2>حالة الخدمات</h2><p class="muted">آخر حالة متاحة من بيئة التشغيل الحالية.</p></div></div><div class="service-list">${serviceRows}</div></section>
  </div>
  <div class="grid-2 dashboard-lower-grid">
    <section class="card"><div class="section-head"><div><h2>أحدث المواد</h2><p class="muted">آخر العناصر التي دخلت الأرشيف.</p></div><a class="btn btn-ghost btn-sm" href="/admin/materials">عرض الكل</a></div><div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>العنوان</th><th>النوع</th><th>الحالة</th><th>أُضيفت</th></tr></thead><tbody>${matRows || '<tr><td colspan="5" class="muted">لا مواد بعد.</td></tr>'}</tbody></table></div></section>
    <section class="card"><div class="section-head"><div><h2>آخر العمليات</h2><p class="muted">نشاط الإدارة المسجل في النظام.</p></div><a class="btn btn-ghost btn-sm" href="/admin/audit">السجل الكامل</a></div><div class="table-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الهدف</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4" class="muted">لا عمليات مسجلة بعد.</td></tr>'}</tbody></table></div></section>
  </div>`;
  return layout({ title: 'لوحة التحكم', active: 'dashboard', user, body });
}

// ---------- صحة المحتوى والأصول ----------
function contentOpsTabs(active) {
  return `<nav class="admin-local-tabs" aria-label="وحدة جودة المحتوى"><a class="${active === 'health' ? 'is-active' : ''}" href="/admin/content-health">صحة المحتوى</a><a class="${active === 'repair' ? 'is-active' : ''}" href="/admin/content-repair">طابور الإصلاح</a></nav>`;
}
async function contentHealthPage(env, user, req) {
  const db = env.DB;
  const url = new URL(req.url);
  const status = ['all', 'published', 'draft'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'published';
  const type = String(url.searchParams.get('type') || '').trim();
  const level = Object.prototype.hasOwnProperty.call(MATERIAL_LEVELS, url.searchParams.get('level')) ? url.searchParams.get('level') : '';
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
  const issuesOnly = url.searchParams.get('issues') === 'only';
  const missingCoverExpr = `((m.material_level = 'archival_image' AND a.image_file_id IS NULL) OR (m.material_level IN ('archival_book_original','archival_book_unavailable','chadian_publication') AND a.cover_file_id IS NULL))`;
  const missingPdfExpr = `(m.material_level = 'archival_book_original' AND a.pdf_file_id IS NULL)`;
  const missingTextExpr = `(m.material_level = 'archival_text' AND a.pdf_file_id IS NULL AND COALESCE(length(trim(m.full_text)), 0) = 0 AND NOT EXISTS (SELECT 1 FROM transcriptions t WHERE t.material_id = m.id AND length(trim(t.text)) > 0))`;
  const issueExpr = `(${missingCoverExpr} OR ${missingPdfExpr} OR ${missingTextExpr} OR a.integrity_status = 'missing')`;
  const where = [];
  const binds = [];
  if (status !== 'all') { where.push('m.publish_status = ?'); binds.push(status); }
  if (type) { where.push('m.type = ?'); binds.push(type); }
  if (level) { where.push('m.material_level = ?'); binds.push(level); }
  if (q) { where.push('(m.ark LIKE ? OR m.title_ar LIKE ? OR m.title_orig LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (issuesOnly) {
    where.push(issueExpr);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [summary, rows] = await Promise.all([
    Promise.all([
      db.prepare(`SELECT COUNT(*) AS c FROM materials m ${status === 'all' ? '' : 'WHERE m.publish_status = ?'}`).bind(...(status === 'all' ? [] : [status])).first(),
      db.prepare(`SELECT COUNT(*) AS c FROM materials m LEFT JOIN material_assets_index a ON a.material_id = m.id ${status === 'all' ? 'WHERE ' : 'WHERE m.publish_status = ? AND '}${missingCoverExpr}`).bind(...(status === 'all' ? [] : [status])).first(),
      db.prepare(`SELECT COUNT(*) AS c FROM materials m LEFT JOIN material_assets_index a ON a.material_id = m.id ${status === 'all' ? 'WHERE ' : 'WHERE m.publish_status = ? AND '}${missingPdfExpr}`).bind(...(status === 'all' ? [] : [status])).first(),
      db.prepare(`SELECT COUNT(*) AS c FROM materials m ${status === 'all' ? 'WHERE ' : 'WHERE m.publish_status = ? AND '}${missingTextExpr}`).bind(...(status === 'all' ? [] : [status])).first(),
      db.prepare(`SELECT COUNT(*) AS c FROM materials m JOIN material_assets_index a ON a.material_id = m.id ${status === 'all' ? 'WHERE a.integrity_status = \'missing\'' : 'WHERE m.publish_status = ? AND a.integrity_status = \'missing\''}`).bind(...(status === 'all' ? [] : [status])).first(),
      db.prepare(`SELECT COUNT(*) AS c FROM translation_pages WHERE status = 'failed'`).first(),
      db.prepare(`SELECT COUNT(*) AS c FROM materials m LEFT JOIN material_assets_index a ON a.material_id = m.id ${status === 'all' ? 'WHERE ' : 'WHERE m.publish_status = ? AND '}${issueExpr}`).bind(...(status === 'all' ? [] : [status])).first(),
    ]),
    db.prepare(`SELECT m.id, m.ark, m.type, m.material_level, m.title_ar, m.title_orig, m.publish_status, m.updated_at,
      a.cover_file_id, a.pdf_file_id, a.image_file_id, a.text_file_id, a.integrity_status, a.checked_at,
      CASE WHEN COALESCE(length(trim(m.full_text)), 0) > 0 OR EXISTS (SELECT 1 FROM transcriptions t WHERE t.material_id = m.id AND length(trim(t.text)) > 0) THEN 1 ELSE 0 END AS has_text
      FROM materials m LEFT JOIN material_assets_index a ON a.material_id = m.id ${whereSql}
      ORDER BY CASE WHEN ${issueExpr} THEN 0 ELSE 1 END, m.updated_at DESC, m.id DESC LIMIT 250`).bind(...binds).all(),
  ]);
  const [allCount, missingCovers, missingPdfs, missingText, missingR2, failedPages, issueSummary] = summary;
  const cards = [
    ['المواد المفحوصة', allCount?.c || 0, 'k-total'],
    ['بلا غلاف', missingCovers?.c || 0, 'k-img'],
    ['كتب/مقالات بلا PDF', missingPdfs?.c || 0, 'k-draft'],
    ['بلا نص موثق', missingText?.c || 0, 'k-review'],
    ['ملفات R2 مفقودة', missingR2?.c || 0, 'k-trl'],
    ['صفحات ترجمة فاشلة', failedPages?.c || 0, 'k-review'],
  ].map(([label, value, cls]) => `<div class="stat-card ${cls}"><div class="stat-num">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`).join('');
  const rowsHtml = (rows.results || []).map((m) => {
    const issues = [];
    if (m.material_level === 'archival_image' && !m.image_file_id) issues.push('صورة');
    if (['archival_book_original', 'archival_book_unavailable', 'chadian_publication'].includes(m.material_level) && !m.cover_file_id) issues.push('غلاف');
    if (m.material_level === 'archival_book_original' && !m.pdf_file_id) issues.push('PDF');
    if (m.material_level === 'archival_text' && !Number(m.has_text)) issues.push('نص موثق');
    if (m.integrity_status === 'missing') issues.push('R2');
    const integrity = m.integrity_status === 'ok' ? '<span class="badge b-pub">R2 سليم</span>' : m.integrity_status === 'missing' ? '<span class="badge b-review">R2 مفقود</span>' : '<span class="badge b-draft">R2 غير مفحوص</span>';
    const checks = (m.material_level === 'archival_image' ? 1 : 0) + (['archival_book_original', 'archival_book_unavailable', 'chadian_publication'].includes(m.material_level) ? 1 : 0) + (m.material_level === 'archival_book_original' ? 1 : 0) + (m.material_level === 'archival_text' ? 1 : 0);
    const passed = checks - issues.length;
    const score = checks ? Math.max(0, Math.min(100, Math.round((passed / checks) * 100))) : 100;
    const scoreClass = score >= 100 ? 'health-good' : score >= 60 ? 'health-warn' : 'health-bad';
    const issueText = issues.length ? `<span class="health-issues">${esc(issues.join(' · '))}</span>` : '<span class="health-ok">سليمة مبدئيًا</span>';
    return `<tr><td class="mono small">${esc(m.ark)}</td><td><a href="/admin/materials/${m.id}">${esc(m.title_ar || m.title_orig || '—')}</a><br><span class="muted small">${esc(MATERIAL_LEVEL_LABELS[m.material_level] || TYPE_LABELS[m.type] || m.type)} · آخر تعديل ${esc(fmtDate(m.updated_at))}</span></td><td><div class="health-score ${scoreClass}"><strong>${score}%</strong><span><i style="width:${score}%"></i></span></div></td><td>${issueText}<div class="health-badges">${integrity}${m.checked_at ? `<span class="muted tiny">فُحص ${esc(fmtDate(m.checked_at))}</span>` : ''}</div></td><td><button class="btn btn-sm btn-ghost" type="button" data-integrity-check="${esc(m.id)}">فحص R2</button> <a class="btn btn-sm btn-ghost" href="/admin/materials/${m.id}">فحص وإصلاح</a></td></tr>`;
  }).join('');
  const typeOpts = Object.entries(TYPE_LABELS).map(([value, label]) => `<option value="${esc(value)}"${type === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const levelOpts = Object.entries(MATERIAL_LEVELS).map(([value, item]) => `<option value="${esc(value)}"${level === value ? ' selected' : ''}>${esc(item.ar)}</option>`).join('');
  const issueCount = Number(issueSummary?.c || 0);
  const cleanCount = Math.max(0, Number(allCount?.c || 0) - issueCount);
  const healthScore = Number(allCount?.c || 0) ? Math.round((cleanCount / Number(allCount.c)) * 100) : 100;
  const coverage = Object.entries(TYPE_LABELS).map(([kind, label]) => {
    const items = (rows.results || []).filter((m) => m.type === kind);
    if (!items.length) return '';
    const complete = items.filter((m) => !((m.material_level === 'archival_image' && !m.image_file_id) || (['archival_book_original', 'archival_book_unavailable', 'chadian_publication'].includes(m.material_level) && !m.cover_file_id) || (m.material_level === 'archival_book_original' && !m.pdf_file_id) || (m.material_level === 'archival_text' && !Number(m.has_text)) || m.integrity_status === 'missing')).length;
    const percent = Math.round((complete / items.length) * 100);
    return `<div class="health-coverage-row"><span>${esc(label)} <small>${items.length}</small></span><div class="health-coverage-track"><i style="width:${percent}%"></i></div><strong>${percent}%</strong></div>`;
  }).filter(Boolean).join('');
  const toggleParams = new URLSearchParams({ status });
  if (type) toggleParams.set('type', type);
  if (level) toggleParams.set('level', level);
  if (q) toggleParams.set('q', q);
  if (!issuesOnly) toggleParams.set('issues', 'only');
  const toggleHealthHref = `/admin/content-health?${esc(toggleParams.toString())}`;
  const toggleHealthLabel = issuesOnly ? 'عرض كل المواد' : 'عرض النواقص فقط';
  const body = `${pageHead('صحة المحتوى', '<a class="btn btn-ghost" href="/admin">← لوحة التحكم</a>')}${contentOpsTabs('health')}<div class="stats">${cards}</div>
  <section class="health-overview"><div class="health-score-card"><div class="health-score-ring ${healthScore >= 90 ? 'health-good' : healthScore >= 60 ? 'health-warn' : 'health-bad'}"><strong>${healthScore}%</strong><span>سلامة مبدئية</span></div><div><h2>حالة الأرشيف</h2><p>تم فحص ${esc(allCount?.c || 0)} مادة، وتحتاج ${esc(issueCount)} مادة إلى متابعة أو إصلاح.</p><a class="btn btn-sm btn-primary" href="/admin/content-repair">فتح طابور الإصلاح</a></div></div><div class="card health-coverage"><h2>التغطية حسب النوع</h2>${coverage || '<p class="muted">لا توجد مواد في هذا العرض.</p>'}</div></section>
  <section class="card"><div class="section-head"><div><h2>فحص المواد</h2><p class="muted">تُعرض المواد التي ينقصها غلاف أو PDF أو نص موثق أو ملف R2 أولًا. فحص R2 يقرأ الكائن المرتبط فقط.</p></div><a class="btn btn-ghost" href="${toggleHealthHref}">${toggleHealthLabel}</a></div>
  <form class="filters" method="get" action="/admin/content-health"><label class="field"><span>الحالة</span><select name="status"><option value="published"${status === 'published' ? ' selected' : ''}>المنشورة</option><option value="draft"${status === 'draft' ? ' selected' : ''}>المسودات</option><option value="all"${status === 'all' ? ' selected' : ''}>الكل</option></select></label><label class="field"><span>النوع الأرشيفي</span><select name="type"><option value="">كل الأنواع</option>${typeOpts}</select></label><label class="field"><span>تصنيف المادة</span><select name="level"><option value="">كل التصنيفات</option>${levelOpts}</select></label><label class="field"><span>بحث</span><input name="q" value="${esc(q)}" placeholder="العنوان أو الرمز"></label><label class="checkbox-field"><input type="checkbox" name="issues" value="only"${issuesOnly ? ' checked' : ''}><span>النواقص فقط</span></label><button class="btn btn-primary" type="submit">تصفية</button></form>
  <div class="table-wrap"><table class="tbl content-health-table"><thead><tr><th>الرمز</th><th>المادة</th><th>النتيجة</th><th>النواقص والفحص</th><th>إجراء</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" class="muted">لا توجد مواد مطابقة.</td></tr>'}</tbody></table></div></section>`;
  return layout({ title: 'صحة المحتوى', active: 'quality', user, body });
}

async function contentRepairPage(env, user, req) {
  await syncContentRepairQueue(env.DB);
  const url = new URL(req.url);
  const status = ['pending', 'processing', 'resolved', 'blocked', 'all'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
  const issueType = ['cover', 'pdf', 'text', 'asset', 'ocr', 'metadata'].includes(url.searchParams.get('issue_type')) ? url.searchParams.get('issue_type') : '';
  const where = [];
  const binds = [];
  if (status !== 'all') { where.push('q.status = ?'); binds.push(status); }
  if (issueType) { where.push('q.issue_type = ?'); binds.push(issueType); }
  const rows = await env.DB.prepare(`SELECT q.id, q.material_id, q.issue_type, q.status, q.source_file_id, q.note, q.created_at, q.updated_at,
      m.ark, m.title_ar, m.type, m.publish_status
      FROM content_repair_queue q JOIN materials m ON m.id = q.material_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE q.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END, q.updated_at DESC, q.id DESC LIMIT 300`).bind(...binds).all();
  const issueLabels = { cover: 'غلاف/صورة', pdf: 'ملف PDF', text: 'تفريغ نصي', asset: 'ملف مفقود', ocr: 'OCR', metadata: 'بيانات وصفية' };
  const statusLabels = { pending: 'معلّق', processing: 'قيد المعالجة', resolved: 'مكتمل', blocked: 'متوقف' };
  const bodyRows = (rows.results || []).map(r => `<tr data-repair-row="${esc(r.id)}"><td class="mono">#${esc(r.id)}</td><td><a href="/admin/materials/${esc(r.material_id)}">${esc(r.title_ar || r.ark)}</a><br><span class="muted small">${esc(r.ark)} · ${esc(TYPE_LABELS[r.type] || r.type)}</span></td><td>${esc(issueLabels[r.issue_type] || r.issue_type)}</td><td><select data-repair-status="${esc(r.id)}" aria-label="حالة عنصر الإصلاح">${Object.entries(statusLabels).map(([v, label]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${label}</option>`).join('')}</select></td><td><input class="repair-source-file" type="number" min="1" data-repair-source="${esc(r.id)}" value="${esc(r.source_file_id || '')}" placeholder="معرف الملف" aria-label="معرف ملف المصدر"><textarea class="repair-note" rows="2" data-repair-note="${esc(r.id)}" placeholder="ملاحظة المصدر أو الإجراء">${esc(r.note || '')}</textarea></td><td class="muted">${fmtDate(r.updated_at || r.created_at)}</td><td><button class="btn btn-sm btn-primary" type="button" data-repair-save="${esc(r.id)}">حفظ</button></td></tr>`).join('');
  const body = `${pageHead('طابور إصلاح المحتوى', '<a class="btn btn-ghost" href="/admin/content-health">← صحة المحتوى</a>')}${contentOpsTabs('repair')}<section class="card"><div class="section-head"><div><h2>نواقص تحتاج قرارًا أو مصدرًا</h2><p class="muted">يُنشئ النظام العناصر من النقص المرصود فقط. شغّل التصنيف الآلي لتحديث العناصر غير المنطبقة وربط ملفات PDF المرشحة لـOCR، ثم راجع كل تفريغ قبل اعتماده.</p></div><button class="btn btn-primary" type="button" data-repair-triage>تصنيف الطابور آليًا</button></div><form class="filters" method="get" action="/admin/content-repair"><label class="field"><span>الحالة</span><select name="status"><option value="pending"${status === 'pending' ? ' selected' : ''}>معلّق</option><option value="processing"${status === 'processing' ? ' selected' : ''}>قيد المعالجة</option><option value="blocked"${status === 'blocked' ? ' selected' : ''}>متوقف</option><option value="resolved"${status === 'resolved' ? ' selected' : ''}>مكتمل</option><option value="all"${status === 'all' ? ' selected' : ''}>الكل</option></select></label><label class="field"><span>نوع النقص</span><select name="issue_type"><option value="">الكل</option>${Object.entries(issueLabels).map(([v, l]) => `<option value="${v}"${issueType === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><button class="btn btn-primary" type="submit">تصفية</button></form><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>المادة</th><th>النقص</th><th>الحالة</th><th>المصدر / الملاحظة</th><th>آخر تحديث</th><th>إجراء</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="7" class="muted">لا توجد عناصر في هذا العرض.</td></tr>'}</tbody></table></div></section>`;
  return layout({ title: 'طابور إصلاح المحتوى', active: 'repair', user, body });
}

async function metricsPage(env, user, req) {
  const db = env.DB;
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7));
  const [metrics, translation, reports, assets, jobs] = await Promise.all([
    db.prepare(`SELECT route, query_key, SUM(calls) AS calls, SUM(errors) AS errors, SUM(total_duration_ms) AS duration_ms, MAX(max_duration_ms) AS max_duration_ms, SUM(total_rows) AS rows_read
      FROM query_metrics_daily WHERE day >= date('now', ?) GROUP BY route, query_key ORDER BY rows_read DESC, duration_ms DESC LIMIT 100`).bind(`-${days} day`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT status, COUNT(*) AS c FROM translation_jobs GROUP BY status`).all().catch(() => ({ results: [] })),
    db.prepare(`SELECT status, COUNT(*) AS c FROM social_reports GROUP BY status`).all(),
    db.prepare(`SELECT integrity_status, COUNT(*) AS c FROM material_assets_index GROUP BY integrity_status`).all(),
    db.prepare(`SELECT status, COUNT(*) AS c FROM translation_pages GROUP BY status`).all(),
  ]);
  const metricRows = (metrics.results || []).map(row => `<tr><td>${esc(row.route)}</td><td class="mono small">${esc(row.query_key)}</td><td>${esc(row.calls || 0)}</td><td>${esc(row.rows_read || 0)}</td><td>${esc(row.duration_ms || 0)} ms</td><td>${esc(row.max_duration_ms || 0)} ms</td><td>${esc(row.errors || 0)}</td></tr>`).join('');
  const chips = (rows, labels) => (Array.isArray(rows) ? rows : (rows.results || [])).map(row => `<span class="metric-chip"><strong>${esc(labels[row.status] || row.status || row.integrity_status)}</strong><b>${esc(row.c || 0)}</b></span>`).join('');
  const cards = [
    ['البلاغات المفتوحة', (reports.results || []).find(r => r.status === 'open')?.c || 0],
    ['صفحات ترجمة فاشلة', (jobs.results || []).find(r => r.status === 'failed')?.c || 0],
    ['وظائف ترجمة فاشلة', (translation.results || []).find(r => r.status === 'FAILED')?.c || 0],
    ['ملفات بحالة مفقودة', (assets.results || []).find(r => r.integrity_status === 'missing')?.c || 0],
  ].map(([label, value]) => `<div class="stat-card"><div class="stat-num">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`).join('');
  const body = `${pageHead('مؤشرات الأداء', `<a class="btn btn-ghost" href="/admin">← لوحة التحكم</a>`)}<div class="stats">${cards}</div>
  <section class="card"><div class="section-head"><div><h2>حالة الأنظمة</h2><p class="muted">تُعرض المؤشرات المجمعة دون حفظ نصوص الاستعلامات أو بيانات المستخدمين.</p></div><form class="inline-form" method="get"><label>الفترة <select name="days"><option value="1"${days === 1 ? ' selected' : ''}>24 ساعة</option><option value="7"${days === 7 ? ' selected' : ''}>7 أيام</option><option value="30"${days === 30 ? ' selected' : ''}>30 يومًا</option><option value="90"${days === 90 ? ' selected' : ''}>90 يومًا</option></select></label><button class="btn btn-sm" type="submit">تحديث</button></form></div><div class="metric-chip-row">${chips(translation.results || [], { QUEUED: 'في الانتظار', COMPLETED: 'مكتملة', FAILED: 'فاشلة', CANCELLED: 'ملغاة' })}${chips(jobs.results || [], { pending: 'صفحات معلقة', completed: 'صفحات مكتملة', failed: 'صفحات فاشلة' })}${chips(reports.results || [], { open: 'بلاغات مفتوحة', reviewing: 'بلاغات قيد المعالجة', resolved: 'بلاغات مغلقة', dismissed: 'بلاغات مرفوضة' })}</div></section>
  <section class="card"><h2>قياس الاستعلامات وRows Read</h2><p class="muted">يسجل الجدول قيمة <code>meta.rows_read</code> التي تعيدها D1 عندما تكون متاحة، ويستخدم عدد الصفوف المعادة كبديل في البيئات التي لا توفر بيانات التعريف. أما إجمالي الفوترة على مستوى الحساب فيراجَع من تحليلات Cloudflare.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>المسار</th><th>مفتاح الاستعلام</th><th>الطلبات</th><th>Rows Read من D1</th><th>الزمن الكلي</th><th>أقصى زمن</th><th>الأخطاء</th></tr></thead><tbody>${metricRows || '<tr><td colspan="7" class="muted">لا توجد قياسات مجمعة بعد. ستظهر بعد مرور طلبات البحث العامة.</td></tr>'}</tbody></table></div></section>`;
  return layout({ title: 'مؤشرات الأداء', active: 'metrics', user, body });
}

// ---------- الترجمة: مؤشرات الكاش والـJobs ----------
async function translationPage(env, user, req) {
  const body = `${pageHead('الترجمة', '<a class="btn btn-ghost" href="/admin">← لوحة التحكم</a>')}<nav class="translation-admin-tabs" data-translation-tabs role="tablist"><button class="translation-admin-tab is-active" data-translation-tab="overview">نظرة عامة</button><button class="translation-admin-tab" data-translation-tab="upload">رفع نظير Word</button><button class="translation-admin-tab" data-translation-tab="requests">طلبات الترجمة</button></nav><section class="card translation-tab-panel" data-translation-panel="overview"><div class="section-head"><div><h2>ملفات الترجمة اليدوية</h2><p class="muted">تصنيف الملفات الأصلية وإدارة نظائر Word المرفوعة.</p></div><button class="btn btn-sm" data-translation-refresh>تحديث</button></div><form class="translation-search" data-translation-search-form role="search"><label class="field"><span>بحث في المواد والملفات</span><input type="search" name="q" data-translation-search placeholder="العنوان أو الرمز الأرشيفي أو اسم الملف" autocomplete="off"></label></form><div class="translation-stats" data-translation-stats></div><div class="table-wrap"><table class="tbl"><thead><tr><th>المادة</th><th>الملف</th><th>لغة الأصل</th><th>النظائر</th><th>إجراء</th></tr></thead><tbody data-translation-files><tr><td colspan="5" class="muted">جارٍ التحميل…</td></tr></tbody></table></div></section><section class="card translation-tab-panel" data-translation-panel="upload" hidden><h2>رفع نظير ترجمة</h2><p class="muted">اختر رقم الملف الأصلي من تبويب النظرة العامة، ثم ارفع ملف Word المنسق.</p><form data-translation-upload enctype="multipart/form-data"><label class="field"><span>معرف الملف الأصلي</span><input type="number" name="source_file_id" required></label><label class="field"><span>لغة الأصل</span><select name="source_lang"><option value="fr">الفرنسية</option><option value="ar">العربية</option><option value="en">الإنجليزية</option></select></label><label class="field"><span>لغة الترجمة</span><select name="target_lang"><option value="ar">العربية</option><option value="fr">الفرنسية</option></select></label><label class="field"><span>ملف Word (.docx)</span><input type="file" name="file" accept=".docx" required></label><button class="btn btn-primary" type="submit">رفع وحفظ</button><span data-translation-upload-status aria-live="polite"></span></form></section><section class="card translation-tab-panel" data-translation-panel="requests" hidden><div class="section-head"><div><h2>طلبات الترجمة</h2><p class="muted">طلبات زوار الموقع والباحثين، مع بيانات التواصل اللازمة للمتابعة.</p></div><button class="btn btn-sm" data-translation-requests-refresh>تحديث</button></div><div class="table-wrap"><table class="tbl"><thead><tr><th>المادة</th><th>الملف</th><th>طالب الترجمة</th><th>اللغة المطلوبة</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody data-translation-requests><tr><td colspan="6" class="muted">جارٍ التحميل…</td></tr></tbody></table></div></section><script type="module" src="/js/admin-manual-translations.js?v=20261005-requests-v2"></script>`;
  return layout({ title: 'الترجمة', active: 'translation', user, body });
}

// ---------- 3) قائمة المواد ----------
async function materialsListPage(env, user, req) {
  const url = new URL(req.url);
  const allowedStatuses = ['', 'published', 'draft', 'in_review', 'changes_requested', 'hidden'];
  const status = allowedStatuses.includes(url.searchParams.get('status')) ? (url.searchParams.get('status') || '') : '';
  const type = url.searchParams.get('type') || '';
  const level = Object.prototype.hasOwnProperty.call(MATERIAL_LEVELS, url.searchParams.get('level')) ? url.searchParams.get('level') : '';
  const q = (url.searchParams.get('q') || '').trim();

  const where = [];
  const args = [];
  if (status) { where.push('publish_status = ?'); args.push(status); }
  if (type) { where.push('type = ?'); args.push(type); }
  if (level) { where.push('material_level = ?'); args.push(level); }
  if (q) { where.push('(title_ar LIKE ? OR title_orig LIKE ? OR ark LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `SELECT id, ark, type, material_level, title_ar, publish_status, year, created_at
    FROM materials ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT 200`;
  const [rowResult, statusCounts] = await Promise.all([
    env.DB.prepare(sql).bind(...args).all(),
    env.DB.prepare(`SELECT publish_status, COUNT(*) AS c FROM materials GROUP BY publish_status`).all(),
  ]);
  const rows = rowResult.results || [];
  const counts = Object.fromEntries((statusCounts.results || []).map((row) => [row.publish_status, Number(row.c || 0)]));

  const opt = (val, cur, label) => `<option value="${val}"${val === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const typeOpts = Object.entries(TYPE_LABELS).map(([v, l]) => opt(v, type, l)).join('');
  const statusOpts = Object.entries(STATUS_LABELS).map(([v, l]) => opt(v, status, l)).join('');
  const materialTabParams = (nextStatus = '', options = {}) => {
    const params = new URLSearchParams();
    if (nextStatus) params.set('status', nextStatus);
    if (options.keepType !== false && type) params.set('type', type);
    if (options.keepLevel !== false && level) params.set('level', level);
    if (options.keepQ !== false && q) params.set('q', q);
    const query = params.toString();
    return `/admin/materials${query ? `?${esc(query)}` : ''}`;
  };
  const materialTabs = [['', 'الكل'], ['published', 'منشورة'], ['draft', 'مسودات'], ['in_review', 'قيد المراجعة'], ['changes_requested', 'مطلوب تعديل'], ['hidden', 'مخفية']].map(([value, label]) => `<a class="admin-filter-tab${status === value ? ' is-active' : ''}" href="${materialTabParams(value)}"${status === value ? ' aria-current="page"' : ''}>${esc(label)} <small>${esc(value ? (counts[value] || 0) : Object.values(counts).reduce((sum, count) => sum + count, 0))}</small></a>`).join('');
  const filterChips = [
    q ? `<a class="filter-chip" href="${materialTabParams(status, { keepQ: false })}">بحث: ${esc(q)} ×</a>` : '',
    type ? `<a class="filter-chip" href="${materialTabParams(status, { keepType: false })}">النوع: ${esc(TYPE_LABELS[type] || type)} ×</a>` : '',
    level ? `<a class="filter-chip" href="${materialTabParams(status, { keepLevel: false })}">التصنيف: ${esc(MATERIAL_LEVEL_LABELS[level] || level)} ×</a>` : '',
    status ? `<a class="filter-chip" href="${materialTabParams('')}">الحالة: ${esc(STATUS_LABELS[status] || status)} ×</a>` : '',
  ].filter(Boolean).join('');

  const bodyRows = rows.map(m => `
    <tr>
      <td class="mono small">${esc(m.ark)}</td>
      <td><a href="/admin/materials/${m.id}">${esc(m.title_ar)}</a></td>
      <td>${esc(MATERIAL_LEVEL_LABELS[m.material_level] || TYPE_LABELS[m.type] || m.type)}</td>
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
  <nav class="admin-filter-tabs" aria-label="حالات المواد">${materialTabs}</nav>
  <form class="filters card" method="get" action="/admin/materials">
    <div class="filter-row">
      <input type="search" name="q" value="${esc(q)}" placeholder="بحث بالعنوان أو الرقم الأرشيفي…">
      <select name="type"><option value="">كل الأنواع</option>${typeOpts}</select>
      <select name="level"><option value="">كل التصنيفات</option>${Object.entries(MATERIAL_LEVELS).map(([v, item]) => opt(v, level, item.ar)).join('')}</select>
      <select name="status"><option value="">كل الحالات</option>${statusOpts}</select>
      <button class="btn" type="submit">تصفية</button>
      <a class="btn btn-ghost" href="/admin/materials">مسح</a>
    </div>
    ${filterChips ? `<div class="filter-chips" aria-label="الفلاتر النشطة">${filterChips}</div>` : ''}
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
      db.prepare('SELECT id FROM file_translations WHERE material_id = ? ORDER BY updated_at DESC').bind(m.id).all().catch(() => ({ results: [] })),
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
        <div class="field"><label>العنوان بالفرنسية</label><input name="title_fr" dir="ltr" lang="fr" value="${val('title_fr')}" placeholder="Titre français"></div>
        <div class="field"><label>العنوان الأصلي</label><input name="title_orig" dir="auto" value="${val('title_orig')}"></div>
        <div class="field-row">
          <div class="field"><label>نوع المادة الأرشيفي *</label><select name="type">${sel('type', TYPE_LABELS)}</select><small class="muted">يحدد الرمز الأرشيفي مثل وثيقة أو كتاب أو صورة.</small></div>
          <div class="field"><label>مستوى المادة *</label><select name="material_level" required>${Object.entries(MATERIAL_LEVELS).map(([v, item]) => `<option value="${esc(v)}"${(m?.material_level || (m?.type === 'image' ? 'archival_image' : m?.type === 'book' ? 'archival_book_original' : 'archival_text')) === v ? ' selected' : ''}>${esc(item.ar)}</option>`).join('')}</select><small class="muted">${esc(materialLevelDescription(m?.material_level || 'archival_text'))}</small></div>
          <div class="field"><label>اللغة</label><input name="language" dir="ltr" placeholder="fr / ar" value="${val('language')}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>السنة</label><input name="year" type="number" dir="ltr" value="${val('year')}"></div>
          <div class="field"><label>التاريخ (عرض حر)</label><input name="date_text" value="${val('date_text')}" placeholder="6 ديسمبر 1951"></div>
          <div class="field"><label>التاريخ بالفرنسية</label><input name="date_text_fr" dir="ltr" lang="fr" value="${val('date_text_fr')}" placeholder="6 décembre 1951"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>درجة ثقة التاريخ</label><select name="date_confidence">${confOpts}</select></div>
          <div class="field"><label>المؤلف / الجهة</label><input name="author" dir="auto" value="${val('author')}"></div>
          <div class="field"><label>المصور</label><input name="photographer" dir="auto" value="${val('photographer')}"></div>
        </div>
        <div class="field"><label>الوصف العلمي بالعربية</label><textarea name="description" rows="4" dir="auto">${val('description')}</textarea></div>
        <div class="field"><label>الوصف العلمي بالفرنسية</label><textarea name="description_fr" rows="4" dir="ltr" lang="fr">${val('description_fr')}</textarea></div>
        <div class="field-row">
          <div class="field"><label>الملخص بالعربية</label><textarea name="summary" rows="3" dir="auto">${val('summary')}</textarea></div>
          <div class="field"><label>الملخص بالفرنسية</label><textarea name="summary_fr" rows="3" dir="ltr" lang="fr">${val('summary_fr')}</textarea></div>
        </div>
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
    cols: [['name_ar', 'الاسم بالعربية'], ['name_fr', 'الاسم الفرنسي'], ['name_orig', 'الاسم الأصلي'], ['identity_confidence', 'هوية'], ['bio', 'نبذة']],
    fields: [
      { name: 'name_ar', label: 'الاسم بالعربية *', req: true },
      { name: 'name_fr', label: 'الاسم بالفرنسية', dir: 'ltr' },
      { name: 'name_orig', label: 'الاسم الأصلي', dir: 'auto' },
      { name: 'identity_confidence', label: 'درجة ثقة الهوية', type: 'select', options: { confirmed: 'مؤكدة', probable: 'محتملة', unknown: 'غير معروفة' } },
      { name: 'birth_year', label: 'سنة الميلاد', type: 'number', dir: 'ltr' },
      { name: 'death_year', label: 'سنة الوفاة', type: 'number', dir: 'ltr' },
      { name: 'bio', label: 'نبذة / سيرة', type: 'textarea' },
    ],
  },
  places: {
    title: 'الأماكن', singular: 'مكان',
    cols: [['name_ar', 'الاسم بالعربية'], ['name_fr', 'الاسم الفرنسي'], ['name_orig', 'الاسم الأصلي'], ['region', 'المنطقة'], ['place_confidence', 'المكان']],
    fields: [
      { name: 'name_ar', label: 'الاسم بالعربية *', req: true },
      { name: 'name_fr', label: 'الاسم بالفرنسية', dir: 'ltr' },
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
    cols: [['name', 'الاسم الأصلي'], ['name_ar', 'الاسم بالعربية'], ['name_fr', 'الاسم الفرنسي'], ['kind', 'النوع']],
    fields: [
      { name: 'name', label: 'الاسم الأصلي *', req: true, dir: 'auto' },
      { name: 'name_ar', label: 'الاسم بالعربية' },
      { name: 'name_fr', label: 'الاسم بالفرنسية', dir: 'ltr' },
      { name: 'kind', label: 'النوع', type: 'select', options: { archive: 'أرشيف', library: 'مكتبة', museum: 'متحف', private: 'مجموعة خاصة', web: 'مصدر ويب', press: 'صحافة' } },
      { name: 'website', label: 'الموقع', dir: 'ltr', type: 'url' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
  },
  tags: {
    title: 'الكلمات المفتاحية', singular: 'كلمة مفتاحية',
    cols: [['name_ar', 'بالعربية'], ['name_fr', 'بالفرنسية'], ['name_orig', 'بالأصلية']],
    fields: [
      { name: 'name_ar', label: 'الكلمة بالعربية *', req: true },
      { name: 'name_fr', label: 'الكلمة بالفرنسية', dir: 'ltr' },
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
        <button class="btn btn-sm btn-ghost" data-review-changes="${m.id}" data-review-title="${esc(m.title_ar || m.title_orig || '')}" type="button">طلب تعديل</button>
        <button class="btn btn-sm btn-ghost" data-review-reject="${m.id}" data-review-title="${esc(m.title_ar || m.title_orig || '')}" type="button">إعادة بملاحظة</button>
      </td>
    </tr>`).join('');

  const body = `
  ${pageHead('طابور المراجعة', `<span class="muted">${items.length} مادة بانتظار القرار</span>`)}
  <nav class="admin-local-tabs" aria-label="أقسام المراجعة"><a class="is-active" href="#review-queue">المواد الجديدة <small>${items.length}</small></a><a href="#edit-requests">طلبات تعديل المواد المنشورة <small>${(editRequests.results || []).length}</small></a></nav>
  <section id="edit-requests" class="card"><div class="section-head"><div><h2>طلبات تعديل المواد المنشورة</h2><p class="muted">طلبات الباحثين التي تحتاج قرارًا قبل فتح التعديل.</p></div></div><div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>المادة</th><th>الباحث</th><th>تاريخ الطلب</th><th>القرار</th></tr></thead>
    <tbody>${editRequestRows || '<tr><td colspan="5" class="muted">لا توجد طلبات تعديل معلقة.</td></tr>'}</tbody></table></div>
  </section>
  <section id="review-queue" class="card">
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>الرقم</th><th>العنوان</th><th>النوع</th><th>الباحث</th><th>أُرسلت</th><th>القرار</th></tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="6" class="muted">لا مواد قيد المراجعة — الطابور فارغ.</td></tr>'}</tbody>
    </table></div></section>
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
async function usersPage(env, user, req) {
  const view = ['all', 'researchers', 'admins', 'inactive'].includes(new URL(req.url).searchParams.get('view')) ? new URL(req.url).searchParams.get('view') : 'all';
  const userWhere = view === 'researchers' ? "WHERE u.role = 'researcher'" : view === 'admins' ? "WHERE u.role = 'admin'" : view === 'inactive' ? 'WHERE u.is_active = 0' : '';
  const [rows, counts] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id, u.username, u.role, u.is_active, u.is_verified, u.verification_type, u.display_name, u.affiliation, u.created_at,
              (SELECT COUNT(*) FROM materials m WHERE m.created_by = u.id) AS materials_count
       FROM admin_users u ${userWhere} ORDER BY u.id ASC`).all(),
    env.DB.prepare(`SELECT role, is_active, COUNT(*) AS c FROM admin_users GROUP BY role, is_active`).all(),
  ]);
  const countFor = (role, active) => Number((counts.results || []).find((row) => row.role === role && Number(row.is_active) === active)?.c || 0);
  const allUsers = (counts.results || []).reduce((sum, row) => sum + Number(row.c || 0), 0);
  const userTabs = [['all', 'الكل', allUsers], ['researchers', 'الباحثون', countFor('researcher', 1)], ['admins', 'المديرون', countFor('admin', 1)], ['inactive', 'غير النشطين', (counts.results || []).filter((row) => Number(row.is_active) === 0).reduce((sum, row) => sum + Number(row.c || 0), 0)]].map(([value, label, count]) => `<a class="admin-filter-tab${view === value ? ' is-active' : ''}" href="/admin/users?view=${value}"${view === value ? ' aria-current="page"' : ''}>${esc(label)} <small>${esc(count)}</small></a>`).join('');
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
  <nav class="admin-filter-tabs" aria-label="فئات المستخدمين">${userTabs}</nav>
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

async function socialReportsPage(env, user, req) {
  const status = ['open', 'reviewing', 'resolved', 'dismissed', 'all'].includes(new URL(req.url).searchParams.get('status')) ? new URL(req.url).searchParams.get('status') : 'open';
  const where = status === 'all' ? '' : 'WHERE r.status = ?';
  const rows = await env.DB.prepare(`SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at,
    reporter.display_name AS reporter_name, reporter.username AS reporter_username,
    CASE WHEN r.target_type = 'material' THEN (SELECT title_ar FROM materials WHERE id = r.target_id)
      WHEN r.target_type = 'discussion' THEN (SELECT title FROM discussions WHERE id = r.target_id)
      WHEN r.target_type = 'reply' THEN (SELECT substr(body, 1, 140) FROM discussion_replies WHERE id = r.target_id)
      WHEN r.target_type = 'researcher' THEN (SELECT display_name FROM admin_users WHERE id = r.target_id) END AS target_title
    FROM social_reports r JOIN admin_users reporter ON reporter.id = r.reporter_id ${where}
    ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at ASC LIMIT 200`).bind(...(status === 'all' ? [] : [status])).all();
  const state = { open: 'مفتوح', reviewing: 'قيد المعالجة', resolved: 'تمت المعالجة', dismissed: 'مرفوض' };
  const bodyRows = (rows.results || []).map(r => `<tr data-social-report-row="${r.id}"><td class="mono">#${r.id}</td><td><strong>${esc(r.target_title || `${r.target_type}:${r.target_id}`)}</strong><br><span class="muted small">${esc(r.target_type)} · ${esc(r.reason)}</span>${r.note ? `<br><span class="muted small">${esc(r.note)}</span>` : ''}</td><td>${esc(r.reporter_name || r.reporter_username || '—')}</td><td>${badge(state[r.status] || r.status, r.status === 'open' ? 'b-review' : r.status === 'resolved' ? 'b-pub' : 'b-hidden')}</td><td class="muted">${fmtDate(r.created_at)}</td><td class="row-actions"><select data-social-report-status="${r.id}" aria-label="حالة البلاغ"><option value="open"${r.status === 'open' ? ' selected' : ''}>مفتوح</option><option value="reviewing"${r.status === 'reviewing' ? ' selected' : ''}>قيد المعالجة</option><option value="resolved"${r.status === 'resolved' ? ' selected' : ''}>تمت المعالجة</option><option value="dismissed"${r.status === 'dismissed' ? ' selected' : ''}>مرفوض</option></select><button class="btn btn-sm btn-primary" type="button" data-social-report-save="${r.id}">حفظ</button>${['material', 'discussion', 'reply'].includes(r.target_type) && r.status !== 'resolved' ? `<button class="btn btn-sm btn-danger" type="button" data-social-report-hide="${r.id}">إخفاء المحتوى</button>` : ''}</td></tr>`).join('');
  const tabs = ['open', 'reviewing', 'resolved', 'dismissed', 'all'].map(v => `<a class="btn btn-sm ${v === status ? 'btn-primary' : 'btn-ghost'}" href="/admin/social-reports?status=${v}">${state[v] || 'الكل'}</a>`).join(' ');
  const body = `${pageHead('بلاغات المجتمع', tabs)}<section class="card"><p class="muted">تصل البلاغات من مساحة الباحث، وتُحفظ كل قرارات المعالجة في سجل العمليات.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>المحتوى والسبب</th><th>المبلّغ</th><th>الحالة</th><th>التاريخ</th><th>الإجراء</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="6" class="muted">لا توجد بلاغات في هذه الحالة.</td></tr>'}</tbody></table></div></section>`;
  return layout({ title: 'بلاغات المجتمع', active: 'social-reports', user, body });
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
  if (clean === '/admin') return htmlRes(await dashboardPage(env, user, req));
  if (clean === '/admin/content-health') return htmlRes(await contentHealthPage(env, user, req));
  if (clean === '/admin/content-repair') return htmlRes(await contentRepairPage(env, user, req));
  if (clean === '/admin/metrics') return htmlRes(await metricsPage(env, user, req));
  if (clean === '/admin/translation') return htmlRes(await translationPage(env, user, req));
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
  if (clean === '/admin/users') return htmlRes(await usersPage(env, user, req));
  if (clean === '/admin/verification') return htmlRes(await verificationPage(env, user));
  if (clean === '/admin/discussions') return htmlRes(await adminDiscussionsPage(env, user));
  if (clean === '/admin/social-reports') return htmlRes(await socialReportsPage(env, user, req));

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

const RESEARCHER_STATUS_LABELS = { draft: 'مسودة', in_review: 'قيد المراجعة', changes_requested: 'مطلوب تعديلها', published: 'منشورة', hidden: 'مخفية' };

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
    level: MATERIAL_LEVEL_LABELS[material?.material_level] || '',
    materialLevel: material?.material_level,
    language: material?.language,
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
  fullscreen: SJ_SVG('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  image: SJ_SVG('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  file: SJ_SVG('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>'),
  useful: SJ_SVG('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L1 9.6l6.2-.9z"/>'),
  bookmark: SJ_SVG('<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-3.5L6 22z"/>'),
  flag: SJ_SVG('<path d="M5 21V4"/><path d="M5 5c4-3 7 3 14 0v9c-7 3-10-3-14 0"/>'),
  comment: SJ_SVG('<path d="M4 5h16v11H9l-5 4z"/>'),
  summary: SJ_SVG('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M8.5 12h7M8.5 16h5"/>'),
  review: SJ_SVG('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>'),
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
<link rel="stylesheet" href="/admin.css?v=20261005-researcher-actions-v4">
</head>
<body class="researcher-body">
<script>
try {
  const saved = localStorage.getItem('sidjil_researcher_fullscreen') === '1'
    || /(?:^|;)\s*sidjil_researcher_fullscreen=1(?:;|$)/.test(document.cookie);
  if (saved) {
    document.body.classList.add('researcher-fullscreen');
    document.documentElement.dataset.researcherFullscreen = '1';
  }
} catch {}
</script>
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
          <button type="button" class="researcher-account-nav-link researcher-fullscreen-toggle" id="researcherFullscreenToggle" aria-pressed="false"><span class="ran-icon" aria-hidden="true">${SJ_ICONS.fullscreen}</span><span data-fullscreen-label>ملء الشاشة</span></button>
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
    <footer class="researcher-footer"><span>سِجِل · مجتمع الباحثين والذاكرة الرقمية لتشاد</span></footer>
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
  <div class="researcher-material-modal" role="dialog" aria-modal="true" aria-labelledby="researcherMaterialModalTitle" aria-describedby="researcherMaterialModalText">
    <button class="researcher-modal-close" type="button" data-researcher-modal-close aria-label="إغلاق">×</button>
    <div class="researcher-material-modal-media" id="researcherMaterialModalMedia"></div>
    <div class="researcher-material-modal-content">
      <span class="eyebrow" id="researcherMaterialModalType"></span>
      <h2 id="researcherMaterialModalTitle"></h2>
      <div class="researcher-material-modal-meta" id="researcherMaterialModalMeta"></div>
      <p id="researcherMaterialModalText"></p>
      <div class="researcher-material-modal-actions researcher-pdf-actions">
        <button class="rpdf-action" id="researcherMaterialModalRead" type="button" hidden><span class="rpdf-action-icon" aria-hidden="true">📖</span><span class="rpdf-action-label">قراءة الكتاب</span></button>
        <a class="rpdf-action" id="researcherMaterialModalDownload" href="#" hidden><span class="rpdf-action-icon" aria-hidden="true">⬇️</span><span class="rpdf-action-label">تنزيل PDF الأصلي</span></a>
        <button class="rpdf-action" id="researcherMaterialModalTranslation" type="button" hidden><span class="rpdf-action-icon" aria-hidden="true">🌐</span><span class="rpdf-action-label">الترجمة</span></button>
        <button class="rpdf-action" id="researcherMaterialModalRequestTranslation" type="button" hidden><span class="rpdf-action-icon" aria-hidden="true">✉️</span><span class="rpdf-action-label">طلب ترجمة</span></button>
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
const __sidjilNative = Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios' || /^(capacitor|ionic):$/i.test(location.protocol));
if (!__sidjilNative && 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
</script>
<script src="/vendor/jszip/jszip.min.js?v=20261005" defer></script>
<script src="/vendor/docx-preview/docx-preview.min.js?v=20261005" defer></script>
<script src="/js/docx-reader.js?v=20261011-text-reader" defer></script>
<script type="module" src="/js/researcher-pdf.js?v=20261012-unified-reader-controls-export"></script>
<script src="/researcher-feed-v5.js?v=20261005-researcher-actions-v3" defer></script>

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
    const fullscreenToggle = document.getElementById('researcherFullscreenToggle');
    if (fullscreenToggle && !fullscreenToggle.dataset.sjBound) {
      fullscreenToggle.dataset.sjBound = '1';
      const label = fullscreenToggle.querySelector('[data-fullscreen-label]');
      const fullscreenPreferenceKey = 'sidjil_researcher_fullscreen';
      const readFullscreenPreference = () => {
        try {
          if (localStorage.getItem(fullscreenPreferenceKey) === '1') return true;
        } catch {}
        try { return new RegExp('(?:^|;)\\s*' + fullscreenPreferenceKey + '=1(?:;|$)').test(document.cookie); } catch { return false; }
      };
      const writeFullscreenPreference = (active) => {
        const value = active ? '1' : '0';
        try { localStorage.setItem(fullscreenPreferenceKey, value); } catch {}
        try { document.cookie = fullscreenPreferenceKey + '=' + value + '; Max-Age=31536000; Path=/; SameSite=Lax'; } catch {}
      };
      let fallbackFullscreen = readFullscreenPreference();
      let nativeFullscreenStarted = false;
      const setFullscreenState = () => {
        const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement || fallbackFullscreen);
        fullscreenToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (label) label.textContent = active ? 'الخروج من ملء الشاشة' : 'ملء الشاشة';
        document.body.classList.toggle('researcher-fullscreen', active);
        if (active) document.documentElement.dataset.researcherFullscreen = '1';
        else delete document.documentElement.dataset.researcherFullscreen;
      };
      fullscreenToggle.addEventListener('click', async () => {
        const shouldEnter = !(document.fullscreenElement || document.webkitFullscreenElement || fallbackFullscreen);
        writeFullscreenPreference(shouldEnter);
        try {
          if (!shouldEnter) {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            nativeFullscreenStarted = false;
            fallbackFullscreen = false;
          } else if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
            nativeFullscreenStarted = true;
          } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
            nativeFullscreenStarted = true;
          } else {
            // بعض المتصفحات المضمنة لا تعرض Fullscreen API؛ يبقى التطبيق ممتدًا داخل مساحة العرض.
            fallbackFullscreen = true;
          }
        } catch { fallbackFullscreen = true; /* يتطلب المتصفح نقرة المستخدم للسماح بملء الشاشة */ }
        setFullscreenState();
      });
      const syncNativeFullscreen = () => {
        const activeNative = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        if (!activeNative && nativeFullscreenStarted) {
          nativeFullscreenStarted = false;
          fallbackFullscreen = false;
          writeFullscreenPreference(false);
        }
        setFullscreenState();
      };
      document.addEventListener('fullscreenchange', syncNativeFullscreen);
      document.addEventListener('webkitfullscreenchange', syncNativeFullscreen);
      window.addEventListener('pageshow', () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          fallbackFullscreen = readFullscreenPreference();
          setFullscreenState();
        }
      });
      setFullscreenState();
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
function researcherMaterialVisualKind(material) {
  const level = String(material?.material_level || '').trim();
  if (level === 'archival_image' || String(material?.type || '') === 'image') return 'image';
  if (level === 'archival_text') return 'text';
  return 'book';
}

function researcherMaterialVisualMarkup(material, title, visualKind, materialData) {
  const hasPreview = Boolean(material?.thumb_id);
  if (visualKind === 'image') {
    return hasPreview
      ? `<button class="researcher-material-visual researcher-image-visual researcher-media-trigger" type="button" data-material-lightbox="/file/${material.thumb_id}" aria-label="تكبير الصورة ${esc(title)}"><img class="researcher-feed-image" src="/file/${material.thumb_id}" alt="${esc(title)}" loading="lazy"><span class="researcher-visual-badge">صورة أرشيفية</span></button>`
      : `<button class="researcher-material-visual researcher-image-visual researcher-feed-placeholder researcher-media-trigger" type="button" data-material-details ${materialData} aria-label="عرض تفاصيل ${esc(title)}"><span class="researcher-empty-visual-icon" aria-hidden="true">▧</span><span>صورة أرشيفية بلا معاينة</span></button>`;
  }

  if (visualKind === 'text') {
    const excerpt = String(material?.summary || material?.description || '').trim().slice(0, 280);
    return `<button class="researcher-material-visual researcher-text-visual researcher-media-trigger" type="button" data-material-details ${materialData} aria-label="قراءة النص المفرغ ${esc(title)}">
      <span class="researcher-text-visual-header"><span class="researcher-visual-icon" aria-hidden="true">¶</span><span><strong>مادة أرشيفية مفرغة</strong><small>نص موثق قابل للقراءة</small></span></span>
      <span class="researcher-text-visual-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      ${excerpt ? `<span class="researcher-text-visual-excerpt">${esc(excerpt)}</span>` : '<span class="researcher-text-visual-excerpt">افتح التفاصيل لقراءة النص المفرغ كاملًا.</span>'}
    </button>`;
  }

  const bookStatus = material?.pdf_id
    ? 'كتاب أرشيفي · ملف PDF متاح'
    : String(material?.material_level || '') === 'archival_book_unavailable'
      ? 'كتاب أرشيفي · بيانات ببليوغرافية'
      : 'كتاب أو مؤلف · بطاقة تعريفية';
  const author = String(material?.author || '').trim();
  return `<button class="researcher-material-visual researcher-book-visual researcher-media-trigger" type="button" data-material-details ${materialData} aria-label="عرض تفاصيل الكتاب ${esc(title)}">
    <span class="researcher-book-cover${hasPreview ? ' has-cover' : ''}">${hasPreview ? `<img src="/file/${material.thumb_id}" alt="غلاف ${esc(title)}" loading="lazy">` : `<span class="researcher-book-cover-mark" aria-hidden="true">سِجِل</span><span class="researcher-book-cover-title">${esc(title)}</span>`}</span>
    <span class="researcher-book-info"><strong>${esc(bookStatus)}</strong>${author ? `<small>${esc(author)}</small>` : '<small>تفاصيل المصدر داخل البطاقة</small>'}</span>
  </button>`;
}

function researcherMaterialCard(m, feed, verified) {
  const title = m.title_ar || m.title_orig || m.ark;
  const inlineId = `researcherInlineDiscussion${m.id}`;
  const visualKind = researcherMaterialVisualKind(m);
  // النص المفرغ لا يتوقع صورة غلاف حتى إن وُجد ملف مصغر بالخطأ في فهرس الأصول.
  const materialData = researcherMaterialData(m, visualKind === 'text' ? '' : m.thumb_id);
  const visual = researcherMaterialVisualMarkup(m, title, visualKind, materialData);
  const detailsButton = `<button class="researcher-details-btn" type="button" data-material-details ${materialData}>عرض التفاصيل</button>`;
  const excerpt = (m.type === 'document' && ['auto', 'corrected'].includes(String(m.transcription_status || '')))
    ? '' : (m.summary || m.description || '');
  const sourceDetails = [
    `المعرف الأرشيفي: ${m.ark}`,
    `التصنيف: ${MATERIAL_LEVEL_LABELS[m.material_level] || TYPE_LABELS[m.type] || m.type}`,
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
  return `<article class="researcher-feed-post researcher-material-kind-${visualKind} social-card" data-material-level="${esc(m.material_level || '')}">
    ${officialNotice}
    ${sourceBlock}
    <div class="post-head">${cardAvatar}<div><strong>${esc(cardAuthor)}</strong><div class="post-meta">${esc(MATERIAL_LEVEL_LABELS[m.material_level] || TYPE_LABELS[m.type] || m.type)}${m.year ? ` · ${esc(m.year)}` : ''} · ${fmtDate(m.updated_at)}</div></div><span class="post-kind-label">منشور</span></div>
    <button class="researcher-feed-title researcher-material-trigger" type="button" data-material-details ${materialData}>${esc(title)}</button>
    ${visual}
    ${detailsButton}
    ${excerpt ? `<p class="researcher-feed-excerpt">${esc(String(excerpt).slice(0, 420))}</p>` : ''}
    <div class="researcher-feed-actions">
      <button class="researcher-feed-action-trigger social-reaction-button" type="button" data-social-reaction data-target-type="material" data-target-id="${esc(m.id)}" data-reaction-kind="useful" aria-pressed="false" aria-label="مفيد"><span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.useful}</span><span data-social-label>مفيد</span><span data-social-count>0</span></button>
      <button class="researcher-feed-action-trigger social-bookmark-button" type="button" data-social-bookmark data-target-type="material" data-target-id="${esc(m.id)}" aria-pressed="false" aria-label="حفظ"><span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.bookmark}</span><span data-social-label>حفظ</span></button>
      <button class="researcher-feed-action-trigger social-report-button" type="button" data-social-report data-target-type="material" data-target-id="${esc(m.id)}" aria-label="الإبلاغ"><span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.flag}</span><span data-social-label>بلّغ</span></button>
      ${discussionAction('comment', `<span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.comment}</span><span>علّق</span>`)}
      ${discussionAction('text', `<span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.summary}</span><span>لخّص</span>`)}
      ${discussionAction('review', `<span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.review}</span><span>راجع</span>`)}
      <span class="feed-discussion-count">${Number(m.discussions_count || 0)} نقاش</span>
    </div>
    ${inlineComposer}
  </article>`;
}

// تمثيل JSON صغير لموجز تطبيق الباحث. يبقى HTML السابق للويب، بينما يستخدم
// الـShell هذا الشكل دون إعادة تفسير HTML قادم من الخادم.
function researcherMaterialFeedItem(m) {
  const creatorId = Number(m.creator_id) || 0;
  const title = m.title_ar || m.title_orig || m.ark || 'مادة بلا عنوان';
  return {
    kind: 'material',
    id: Number(m.id) || 0,
    ark: String(m.ark || ''),
    type: String(m.type || ''),
    materialLevel: String(m.material_level || ''),
    title: String(title),
    titleOriginal: String(m.title_orig || ''),
    description: String(m.description || ''),
    summary: String(m.summary || ''),
    year: m.year == null ? '' : String(m.year),
    dateText: String(m.date_text || ''),
    author: String(m.author || ''),
    photographer: String(m.photographer || ''),
    archiveRef: String(m.archive_ref || ''),
    updatedAt: String(m.updated_at || ''),
    approvedAt: String(m.approved_at || ''),
    discussionsCount: Number(m.discussions_count || 0),
    sourceName: String(m.source_name_ar || m.source_name || ''),
    placeName: String(m.place_name || ''),
    creator: creatorId ? {
      id: creatorId,
      name: String(m.creator_name || m.author_name || 'باحث'),
      // لا نرسل مسار avatar_r2 المحمي إلى العميل الأصلي؛ الـShell يعرض
      // الحرف الأول إن لم يكن هناك رابط عام.
      avatarUrl: String(m.creator_avatar_url || ''),
    } : null,
    thumbnailUrl: m.thumb_id ? `/file/${encodeURIComponent(Number(m.thumb_id))}` : '',
    hasPdf: Boolean(m.pdf_id),
  };
}

function researcherDiscussionFeedItem(d) {
  return {
    kind: 'discussion',
    id: Number(d.id) || 0,
    title: String(d.title || ''),
    body: String(d.body || ''),
    discussionKind: String(d.kind || 'comment'),
    createdAt: String(d.created_at || ''),
    author: {
      id: Number(d.author_id) || 0,
      name: String(d.author_name || 'باحث'),
    },
    materialTitle: String(d.material_title || ''),
    materialArk: String(d.material_ark || ''),
    repliesCount: Number(d.replies_count || 0),
  };
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
    <div class="researcher-feed-actions"><button class="researcher-feed-action-trigger social-reaction-button" type="button" data-social-reaction data-target-type="discussion" data-target-id="${esc(d.id)}" data-reaction-kind="useful" aria-pressed="false" aria-label="مفيد"><span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.useful}</span><span data-social-label>مفيد</span><span data-social-count>0</span></button><button class="researcher-feed-action-trigger social-bookmark-button" type="button" data-social-bookmark data-target-type="discussion" data-target-id="${esc(d.id)}" aria-pressed="false" aria-label="حفظ"><span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.bookmark}</span><span data-social-label>حفظ</span></button><button class="researcher-feed-action-trigger social-report-button" type="button" data-social-report data-target-type="discussion" data-target-id="${esc(d.id)}" aria-label="الإبلاغ"><span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.flag}</span><span data-social-label>بلّغ</span></button><a href="/researcher/discussions?focus=${encodeURIComponent(d.id)}"><span class="researcher-action-icon" aria-hidden="true">${SJ_ICONS.comment}</span><span>فتح والرد</span></a><span class="feed-discussion-count">${Number(d.replies_count || 0)} رد</span></div>
  </article>`;
}

// ترتيب موجز الباحثين بالتناوب بين أنواع المواد حتى لا تملأ الصور الدفعة الأولى
// وتختفي الكتب والوثائق خلفها. يبقى الترتيب الزمني محفوظًا داخل كل نوع.
function diversifyResearcherMaterials(rows, count = 18) {
  const groups = new Map();
  for (const row of rows || []) {
    const type = String(row?.type || 'other');
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(row);
  }
  const preferred = ['book', 'document', 'article', 'excerpt', 'manuscript', 'journal', 'press', 'correspondence', 'map', 'image'];
  const types = [...groups.keys()].sort((a, b) => {
    const ai = preferred.indexOf(a); const bi = preferred.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const selected = [];
  while (selected.length < count && types.length) {
    for (let i = 0; i < types.length && selected.length < count;) {
      const group = groups.get(types[i]);
      const row = group?.shift();
      if (row) selected.push(row);
      if (!group?.length) types.splice(i, 1);
      else i += 1;
    }
  }
  return selected;
}

function encodeResearcherCursor(value) {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch { return ''; }
}

function decodeResearcherCursor(value) {
  if (!value) return null;
  try {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const date = parsed.updated_at || parsed.sort_date;
    if (!parsed || typeof parsed !== 'object' || !date || !Number.isInteger(Number(parsed.id))) return null;
    return { date: String(date), id: Number(parsed.id), kind: String(parsed.kind || '') };
  } catch { return null; }
}

async function loadResearcherPublishedFeed(env, user, { feed = 'discover', sectionId = null, search = '', cursor = '', limit = 18 } = {}) {
  const safeFeed = ['discover', 'latest', 'official'].includes(feed) ? feed : 'discover';
  const safeLimit = Math.max(6, Math.min(24, Number(limit) || 18));
  const decodedCursor = decodeResearcherCursor(cursor);
  const officialFilter = safeFeed === 'official'
    ? ` AND EXISTS (SELECT 1 FROM audit_log approval WHERE approval.action = 'material.review_approve' AND approval.target = m.ark)`
    : '';
  const approvedAtSelect = safeFeed === 'official'
    ? `COALESCE((SELECT MAX(a.created_at) FROM audit_log a WHERE a.action = 'material.review_approve' AND a.target = m.ark), m.updated_at) AS approved_at,`
    : `m.updated_at AS approved_at,`;
  const sectionFilter = Number.isInteger(Number(sectionId)) && Number(sectionId) > 0
    ? ` AND EXISTS (SELECT 1 FROM material_collections mc_filter WHERE mc_filter.material_id = m.id AND mc_filter.collection_id = ?)`
    : '';
  const searchTerm = String(search || '').trim().slice(0, 120);
  const arkSearch = /^ARC-[A-Z0-9-]+$/i.test(searchTerm);
  const hasArabicSearch = /[\u0600-\u06ff]/u.test(searchTerm);
  const searchTokens = hasArabicSearch
    ? searchTerm.normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').split(/\s+/).filter(Boolean).slice(0, 10)
    : [];
  const ftsQuery = arkSearch || hasArabicSearch ? '' : buildResearcherFtsQuery(searchTerm);
  const searchJoin = ftsQuery ? ' JOIN materials_fts search_fts ON search_fts.ark = m.ark' : '';
  const searchFilter = searchTerm
    ? ftsQuery
      ? ' AND search_fts MATCH ?'
      : arkSearch
        ? ' AND m.ark LIKE ?'
        : searchTokens.length
          ? ` AND (${searchTokens.map(() => 'm.search_blob LIKE ?').join(' AND ')})`
          : ''
    : '';
  // ترتيب ثابت مع Cursor حقيقي حتى لا تتكرر المواد ولا تتغير الصفحة أثناء التصفح.
  const cursorFilter = decodedCursor
    ? ' AND (m.updated_at < ? OR (m.updated_at = ? AND m.id < ?))'
    : '';
  const feedOrder = 'ORDER BY m.updated_at DESC, m.id DESC';
  const query = `SELECT m.id, m.ark, m.type, m.material_level, m.title_ar, m.title_orig, m.description, m.summary, m.year, m.date_text,
            m.author, m.photographer, m.archive_ref, m.updated_at, m.transcription_status,
            creator.id AS creator_id, creator.display_name AS creator_name, creator.avatar_url AS creator_avatar_url, creator.avatar_r2_key AS creator_avatar_r2_key,
            ${approvedAtSelect}
            s.name_ar AS source_name_ar, s.name AS source_name,
            p.name_ar AS place_name,
            mai.cover_file_id AS thumb_id,
            mai.pdf_file_id AS pdf_id,
            COALESCE(discussion_counts.discussions_count, 0) AS discussions_count
     FROM materials m${searchJoin}
     LEFT JOIN material_assets_index mai ON mai.material_id = m.id
     LEFT JOIN sources s ON s.id = m.source_id
     LEFT JOIN places p ON p.id = m.place_id
     LEFT JOIN admin_users creator ON creator.id = m.created_by AND creator.role = 'researcher'
     LEFT JOIN (
       SELECT d.material_id, COUNT(*) AS discussions_count
       FROM discussions d
       WHERE d.status = 'published'
       GROUP BY d.material_id
     ) discussion_counts ON discussion_counts.material_id = m.id
     WHERE m.publish_status = 'published'${officialFilter}${sectionFilter}${searchFilter}${cursorFilter}
     ${feedOrder} LIMIT ?`;
  const params = [];
  if (sectionFilter) params.push(Number(sectionId));
  if (searchFilter) {
    if (ftsQuery) params.push(ftsQuery);
    else if (arkSearch) params.push(`%${searchTerm}%`);
    else params.push(...searchTokens.map(token => `%${token}%`));
  }
  if (decodedCursor) params.push(decodedCursor.date, decodedCursor.date, decodedCursor.id);
  params.push(safeLimit + 1);
  const result = params.length ? await env.DB.prepare(query).bind(...params).all() : await env.DB.prepare(query).all();
  const rows = result.results || [];
  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const verified = Number(user.is_verified) === 1;
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last
    ? encodeResearcherCursor({ updated_at: last.updated_at, id: Number(last.id) })
    : '';
  return {
    html: pageRows.map(m => researcherMaterialCard(m, safeFeed, verified)).join(''),
    items: pageRows.map(researcherMaterialFeedItem),
    cursor: cursor || '',
    nextCursor,
    hasMore,
    count: pageRows.length,
  };
}

function researcherFeedJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function researcherFeedPartial(env, user, req) {
  const url = new URL(req.url);
  const feed = url.searchParams.get('feed') || 'discover';
  const jsonOnly = url.searchParams.get('format') === 'json';
  if (feed === 'following') {
    const result = await loadResearcherFollowingFeed(env, user, {
      search: url.searchParams.get('search'),
      cursor: url.searchParams.get('cursor'),
      limit: url.searchParams.get('limit'),
    });
    if (jsonOnly) delete result.html;
    return researcherFeedJson(result);
  }
  const section = url.searchParams.get('section');
  const sectionId = section && /^\d+$/.test(section) ? Number(section) : null;
  const result = await loadResearcherPublishedFeed(env, user, {
    feed,
    sectionId,
    search: url.searchParams.get('search'),
    cursor: url.searchParams.get('cursor'),
    limit: url.searchParams.get('limit'),
  });
  if (jsonOnly) delete result.html;
  return researcherFeedJson(result);
}

async function loadResearcherFollowingFeed(env, user, { search = '', cursor = '', limit = 18 } = {}) {
  const safeLimit = Math.max(6, Math.min(24, Number(limit) || 18));
  const decodedCursor = decodeResearcherCursor(cursor);
  const searchTerm = String(search || '').trim().slice(0, 120);
  const arkSearch = /^ARC-[A-Z0-9-]+$/i.test(searchTerm);
  const ftsQuery = arkSearch ? '' : buildResearcherFtsQuery(searchTerm);
  const materialSearchJoin = ftsQuery ? ' JOIN materials_fts search_fts ON search_fts.ark = m.ark' : '';
  const materialSearch = searchTerm
    ? ftsQuery
      ? ' AND search_fts MATCH ?'
      : ' AND m.ark LIKE ?'
    : '';
  const discussionSearch = searchTerm ? ` AND (d.title LIKE ? OR d.body LIKE ? OR m.title_ar LIKE ?)` : '';
  const materialCursor = decodedCursor
    ? ' AND (m.updated_at < ? OR (m.updated_at = ? AND (m.id < ? OR (m.id = ? AND ? < ?))))'
    : '';
  const discussionCursor = decodedCursor
    ? ' AND (d.created_at < ? OR (d.created_at = ? AND (d.id < ? OR (d.id = ? AND ? < ?))))'
    : '';
  const fetchLimit = safeLimit + 1;
  const [fMats, fDiscs] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.ark, m.type, m.material_level, m.title_ar, m.title_orig, m.description, m.summary, m.year, m.date_text,
              m.author, m.photographer, m.archive_ref, m.updated_at, m.transcription_status,
              m.updated_at AS sort_date,
              COALESCE(u.display_name, u.username, 'باحث') AS author_name,
              u.id AS creator_id, u.display_name AS creator_name, u.avatar_url AS creator_avatar_url, u.avatar_r2_key AS creator_avatar_r2_key,
              mai.cover_file_id AS thumb_id,
              mai.pdf_file_id AS pdf_id,
              COALESCE(discussion_counts.discussions_count, 0) AS discussions_count
       FROM materials m${materialSearchJoin}
       LEFT JOIN material_assets_index mai ON mai.material_id = m.id
       JOIN researcher_follows fl ON fl.followed_id = m.created_by
       LEFT JOIN admin_users u ON u.id = m.created_by AND u.role = 'researcher'
       LEFT JOIN (
         SELECT d.material_id, COUNT(*) AS discussions_count
         FROM discussions d
         WHERE d.status = 'published'
         GROUP BY d.material_id
       ) discussion_counts ON discussion_counts.material_id = m.id
       WHERE fl.follower_id = ? AND m.publish_status = 'published'${materialSearch}${materialCursor}
       ORDER BY m.updated_at DESC, m.id DESC LIMIT ?`
    ).bind(user.id, ...(materialSearch ? (ftsQuery ? [ftsQuery] : [`%${searchTerm}%`]) : []), ...(decodedCursor ? [decodedCursor.date, decodedCursor.date, decodedCursor.id, decodedCursor.id, 'material', decodedCursor.kind || ''] : []), fetchLimit).all(),
    env.DB.prepare(
      `SELECT d.id, d.author_id, d.title, d.body, d.kind, d.created_at,
              d.created_at AS sort_date,
              COALESCE(u.display_name, u.username, 'باحث') AS author_name,
              m.title_ar AS material_title, m.ark AS material_ark,
              (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count
       FROM discussions d
       JOIN researcher_follows fl ON fl.followed_id = d.author_id
       JOIN admin_users u ON u.id = d.author_id
       LEFT JOIN materials m ON m.id = d.material_id
       WHERE fl.follower_id = ? AND d.status = 'published'${discussionSearch}${discussionCursor}
       ORDER BY d.created_at DESC, d.id DESC LIMIT ?`
    ).bind(user.id, ...Array(discussionSearch ? 3 : 0).fill(`%${searchTerm}%`), ...(decodedCursor ? [decodedCursor.date, decodedCursor.date, decodedCursor.id, decodedCursor.id, 'discussion', decodedCursor.kind || ''] : []), fetchLimit).all(),
  ]);
  await attachDiscussionImages(env.DB, fDiscs.results || []);
  const verified = Number(user.is_verified) === 1;
  const merged = [
    ...((fMats.results || []).map(m => ({ sort: String(m.sort_date || ''), id: Number(m.id), kind: 'material', html: researcherMaterialCard(m, 'following', verified), item: researcherMaterialFeedItem(m) }))),
    ...((fDiscs.results || []).map(d => ({ sort: String(d.sort_date || ''), id: Number(d.id), kind: 'discussion', html: researcherDiscussionCard(d), item: researcherDiscussionFeedItem(d) }))),
  ].sort((a, b) => b.sort < a.sort ? -1 : b.sort > a.sort ? 1 : b.id - a.id || (b.kind < a.kind ? -1 : b.kind > a.kind ? 1 : 0));
  const page = merged.slice(0, safeLimit);
  const hasMore = merged.length > safeLimit;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeResearcherCursor({ sort_date: last.sort, id: last.id, kind: last.kind }) : '';
  return {
    html: page.map(x => x.html).join(''),
    items: page.map(x => x.item),
    cursor: cursor || '',
    nextCursor,
    hasMore,
    count: page.length,
  };
}

async function researcherDashPage(env, user, req) {
  const url = new URL(req.url);
  const feed = ['discover', 'latest', 'official', 'following'].includes(url.searchParams.get('feed'))
    ? url.searchParams.get('feed')
    : 'discover';
  const searchTerm = String(url.searchParams.get('search') || '').trim().slice(0, 120);
  const feedLabels = { discover: 'اكتشف', latest: 'الأحدث', official: 'اعتمادات الإدارة', following: 'المتابَعون' };
  // «اعتمادات الإدارة» موجّه إلى المواد المعتمدة كلها، لا إلى مواد صاحب الحساب.
  const sectionRows = await env.DB.prepare(
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

  // الدفعة الأولى محدودة، وتُستكمل من /researcher/feed عبر Cursor ثابت.
  const publishedPage = feed === 'following'
    ? { html: '', nextCursor: '', hasMore: false, count: 0 }
    : await loadResearcherPublishedFeed(env, user, {
      feed,
      sectionId: selectedSection?.id || null,
      search: searchTerm,
      cursor: '',
      limit: 18,
    });
  const publishedFeed = publishedPage.html;
  const verified = Number(user.is_verified) === 1;

  /* تبويب «المتابَعون»: مواد ونقاشات الباحثين الذين يتابعهم المستخدم — تُبنى خادوميًا */
  const followingPage = feed === 'following'
    ? await loadResearcherFollowingFeed(env, user, { search: searchTerm, cursor: '', limit: 18 })
    : { html: '', nextCursor: '', hasMore: false, count: 0 };
  const followingFeed = followingPage.html;
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
    const jobTitle = String(researcher.job_title || '').trim();
    return `<a class="researcher-story" href="/researcher/profile/${encodeURIComponent(researcher.id)}" aria-label="صفحة ${esc(name)}">${avatar}<span class="researcher-story-name">${esc(String(name).slice(0, 28))}</span>${jobTitle ? `<small title="${esc(jobTitle)}">${esc(jobTitle)}</small>` : ''}</a>`;
  }).join('');
  const categoryTabs = [
    `<a class="${selectedSection ? '' : 'active'}" href="/researcher?feed=${encodeURIComponent(feed)}#feed">الكل</a>`,
    ...sections.map(section => `<a class="${selectedSection && Number(selectedSection.id) === Number(section.id) ? 'active' : ''}" href="/researcher?feed=${encodeURIComponent(feed)}&section=${encodeURIComponent(section.id)}#feed">${esc(section.title_ar)} <small>(${Number(section.material_count || 0)})</small></a>`),
  ].join('');

  const postCards = items.map(m => {
    const note = ['draft', 'changes_requested'].includes(m.publish_status) && m.review_note
      ? `<div class="review-note"><strong>ملاحظة المراجعة:</strong> ${esc(m.review_note)}</div>` : '';
    const actions = `
      <a class="btn btn-sm" href="/researcher/${m.id}">تعديل</a>
      ${['draft', 'changes_requested'].includes(m.publish_status) ? `<button class="btn btn-sm btn-primary" data-r-submit="${m.id}" type="button">إرسال للمراجعة</button>
      <button class="btn btn-sm btn-ghost" data-r-delete="${m.id}" type="button">حذف</button>` : ''}`;
    return `<article class="researcher-material-card social-card">
      <div class="post-head"><div class="post-avatar">س</div><div><strong>${esc(TYPE_LABELS[m.type] || m.type)}</strong><div class="post-meta">${fmtDate(m.updated_at)} · ${m.files_count} ملف</div></div><span class="post-status">${badge(RESEARCHER_STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</span></div>
      <h3><a href="/researcher/${m.id}">${esc(m.title_ar || m.title_orig || '—')}</a></h3>
      ${note}
      <div class="post-actions"><a class="post-action" href="/researcher/${m.id}">فتح وتحرير</a>${['draft', 'changes_requested'].includes(m.publish_status) ? `<button class="post-action post-action-button" data-r-submit="${m.id}" type="button">إرسال للمراجعة</button><button class="post-action post-action-danger" data-r-delete="${m.id}" type="button">حذف</button>` : ''}</div>
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
    official: ['اعتمادات الإدارة', 'تظهر هنا المواد التي اعتمدتها الإدارة ونشرتها في الأرشيف.'],
  }[feed] || ['منشورات المجتمع', ''];
  const feedEmpty = feed === 'official'
    ? 'لا توجد قرارات اعتماد جديدة من الإدارة حتى الآن.'
    : feed === 'following'
      ? 'تابع باحثين لترى جديد موادهم ونقاشاتهم هنا.'
      : `لا توجد مواد في تصفية «${feedLabels[feed]}».`;
  const emptyFeedHtml = `<div class="social-card empty-state">${searchTerm ? `لا توجد نتائج للبحث عن «${esc(searchTerm)}».` : feedEmpty}</div>`;
  const activeFeedPage = feed === 'following' ? followingPage : publishedPage;
  const body = `
  <form class="researcher-main-search" action="/researcher" method="get" role="search" aria-label="البحث في مساحة الباحث" data-researcher-live-search>
    <span class="researcher-main-search-icon" aria-hidden="true">⌕</span>
    <input type="search" name="search" value="${esc(searchTerm)}" placeholder="ابحث في الكتب والوثائق والصور والمواد…" autocomplete="off">
    ${feed !== 'discover' ? `<input type="hidden" name="feed" value="${esc(feed)}">` : ''}
    ${selectedSection ? `<input type="hidden" name="section" value="${esc(selectedSection.id)}">` : ''}
  </form>
  <div id="researcherLiveSearchResults" class="researcher-live-search-results" aria-live="polite" aria-busy="false" hidden></div>
  <div id="researcherMainDiscovery" class="researcher-main-discovery">
  <section class="researcher-feed-tabs social-card" aria-label="تصفية الموجز"><a class="researcher-feed-tab${feed === 'discover' ? ' active' : ''}" href="/researcher?feed=discover#feed">اكتشف</a><a class="researcher-feed-tab${feed === 'following' ? ' active' : ''}" href="/researcher?feed=following#feed">المتابَعون</a><a class="researcher-feed-tab${feed === 'latest' ? ' active' : ''}" href="/researcher?feed=latest#feed">الأحدث</a><a class="researcher-feed-tab${feed === 'official' ? ' active' : ''}" href="/researcher?feed=official#feed">اعتمادات الإدارة</a></section>
  ${feed === 'discover' ? `<section class="researcher-stories social-card"><div class="researcher-stories-head"><strong>مجتمع الباحثين</strong><a href="/researcher/discussions?view=researchers">عرض الكل</a></div>${storyItems ? `<div class="researcher-story-row">${storyItems}</div>` : '<p class="researcher-stories-empty">لا توجد حسابات باحثين مسجلة بعد.</p>'}</section>` : ''}
  ${dashboardComposer}
  ${feed === 'following' ? '' : `<nav class="researcher-category-filter" aria-label="تصفية المواد بحسب القسم"><span>القسم</span><div class="researcher-category-tabs">${categoryTabs}</div></nav>`}
  <section class="social-section-head" id="feed"><div><h2>${feedHead[0]}${selectedSection && feed !== 'following' ? ` · ${esc(selectedSection.title_ar)}` : ''}</h2><p>${feedHead[1]}</p></div></section>
  <div id="researcherPublishedFeed" class="researcher-published-feed" data-feed="${esc(feed)}" data-section="${selectedSection?.id ? esc(selectedSection.id) : ''}" data-search="${esc(searchTerm)}" data-cursor="${esc(activeFeedPage.nextCursor || '')}" data-limit="18" data-has-more="${activeFeedPage.hasMore ? 'true' : 'false'}">${(feed === 'following' ? followingFeed : publishedFeed) || emptyFeedHtml}</div>
  ${activeFeedPage.hasMore ? '<div class="researcher-feed-loader" data-researcher-feed-loader role="status" aria-live="polite"><span class="researcher-feed-loader-spinner" aria-hidden="true"></span><span>جارٍ تحميل المزيد عند الاقتراب من نهاية الصفحة…</span></div>' : ''}
  ${feed === 'discover' ? `<section class="social-section-head researcher-own-head"><div><h2>آخر نقاشات الباحثين</h2><p>اقرأ ما كتبه الباحثون الآخرون وافتح النقاش للرد والمراجعة.</p></div><a class="btn btn-ghost" href="/researcher/discussions?view=community">عرض كل النقاشات</a></section>
  <div class="researcher-community-feed">${communityFeed || '<div class="social-card empty-state">لا توجد نقاشات منشورة بعد.</div>'}</div>` : ''}
  <section class="social-section-head researcher-own-head"><div><h2>منشوراتي وموادي</h2><p>مسوداتك وحالات الاعتماد والملاحظات الإدارية.</p></div><a class="btn btn-ghost" href="/researcher/new">إنشاء مادة</a></section>
  <div class="researcher-material-feed">${postCards || '<div class="social-card empty-state">لا منشورات بعد — ابدأ بمادة جديدة.</div>'}</div>
  <p class="muted small researcher-help">كل مادة يرسلها الباحث تمر على مراجعة الإدارة قبل النشر. يمكنك متابعة الملاحظات وإعادة التعديل من البطاقة.</p>
  </div>`;
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
        <label class="researcher-account-privacy"><input type="checkbox" name="is_public_profile" value="1" ${Number(user?.is_public_profile) === 1 ? 'checked' : ''}> إظهار ملفي في دليل الباحثين</label>
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
  const securityBody = `<section class="social-card researcher-security-card" aria-labelledby="researcherSecurityTitle">
    <div class="social-section-head"><div><h2 id="researcherSecurityTitle">أمان الحساب</h2><p>راجع نشاط الدخول وأبطل الجلسات التي لا تستخدمها.</p></div></div>
    <div class="researcher-security-meta"><span>آخر دخول: <strong>${esc(user?.last_login_at || 'غير مسجل')}</strong></span><span>آخر تغيير لكلمة المرور: <strong>${esc(user?.password_changed_at || 'غير مسجل')}</strong></span></div>
    <div class="composer-footer"><span class="muted small" data-sessions-status></span><button class="btn btn-ghost" type="button" data-load-sessions>عرض الجلسات النشطة</button><button class="btn btn-danger" type="button" data-revoke-sessions>تسجيل الخروج من الأجهزة الأخرى</button></div>
    <div class="researcher-session-list" data-session-list hidden></div>
  </section>`;
  return researcherLayout({ title: 'حسابي', active: 'account', user, body: `${completeBody}${securityBody}` });
}

async function researcherProfilePage(env, viewer, researcherId) {
  const target = await env.DB.prepare(
    `SELECT id, username, display_name, avatar_url, avatar_r2_key, verification_type, job_title,
            affiliation, specialty, bio, website, is_public_profile, created_at
     FROM admin_users
     WHERE id = ? AND role = 'researcher' AND is_active = 1`
  ).bind(researcherId).first();
  if (!target) {
    return researcherLayout({
      title: 'الباحث غير موجود', active: 'mine', user: viewer,
      body: `<div class="card"><h2>الباحث غير موجود</h2><p><a href="/researcher">العودة إلى مساحة الباحث</a></p></div>`,
    });
  }

  if (Number(target.is_public_profile) === 0 && Number(viewer.id) !== Number(target.id) && viewer.role !== 'admin') {
    return researcherLayout({
      title: 'الملف خاص', active: 'mine', user: viewer,
      body: `<div class="card"><h2>هذا الملف خاص</h2><p class="muted">اختار الباحث عدم إظهاره في الدليل العام.</p><p><a href="/researcher">العودة إلى مساحة الباحث</a></p></div>`,
    });
  }

  if (target.avatar_r2_key) target.avatar_public_path = `/researcher/avatar/${encodeURIComponent(target.id)}`;
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
  const relationship = ['following', 'followers'].includes(url.searchParams.get('relationship'))
    ? url.searchParams.get('relationship') : 'all';
  const perPage = 36;
  const relationJoin = relationship === 'following'
    ? ' JOIN researcher_follows relation ON relation.followed_id = u.id AND relation.follower_id = ?'
    : relationship === 'followers'
      ? ' JOIN researcher_follows relation ON relation.follower_id = u.id AND relation.followed_id = ?'
      : '';
  const relationParams = relationship === 'all' ? [] : [user.id];
  const baseWhere = "u.role = 'researcher' AND u.is_active = 1 AND (u.is_public_profile = 1 OR u.id = ?)";
  const [count, rows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM admin_users u${relationJoin} WHERE ${baseWhere}`).bind(...relationParams, user.id).first(),
    env.DB.prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.avatar_r2_key, u.verification_type,
              u.job_title, u.affiliation, u.is_verified,
              EXISTS (SELECT 1 FROM researcher_follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id) AS is_following
       FROM admin_users u${relationJoin} WHERE ${baseWhere}
       ORDER BY COALESCE(u.display_name, u.username), u.id LIMIT ? OFFSET ?`
    ).bind(...relationParams, user.id, user.id, perPage, (page - 1) * perPage).all(),
  ]);
  const total = Number(count?.total || 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cards = (rows.results || []).map(researcher => {
    const name = researcher.display_name || researcher.username || 'باحث';
    const isSelf = Number(researcher.id) === Number(user.id);
    if (researcher.avatar_r2_key) researcher.avatar_public_path = `/researcher/avatar/${encodeURIComponent(researcher.id)}`;
    return `<article class="researcher-directory-card social-card">
      <a class="researcher-directory-profile" href="/researcher/profile/${encodeURIComponent(researcher.id)}">
        ${researcherAvatarMarkup(researcher, 'directory-avatar')}<span class="researcher-directory-copy"><strong>${esc(name)}${Number(researcher.is_verified) === 1 ? verificationBadge(researcher.verification_type) : ''}</strong>
        <span>${esc(researcher.job_title || researcher.affiliation || 'باحث مسجل في سِجِل')}</span></span>
      </a>
      ${isSelf ? '<span class="researcher-directory-self">حسابي</span>' : `<button class="btn btn-sm ${Number(researcher.is_following) === 1 ? 'btn-ghost' : 'btn-primary'} researcher-directory-follow" type="button" data-follow-toggle="${researcher.id}" data-following="${Number(researcher.is_following) === 1 ? '1' : '0'}" aria-pressed="${Number(researcher.is_following) === 1 ? 'true' : 'false'}">${Number(researcher.is_following) === 1 ? '✓ تتابعه' : 'تابِع'}</button>`}
    </article>`;
  }).join('');
  const relationshipTabs = [
    ['all', 'كل الباحثين'],
    ['following', 'أتابعهم'],
    ['followers', 'يتابعونني'],
  ].map(([key, label]) => `<a class="researcher-directory-filter-tab${relationship === key ? ' active' : ''}" href="?view=researchers&relationship=${key}">${label}</a>`).join('');
  const pager = pages > 1 ? `<nav class="researcher-directory-pager" aria-label="صفحات دليل الباحثين">${page > 1 ? `<a class="btn btn-ghost btn-sm" href="?view=researchers&relationship=${relationship}&page=${page - 1}">السابق</a>` : ''}<span>صفحة ${page} من ${pages}</span>${page < pages ? `<a class="btn btn-ghost btn-sm" href="?view=researchers&relationship=${relationship}&page=${page + 1}">التالي</a>` : ''}</nav>` : '';
  const body = `<section class="researcher-hero social-card"><div><span class="eyebrow">المجتمع البحثي</span><h1>الباحثون المسجلون</h1><p>دليل الباحثين النشطين في سِجِل (${total}).</p></div><a class="btn btn-ghost" href="/researcher?feed=discover">العودة إلى اكتشف</a></section><nav class="researcher-directory-filters social-card" aria-label="تصفية الباحثين">${relationshipTabs}</nav><div class="researcher-directory-grid">${cards || '<div class="social-card empty-state">لا يوجد باحثون في هذا القسم.</div>'}</div>${pager}`;
  return researcherLayout({ title: 'الباحثون المسجلون', active: 'discussions', user, body });
}

async function researcherMaterialsPage(env, user, req) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const perPage = 40;
  const [count, result] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM materials WHERE created_by = ? AND publish_status IN ('draft', 'in_review', 'changes_requested', 'published')").bind(user.id).first(),
    env.DB.prepare(
    `SELECT m.id, m.title_ar, m.title_orig, m.type, m.publish_status,
            m.review_note, m.updated_at,
            (SELECT COUNT(*) FROM files f WHERE f.material_id = m.id) AS files_count
     FROM materials m
     WHERE m.created_by = ? AND m.publish_status IN ('draft', 'in_review', 'changes_requested', 'published')
     ORDER BY m.updated_at DESC, m.id DESC LIMIT ? OFFSET ?`
    ).bind(user.id, perPage, (page - 1) * perPage).all(),
  ]);
  const materials = result.results || [];
  const cards = materials.map(m => `
    <article class="researcher-activity-material social-card">
      <div class="post-head">
        <div class="post-avatar">${esc(String(TYPE_LABELS[m.type] || m.type || 'م').slice(0, 1))}</div>
        <div><strong>${esc(TYPE_LABELS[m.type] || m.type || 'مادة')}</strong><div class="post-meta">${fmtDate(m.updated_at)} · ${Number(m.files_count || 0)} ملف</div></div>
        <span class="post-status">${badge(RESEARCHER_STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</span>
      </div>
      <h3><a href="/researcher/${m.id}">${esc(m.title_ar || m.title_orig || 'مادة بلا عنوان')}</a></h3>
      ${['draft', 'changes_requested'].includes(m.publish_status) && m.review_note ? `<div class="review-note">${esc(m.review_note)}</div>` : ''}
      <div class="post-actions"><a class="post-action" href="/researcher/${m.id}">${m.publish_status === 'draft' ? 'متابعة تحرير المسودة' : 'عرض المادة'}</a></div>
    </article>`).join('');
  const total = Number(count?.total || 0);
  const pages = Math.max(1, Math.ceil(total / perPage));
  const pager = pages > 1 ? `<nav class="researcher-directory-pager" aria-label="صفحات موادي">${page > 1 ? `<a class="btn btn-ghost btn-sm" href="/researcher/materials?page=${page - 1}">السابق</a>` : ''}<span>صفحة ${page} من ${pages}</span>${page < pages ? `<a class="btn btn-ghost btn-sm" href="/researcher/materials?page=${page + 1}">التالي</a>` : ''}</nav>` : '';
  const body = `
    <section class="social-section-head researcher-own-head">
      <div><h2>منشوراتي</h2><p>مسوداتك والمواد المنشورة أو التي تنتظر مراجعة الإدارة.</p></div>
      <a class="btn btn-primary" href="/researcher/new">＋ إضافة مادة</a>
    </section>
    <div class="researcher-activity-feed">${cards || '<div class="social-card empty-state">لا توجد مسودات أو مواد منشورة أو قيد المراجعة بعد.</div>'}</div>${pager}`;
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
  const canEditMaterial = isEdit && (m.publish_status === 'draft' || m.publish_status === 'changes_requested' || editApproved);
  const fieldDisabled = isEdit && !canEditMaterial ? ' disabled' : '';
  const defType = isEdit ? m.type : (mode === 'article' ? 'article' : 'document');
  const defLevel = isEdit
    ? (m.material_level || (m.type === 'image' || m.type === 'map' ? 'archival_image' : m.type === 'book' ? 'archival_book_unavailable' : 'archival_text'))
    : (mode === 'article' ? 'chadian_publication' : 'archival_text');
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
      ${['draft', 'changes_requested'].includes(m.publish_status) && m.review_note ? `<div class="review-note"><strong>ملاحظة الإدارة:</strong> ${esc(m.review_note)}</div>` : ''}
      ${['draft', 'changes_requested'].includes(m.publish_status) ? `<button class="btn btn-primary" data-r-submit="${m.id}" type="button">إرسال للمراجعة</button>
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
      <div class="field"><label for="rf-level">تصنيف المادة *</label><select id="rf-level" name="material_level" required ${ro}>${Object.entries(MATERIAL_LEVELS).map(([v, item]) => `<option value="${esc(v)}"${defLevel === v ? ' selected' : ''}>${esc(item.ar)}</option>`).join('')}</select><small class="muted">اختر طريقة عرض المادة: صورة، نص موثق، كتاب PDF، كتاب غير متاح، أو مؤلف تشادي.</small></div>
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

function researcherJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

async function researcherMaterialTextApi(env, user, req) {
  const id = Number(new URL(req.url).searchParams.get('material_id'));
  if (!Number.isInteger(id) || id < 1) return researcherJson({ error: 'مادة غير صالحة' }, 400);
  const material = await env.DB.prepare(
    `SELECT id, ark, title_ar, title_orig, language, full_text
     FROM materials WHERE id = ? AND publish_status = 'published'`
  ).bind(id).first();
  if (!material) return researcherJson({ error: 'المادة غير موجودة' }, 404);
  const transcription = await env.DB.prepare(
    `SELECT layer, lang, text FROM transcriptions
     WHERE material_id = ? AND length(text) > 0
     ORDER BY CASE WHEN layer = 'manual' THEN 0 ELSE 1 END, id DESC LIMIT 1`
  ).bind(id).first();
  const text = String(material.full_text || '').trim() || String(transcription?.text || '').trim();
  const arabicLetters = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinLetters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const isArabic = arabicLetters >= 3 && arabicLetters >= Math.ceil(latinLetters * 0.12);
  const language = isArabic ? 'ar' : (latinLetters ? 'fr' : String(transcription?.lang || material.language || 'ar').toLowerCase());
  return researcherJson({
    id: material.id,
    ark: material.ark,
    title: material.title_ar || material.title_orig || material.ark,
    text,
    language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
  });
}

function encodeResearcherSearchCursor(offset) {
  try {
    const value = JSON.stringify({ offset: Math.max(0, Number(offset) || 0) });
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch { return ''; }
}

function decodeResearcherSearchCursor(value) {
  if (!value) return 0;
  try {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4)));
    return Number.isInteger(Number(parsed.offset)) && Number(parsed.offset) >= 0 ? Number(parsed.offset) : 0;
  } catch { return 0; }
}

async function researcherSearchApi(env, user, req) {
  const url = new URL(req.url);
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
  const jsonOnly = url.searchParams.get('format') === 'json';
  if (q.length < 2) return researcherJson(jsonOnly ? { q, items: [], groups: {}, hasMore: false, nextCursor: '' } : { html: '', groups: [], hasMore: false });
  const limit = Math.min(12, Math.max(4, Number(url.searchParams.get('limit')) || 8));
  const offset = decodeResearcherSearchCursor(url.searchParams.get('cursor'));
  // D1 FTS لا يتعامل مع كل أشكال التطبيع العربي بنفس الثبات؛ استخدم LIKE
  // المقيّد بالعربية، مع إبقاء FTS للفرنسية والإنجليزية.
  const hasArabic = /[\u0600-\u06ff]/u.test(q);
  const fts = hasArabic ? '' : buildResearcherFtsQuery(q);
  const materialJoin = fts ? ' JOIN materials_fts ON materials_fts.ark = m.ark' : '';
  const materialWhere = fts ? ' WHERE materials_fts MATCH ? AND m.publish_status = \'published\'' : ' WHERE m.publish_status = \'published\' AND (m.ark LIKE ? OR m.title_ar LIKE ? OR m.title_orig LIKE ? OR m.description LIKE ? OR m.summary LIKE ? OR m.author LIKE ?)';
  const materialParams = fts ? [fts, limit, offset] : [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit, offset];
  const [materials, researchers, discussions, replies] = await Promise.all([
    env.DB.prepare(`SELECT m.id, m.ark, m.type, m.material_level, m.title_ar, m.title_orig, m.description, m.summary, m.year, m.date_text, m.author, m.photographer, m.archive_ref, m.updated_at, m.transcription_status,
      creator.id AS creator_id, creator.display_name AS creator_name, creator.avatar_url AS creator_avatar_url, creator.avatar_r2_key AS creator_avatar_r2_key,
      s.name_ar AS source_name_ar, s.name AS source_name, p.name_ar AS place_name, mai.cover_file_id AS thumb_id, mai.pdf_file_id AS pdf_id, 0 AS discussions_count
      FROM materials m${materialJoin}
      LEFT JOIN material_assets_index mai ON mai.material_id = m.id
      LEFT JOIN sources s ON s.id = m.source_id LEFT JOIN places p ON p.id = m.place_id
      LEFT JOIN admin_users creator ON creator.id = m.created_by AND creator.role = 'researcher'
      ${materialWhere}
      ORDER BY m.updated_at DESC, m.id DESC LIMIT ? OFFSET ?`).bind(...materialParams).all(),
    env.DB.prepare(`SELECT id, username, display_name, avatar_url, avatar_r2_key, job_title, specialty, bio, updated_at
      FROM admin_users WHERE role = 'researcher' AND is_active = 1 AND is_public_profile = 1
      AND (display_name LIKE ? OR username LIKE ? OR job_title LIKE ? OR specialty LIKE ? OR bio LIKE ?)
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT ?`)
      .bind(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit, offset).all(),
    env.DB.prepare(`SELECT d.id, d.author_id, d.title, d.body, d.kind, d.created_at, COALESCE(u.display_name, u.username, 'باحث') AS author_name,
      m.title_ar AS material_title, m.ark AS material_ark, 0 AS replies_count
      FROM discussions d JOIN admin_users u ON u.id = d.author_id LEFT JOIN materials m ON m.id = d.material_id
      WHERE d.status = 'published' AND (d.title LIKE ? OR d.body LIKE ? OR m.title_ar LIKE ?)
      ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?`).bind(`%${q}%`, `%${q}%`, `%${q}%`, limit, offset).all(),
    env.DB.prepare(`SELECT r.id, r.author_id, r.body, r.created_at, COALESCE(u.display_name, u.username, 'باحث') AS author_name,
      d.title AS discussion_title, d.id AS discussion_id
      FROM discussion_replies r JOIN discussions d ON d.id = r.discussion_id AND d.status = 'published'
      JOIN admin_users u ON u.id = r.author_id
      WHERE r.status = 'published' AND r.body LIKE ?
      ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`).bind(`%${q}%`, limit, offset).all(),
  ]);
  const groups = [];
  const materialRows = materials.results || [];
  if (materialRows.length) groups.push(`<section class="researcher-search-group"><h2>المواد <small>${materialRows.length}</small></h2><div class="researcher-published-feed">${materialRows.map(m => researcherMaterialCard(m, 'discover', Number(user.is_verified) === 1)).join('')}</div></section>`);
  const researcherRows = researchers.results || [];
  if (researcherRows.length) groups.push(`<section class="researcher-search-group"><h2>الباحثون <small>${researcherRows.length}</small></h2><div class="researcher-search-people">${researcherRows.map(r => { const name = r.display_name || r.username || 'باحث'; const initial = name.trim().slice(0, 1) || 'ب'; const src = r.avatar_r2_key ? `/researcher/avatar/${encodeURIComponent(r.id)}` : String(r.avatar_url || '').trim(); const avatar = src ? `<img class="researcher-avatar small" src="${esc(src)}" alt="${esc(name)}">` : `<span class="researcher-avatar small" aria-hidden="true">${esc(initial)}</span>`; return `<a class="social-card researcher-search-person" href="/researcher/profile/${r.id}">${avatar}<span><strong>${esc(name)}</strong><small>${esc(r.job_title || r.specialty || 'باحث')}</small></span></a>`; }).join('')}</div></section>`);
  const discussionRows = discussions.results || [];
  const replyRows = replies.results || [];
  if (jsonOnly) {
    const groupItems = {
      materials: materialRows.map(researcherMaterialFeedItem),
      researchers: researcherRows.map(r => ({
        kind: 'researcher', id: Number(r.id), username: String(r.username || ''),
        name: String(r.display_name || r.username || 'باحث'), jobTitle: String(r.job_title || ''),
        specialty: String(r.specialty || ''), bio: String(r.bio || ''),
        avatarUrl: r.avatar_r2_key ? `/researcher/avatar/${encodeURIComponent(Number(r.id))}` : String(r.avatar_url || ''),
      })),
      discussions: discussionRows.map(researcherDiscussionFeedItem),
      replies: replyRows.map(r => ({
        kind: 'reply', id: Number(r.id), authorId: Number(r.author_id),
        authorName: String(r.author_name || 'باحث'), body: String(r.body || ''),
        createdAt: String(r.created_at || ''), discussionId: Number(r.discussion_id),
        discussionTitle: String(r.discussion_title || ''),
      })),
    };
    const items = [...groupItems.materials, ...groupItems.researchers, ...groupItems.discussions, ...groupItems.replies];
    const hasMore = [materialRows, researcherRows, discussionRows, replyRows].some(rows => rows.length >= limit);
    return researcherJson({ q, items, groups: groupItems, hasMore, nextCursor: hasMore ? encodeResearcherSearchCursor(offset + limit) : '' });
  }
  if (discussionRows.length) groups.push(`<section class="researcher-search-group"><h2>النقاشات <small>${discussionRows.length}</small></h2><div class="researcher-community-feed">${discussionRows.map(d => researcherDiscussionCard(d)).join('')}</div></section>`);
  if (replyRows.length) groups.push(`<section class="researcher-search-group"><h2>الردود <small>${replyRows.length}</small></h2><div class="researcher-search-replies">${replyRows.map(r => `<a class="social-card researcher-search-reply" href="/researcher/discussions?discussion_id=${encodeURIComponent(r.discussion_id)}"><strong>${esc(r.author_name)}</strong><small>رد على: ${esc(r.discussion_title || 'نقاش')}</small><p>${esc(String(r.body || '').slice(0, 300))}</p></a>`).join('')}</div></section>`);
  return researcherJson({ html: groups.join('') || `<div class="social-card empty-state">لا توجد نتائج للبحث عن «${esc(q)}».</div>`, groups: ['materials', 'researchers', 'discussions', 'replies'], hasMore: false });
}

async function researcherProfileApi(env, viewer, researcherId) {
  const id = Number(researcherId);
  if (!Number.isInteger(id) || id < 1) return researcherJson({ error: 'معرف الباحث غير صالح' }, 400);
  const target = await env.DB.prepare(
    `SELECT id, username, display_name, avatar_url, avatar_r2_key, verification_type, job_title,
            affiliation, specialty, bio, website, is_public_profile, created_at
     FROM admin_users WHERE id = ? AND role = 'researcher' AND is_active = 1`
  ).bind(id).first();
  if (!target) return researcherJson({ error: 'الباحث غير موجود' }, 404);
  if (Number(target.is_public_profile) === 0 && Number(viewer.id) !== id && viewer.role !== 'admin') {
    return researcherJson({ error: 'ملف الباحث خاص', code: 'PROFILE_PRIVATE' }, 403);
  }
  const [discussionRows, replyRows, materialRows, followCounts] = await Promise.all([
    env.DB.prepare(
      `SELECT d.id, d.author_id, d.title, d.body, d.kind, d.created_at,
              COALESCE(u.display_name, u.username, 'باحث') AS author_name,
              m.title_ar AS material_title, m.ark AS material_ark,
              (SELECT COUNT(*) FROM discussion_replies r WHERE r.discussion_id = d.id AND r.status = 'published') AS replies_count
       FROM discussions d JOIN admin_users u ON u.id = d.author_id
       LEFT JOIN materials m ON m.id = d.material_id
       WHERE d.author_id = ? AND d.status = 'published'
       ORDER BY d.created_at DESC, d.id DESC LIMIT 30`
    ).bind(id).all(),
    env.DB.prepare(
      `SELECT r.id, r.author_id, r.body, r.created_at, r.discussion_id,
              COALESCE(u.display_name, u.username, 'باحث') AS author_name,
              d.title AS discussion_title
       FROM discussion_replies r JOIN discussions d ON d.id = r.discussion_id AND d.status = 'published'
       JOIN admin_users u ON u.id = r.author_id
       WHERE r.author_id = ? AND r.status = 'published'
       ORDER BY r.created_at DESC, r.id DESC LIMIT 30`
    ).bind(id).all(),
    env.DB.prepare(
      `SELECT m.id, m.ark, m.type, m.material_level, m.title_ar, m.title_orig, m.description, m.summary,
              m.year, m.date_text, m.author, m.photographer, m.archive_ref, m.updated_at,
              (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.kind IN ('thumbnail', 'cover') OR f.mime LIKE 'image/%')
               ORDER BY CASE WHEN f.kind = 'cover' THEN 0 WHEN f.kind = 'thumbnail' THEN 1 ELSE 2 END, f.id LIMIT 1) AS thumb_id,
              (SELECT f.id FROM files f WHERE f.material_id = m.id AND (f.mime = 'application/pdf' OR lower(f.filename) LIKE '%.pdf')
               ORDER BY f.id LIMIT 1) AS pdf_id
       FROM materials m WHERE m.created_by = ? AND m.publish_status = 'published'
       ORDER BY m.updated_at DESC, m.id DESC LIMIT 30`
    ).bind(id).all(),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM researcher_follows WHERE followed_id = ?) AS followers,
              (SELECT COUNT(*) FROM researcher_follows WHERE follower_id = ?) AS following,
              EXISTS (SELECT 1 FROM researcher_follows WHERE follower_id = ? AND followed_id = ?) AS is_following`
    ).bind(id, id, viewer.id, id).first(),
  ]);
  const profileName = String(target.display_name || target.username || 'باحث');
  const discussions = discussionRows.results || [];
  const replies = replyRows.results || [];
  const materials = materialRows.results || [];
  return researcherJson({
    profile: {
      id, username: String(target.username || ''), name: profileName,
      avatarUrl: target.avatar_r2_key ? `/researcher/avatar/${encodeURIComponent(id)}` : String(target.avatar_url || ''),
      verificationType: String(target.verification_type || ''), jobTitle: String(target.job_title || ''),
      affiliation: String(target.affiliation || ''), specialty: String(target.specialty || ''),
      bio: String(target.bio || ''), website: String(target.website || ''),
      isViewer: Number(viewer.id) === id,
    },
    stats: {
      discussions: discussions.length, replies: replies.length, materials: materials.length,
      followers: Number(followCounts?.followers || 0), following: Number(followCounts?.following || 0),
      isFollowing: Boolean(followCounts?.is_following),
    },
    discussions: discussions.map(researcherDiscussionFeedItem),
    replies: replies.map(r => ({ kind: 'reply', id: Number(r.id), body: String(r.body || ''), createdAt: String(r.created_at || ''), discussionId: Number(r.discussion_id), discussionTitle: String(r.discussion_title || ''), authorName: String(r.author_name || profileName) })),
    materials: materials.map(m => ({
      kind: 'material', id: Number(m.id), ark: String(m.ark || ''), title: String(m.title_ar || m.title_orig || m.ark || ''),
      type: String(m.type || ''), materialLevel: String(m.material_level || ''), description: String(m.description || ''),
      summary: String(m.summary || ''), year: m.year == null ? '' : String(m.year), updatedAt: String(m.updated_at || ''),
      thumbnailUrl: m.thumb_id ? `/file/${encodeURIComponent(Number(m.thumb_id))}` : '', hasPdf: Boolean(m.pdf_id),
    })),
  });
}

export async function renderResearcher(pathname, req, env, user) {
  if (!user) return redirect('/admin/login');
  if (user.role === 'admin') return redirect('/admin');

  const clean = pathname.replace(/\/+$/, '') || '/researcher';
  if (Number(user.must_change_password) === 1 && clean !== '/researcher/account') {
    return redirect('/researcher/account?force_password=1');
  }
  if (clean === '/researcher/material-text' && req.method === 'GET') return researcherMaterialTextApi(env, user, req);
  if (clean === '/researcher/search' && req.method === 'GET') return researcherSearchApi(env, user, req);
  if (clean === '/researcher/feed' && req.method === 'GET') return researcherFeedPartial(env, user, req);
  if (clean === '/researcher') return htmlRes(await researcherDashPage(env, user, req));
  if (clean === '/researcher/materials') return htmlRes(await researcherMaterialsPage(env, user, req));
  if (clean === '/researcher/account') return htmlRes(await researcherAccountPage(user));
  const mProfile = clean.match(/^\/researcher\/profile\/(\d+)$/);
  if (mProfile && req.method === 'GET' && new URL(req.url).searchParams.get('format') === 'json') return researcherProfileApi(env, user, parseInt(mProfile[1], 10));
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
