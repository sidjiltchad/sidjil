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
  ['announcements', '/admin/announcements', 'الإعلانات'],
  ['glossary', '/admin/glossary', 'قاموس الترجمة'],
  ['users', '/admin/users', 'المستخدمون'],
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
<link rel="stylesheet" href="/admin.css">
${head}
</head>
<body>
<div class="admin-shell">
  <aside class="sidebar">
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
<script src="/admin.js" defer></script>
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
<link rel="stylesheet" href="/admin.css">
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
<script src="/admin.js" defer></script>
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
  wrangler d1 export sidjil-prod --output=backup-d1.sql

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

// ---------- 9) المستخدمون ----------
async function usersPage(env, user) {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.role, u.is_active, u.created_at,
            (SELECT COUNT(*) FROM materials m WHERE m.created_by = u.id) AS materials_count
     FROM admin_users u ORDER BY u.id ASC`).all();
  const bodyRows = (rows.results || []).map(u => {
    const self = Number(u.id) === Number(user.id);
    const actions = self ? '<span class="muted small">—</span>' : `
        <button class="btn btn-sm" data-user-role="${u.id}" data-role="${u.role === 'admin' ? 'researcher' : 'admin'}" type="button">${u.role === 'admin' ? 'جعله باحثًا' : 'جعله مديرًا'}</button>
        <button class="btn btn-sm ${Number(u.is_active) ? 'btn-ghost' : 'btn-primary'}" data-user-toggle="${u.id}" data-active="${Number(u.is_active) ? 0 : 1}" type="button">${Number(u.is_active) ? 'إيقاف' : 'تفعيل'}</button>
        <button class="btn btn-sm btn-ghost" data-user-pass="${u.id}" data-username="${esc(u.username)}" type="button">كلمة مرور جديدة</button>`;
    return `
    <tr>
      <td class="mono">#${u.id}</td>
      <td><strong>${esc(u.username)}</strong>${self ? ' <span class="badge b-draft">أنت</span>' : ''}</td>
      <td>${u.role === 'admin' ? badge('مدير', 'b-pub') : badge('باحث', 'b-review')}</td>
      <td>${Number(u.is_active) ? badge('نشط', 'b-pub') : badge('موقوف', 'b-hidden')}</td>
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
        <thead><tr><th>#</th><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>المواد</th><th>أُنشئ</th><th>إجراءات</th></tr></thead>
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

  return htmlRes(layout({
    title: 'غير موجود', active: '', user,
    body: `<div class="card"><h2>صفحة غير موجودة</h2><p><a href="/admin">العودة إلى لوحة التحكم</a></p></div>`,
  }), 404);
}

// ============================================================
// واجهة الباحث — مساحة مبسطة: منشوراتي / مادة جديدة / مقال للمجلة
// ============================================================

const RESEARCHER_NAV = [
  ['mine', '/researcher', 'منشوراتي'],
  ['new', '/researcher/new', '+ مادة جديدة'],
  ['article', '/researcher/article', '+ مقال للمجلة'],
];

const RESEARCHER_STATUS_LABELS = { draft: 'مسودة', in_review: 'قيد المراجعة', published: 'منشورة', hidden: 'مخفية' };

function researcherLayout({ title, active, user, body }) {
  const nav = RESEARCHER_NAV.map(([key, href, label]) =>
    `<a href="${href}" class="nav-item${active === key ? ' active' : ''}">${esc(label)}</a>`
  ).join('');
  const csrfMeta = user && user.csrfToken
    ? `<meta name="csrf-token" content="${esc(user.csrfToken)}">` : '';
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
${THEME_INIT}
<meta name="viewport" content="width=device-width, initial-scale=1">
${csrfMeta}
<title>${esc(title)} — سِجِل | مساحة الباحث</title>
<link rel="stylesheet" href="/admin.css">
</head>
<body>
<div class="admin-shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-name">سِجِل</div>
      <div class="brand-sub">مساحة الباحث</div>
    </div>
    <nav class="nav">${nav}</nav>
    <div class="side-foot">
      <div class="who">الباحث: <strong>${esc(user?.username || '')}</strong></div>
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
<script src="/researcher.js" defer></script>
</body>
</html>`;
}

async function researcherDashPage(env, user) {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig, m.publish_status, m.review_note, m.updated_at,
            (SELECT COUNT(*) FROM files f WHERE f.material_id = m.id) AS files_count
     FROM materials m WHERE m.created_by = ? ORDER BY m.updated_at DESC LIMIT 200`
  ).bind(user.id).all();
  const items = rows.results || [];
  const counts = { draft: 0, in_review: 0, published: 0, hidden: 0 };
  items.forEach(m => { counts[m.publish_status] = (counts[m.publish_status] || 0) + 1; });

  const cards = [
    ['المسودات', counts.draft, 'k-draft'],
    ['قيد المراجعة', counts.in_review, 'k-review'],
    ['المنشورة', counts.published, 'k-pub'],
  ].map(([t, n, k]) => `<div class="stat-card ${k}"><div class="stat-num">${n}</div><div class="stat-label">${t}</div></div>`).join('');

  const bodyRows = items.map(m => {
    const note = m.publish_status === 'draft' && m.review_note
      ? `<div class="review-note"><strong>ملاحظة المراجعة:</strong> ${esc(m.review_note)}</div>` : '';
    const actions = `
      <a class="btn btn-sm" href="/researcher/${m.id}">تعديل</a>
      ${m.publish_status === 'draft' ? `<button class="btn btn-sm btn-primary" data-r-submit="${m.id}" type="button">إرسال للمراجعة</button>
      <button class="btn btn-sm btn-ghost" data-r-delete="${m.id}" type="button">حذف</button>` : ''}`;
    return `
    <tr>
      <td class="mono">${esc(m.ark)}</td>
      <td><a href="/researcher/${m.id}">${esc(m.title_ar || m.title_orig || '—')}</a>${note}</td>
      <td>${esc(TYPE_LABELS[m.type] || m.type)}</td>
      <td>${badge(RESEARCHER_STATUS_LABELS[m.publish_status] || m.publish_status, STATUS_CLASS[m.publish_status] || '')}</td>
      <td class="mono">${m.files_count}</td>
      <td class="muted">${fmtDate(m.updated_at)}</td>
      <td class="row-actions">${actions}</td>
    </tr>`;
  }).join('');

  const body = `
  ${pageHead('منشوراتي', `<a class="btn btn-primary" href="/researcher/new">+ مادة جديدة</a>`)}
  <div class="stats">${cards}</div>
  <div class="card">
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>الرقم</th><th>العنوان</th><th>النوع</th><th>الحالة</th><th>الملفات</th><th>آخر تعديل</th><th>إجراءات</th></tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="7" class="muted">لا منشورات بعد — ابدأ بمادة جديدة.</td></tr>'}</tbody>
    </table></div>
  </div>
  <p class="muted small">المسودة تُراجَع من الإدارة قبل النشر. لا يمكن تعديل أو حذف مادة بعد نشرها — تواصل مع الإدارة عند الحاجة.</p>`;
  return researcherLayout({ title: 'منشوراتي', active: 'mine', user, body });
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
  const defType = isEdit ? m.type : (mode === 'article' ? 'article' : 'document');
  const typeOpts = Object.entries(TYPE_LABELS)
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
    `<label class="check"><input type="checkbox" name="sectionIds" value="${s.id}"${mySectionIds.has(s.id) ? ' checked' : ''}> ${esc(s.title_ar)}</label>`
  ).join('');

  let filesBlock = '';
  if (isEdit) {
    const fr = await db.prepare('SELECT id, kind, filename, size FROM files WHERE material_id = ? ORDER BY id').bind(m.id).all();
    const frows = (fr.results || []).map(f => `
      <tr><td>${esc(f.filename || '—')}</td><td>${esc(f.kind || '')}</td>
      <td class="mono">${f.size ? (f.size / 1024).toFixed(0) + ' ك.ب' : '—'}</td>
      <td><button class="btn btn-sm btn-ghost" data-r-file-del="${f.id}" type="button">حذف</button></td></tr>`).join('');
    filesBlock = `
    <section class="card">
      <h2>الملفات (${(fr.results || []).length})</h2>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>الاسم</th><th>النوع</th><th>الحجم</th><th></th></tr></thead>
        <tbody>${frows || '<tr><td colspan="4" class="muted">لا ملفات مرفوعة بعد.</td></tr>'}</tbody>
      </table></div>
      <form id="rUploadForm" data-material="${m.id}">
        <div class="field"><label for="rFile">رفع ملف (PDF/صورة/صوت…)</label><input id="rFile" type="file" name="file" required></div>
        <div class="field"><label for="rKind">نوع الملف</label>
          <select id="rKind" name="kind"><option value="original">أصلي</option><option value="attachment">مرفق</option></select></div>
        <button class="btn" type="submit">رفع</button>
      </form>
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
      ${m.publish_status === 'published' ? '<p class="muted small">المادة منشورة — التعديل والحذف معطّلان. تواصل مع الإدارة عند الحاجة.</p>' : ''}
    </section>` : '';

  const ro = isEdit && m.publish_status !== 'draft' ? 'disabled' : '';
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
      ${!isEdit ? '<button class="btn btn-primary" type="submit">إنشاء المسودة</button>' : (m.publish_status === 'draft' ? '<button class="btn btn-primary" type="submit">حفظ التعديلات</button>' : '')}
    </section>
  </form>
  ${filesBlock}
  ${statusBlock}`;
  return researcherLayout({ title, active, user, body });
}

export async function renderResearcher(pathname, req, env, user) {
  if (!user) return redirect('/admin/login');
  if (user.role === 'admin') return redirect('/admin');

  const clean = pathname.replace(/\/+$/, '') || '/researcher';
  if (clean === '/researcher') return htmlRes(await researcherDashPage(env, user));
  if (clean === '/researcher/new') return htmlRes(await researcherFormPage(env, user, 'new', null));
  if (clean === '/researcher/article') return htmlRes(await researcherFormPage(env, user, 'article', null));

  const mEdit = clean.match(/^\/researcher\/(\d+)$/);
  if (mEdit) return htmlRes(await researcherFormPage(env, user, 'edit', parseInt(mEdit[1], 10)));

  return htmlRes(researcherLayout({
    title: 'غير موجود', active: 'mine', user,
    body: `<div class="card"><h2>صفحة غير موجودة</h2><p><a href="/researcher">العودة إلى منشوراتي</a></p></div>`,
  }), 404);
}
