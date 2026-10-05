// SIDJIL — الواجهة العامة (صفحات الزوار)
// renderPublic(pathname, req, env) → Response (HTML, server-side)
import { SUPPORTED_LANGS, t, htmlDir } from './i18n.js';
import { discussionsPage, discussionPage, registerPage, discussionSectionHTML, researcherLoginPage } from './discussion-views.js';
import { searchMaterials } from './lib/search.js';
import { getMaterialFull } from './lib/db.js';
import { buildCitation } from './lib/citation.js';
import { MATERIAL_LEVELS, materialLevelLabel, materialLevelDescription } from './lib/material-levels.js';

// الأنواع الستة للوصول السريع (التصور §6) + كل الأنواع الثمانية
export const QUICK_TYPES = ['document', 'book', 'image', 'manuscript', 'map', 'press'];
export const ALL_TYPES = ['document', 'book', 'manuscript', 'image', 'map', 'press', 'correspondence', 'excerpt', 'journal', 'article'];

export const REGIONS = [
  { ar: 'وداي', fr: 'Ouaddaï' },
  { ar: 'كانم', fr: 'Kanem' },
  { ar: 'باقرمي', fr: 'Baguirmi' },
  { ar: 'دار سيلا', fr: 'Dar Sila' },
  { ar: 'البحيرة', fr: 'Lac' },
  { ar: 'تيبستي', fr: 'Tibesti' },
  { ar: 'إنيدي', fr: 'Ennedi' },
  { ar: 'نجامينا', fr: "N'Djamena" },
];

const PER_PAGE = 20;

/* ---------- أدوات مساعدة ---------- */

export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function typeLabel(lang, type) {
  return t(lang, 'type_' + type, {});
}

export function levelLabel(lang, level) {
  return materialLevelLabel(level, lang);
}

export function confidenceLabel(lang, c) {
  return t(lang, 'confidence_' + (c || 'unknown'), {});
}

export function translationStatusLabel(lang, s) {
  return t(lang, 'translation_status_' + (s || 'none'), {});
}

export function versionLabel(lang, v) {
  return v === 'original' ? t(lang, 'original') : t(lang, v);
}

export function langPath(ctx, path) {
  // رابط يحافظ على لغة الواجهة
  const u = new URL(path, 'https://x/');
  u.searchParams.set('lang', ctx.lang);
  return u.pathname + '?' + u.searchParams.toString();
}

export function displayTitle(lang, m) {
  // العربية أولًا دائمًا (لغة الفهرسة)، ثم العنوان الأصلي
  return (m.title_ar || '').trim() || (m.title_orig || '').trim() || m.ark || '';
}

/* ---------- التخطيط العام ---------- */

function head(ctx, { title, description, ogImage, canonical }) {
  const { lang, dir } = ctx;
  // الـPWA القابل للتثبيت مقتصر على نطاق التطبيق (app.sidjil.org) وحده
  const site = t(lang, 'site_name');
  const fullTitle = title ? `${title} — ${site}` : `${site} — ${t(lang, 'site_sub')}`;
  const desc = description || t(lang, 'footer_about');
  const canon = canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '';
  // روابط OG مطلقة (مطلوبة لمنصات المشاركة)
  let og = '';
  if (ogImage) {
    try { og = `<meta property="og:image" content="${esc(new URL(ogImage, ctx.url).href)}">`; }
    catch (_) { og = `<meta property="og:image" content="${esc(ogImage)}">`; }
  }
  const ogUrl = canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '';
  const csrfMeta = ctx.csrfToken
    ? `<meta name="csrf-token" content="${esc(ctx.csrfToken)}">`
    : '';
  const themeInit = `<script>try{var __st=localStorage.getItem('sidjil-theme');if(__st!=='dark'&&__st!=='light'){__st=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',__st);}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>`;
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
${themeInit}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${csrfMeta}
${canon}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="${lang === 'fr' ? 'fr_FR' : 'ar_AR'}">
${og}
${ogUrl}
<meta name="theme-color" content="#1f4276" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101724" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/logo.png" type="image/png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="مجلس سِجِل">
<link rel="apple-touch-icon" href="/logo.png">
<link rel="preload" href="/fonts/ibm-plex-sans-arabic-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css?v=20261010-reader-layout">
</head>`;
}

function themeToggleHTML(ctx) {
  return `<button class="theme-toggle" id="themeToggle" type="button" aria-label="${esc(t(ctx.lang, 'theme_toggle'))}" title="${esc(t(ctx.lang, 'theme_toggle'))}">
  <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
  <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
</button>`;
}

function header(ctx, active = '') {
  const { lang } = ctx;
  const L = (p, label) => `<a class="nav-link${active === p ? ' active' : ''}" href="${langPath(ctx, p)}">${esc(t(lang, label))}</a>`;
  const other = lang === 'ar' ? 'fr' : 'ar';
  const switchUrl = (() => {
    const u = new URL(ctx.url);
    u.searchParams.set('lang', other);
    return u.pathname + u.search + u.hash;
  })();
  const explorePages = ['/categories', '/places', '/people', '/sources'];
  const exploreActive = explorePages.includes(active);
  const caret = `<svg class="drop-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`;
  return `<a class="skip" href="#main">${esc(t(lang, 'skip_to_content'))}</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${langPath(ctx, '/')}" aria-label="${esc(t(lang, 'site_name'))}">
      <span class="brand-logo-wrap" aria-hidden="true"><img class="brand-logo" src="/logo.png" alt="" height="36"></span>
      <span class="brand-text">
        <span class="brand-name">${esc(t(lang, 'site_name'))}</span>
      </span>
    </a>
    <button class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="mainNav" aria-label="${esc(t(lang, 'menu'))}">
      <span></span><span></span><span></span>
    </button>
    <nav class="main-nav" id="mainNav" aria-label="main">
      ${L('/sections', 'nav_sections')}
      ${L('/journal', 'nav_journal')}
      ${L('/discussions', 'nav_discussions')}
      ${L('/archive', 'nav_archive')}
      ${L('/collections', 'nav_collections')}
      <div class="nav-drop">
        <button type="button" class="nav-link nav-drop-btn${exploreActive ? ' active' : ''}" id="exploreBtn" aria-haspopup="true" aria-expanded="false">${esc(t(lang, 'nav_explore'))}${caret}</button>
        <div class="nav-drop-menu" role="menu" aria-labelledby="exploreBtn">
          ${L('/categories', 'nav_categories')}
          ${L('/places', 'nav_places')}
          ${L('/people', 'nav_people')}
          ${L('/sources', 'nav_sources')}
        </div>
      </div>
      <form class="header-searchbox" action="${langPath(ctx, '/search')}" method="get" role="search">
        <input type="hidden" name="lang" value="${lang}">
        <input type="search" name="q" placeholder="${esc(t(lang, 'search_placeholder'))}" aria-label="${esc(t(lang, 'nav_search'))}" autocomplete="off">
        <button type="submit" aria-label="${esc(t(lang, 'search_button'))}">${searchIcon}</button>
      </form>
    </nav>
    <div class="header-tools">
      ${themeToggleHTML(ctx)}
      <a class="lang-switch" href="${esc(switchUrl)}" title="${esc(t(lang, 'lang_label'))}">${other === 'ar' ? 'العربية' : 'Français'}</a>
    </div>
  </div>
</header>`;
}

function footer(ctx) {
  const { lang } = ctx;
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-col">
      <div class="footer-brand">
        <span class="footer-logo-wrap" aria-hidden="true"><img src="/logo.png" alt="" height="34"></span>
        <div>
          <div class="footer-name">${esc(t(lang, 'site_name'))}</div>
          <div class="footer-tag">${esc(t(lang, 'tagline'))}</div>
        </div>
      </div>
      <p class="footer-about">${esc(t(lang, 'footer_about'))}</p>
    </div>
    <nav class="footer-col" aria-label="footer">
      <h3>${esc(t(lang, 'nav_explore'))}</h3>
      <a href="${langPath(ctx, '/sections')}">${esc(t(lang, 'nav_sections'))}</a>
      <a href="${langPath(ctx, '/archive')}">${esc(t(lang, 'nav_archive'))}</a>
      <a href="${langPath(ctx, '/collections')}">${esc(t(lang, 'nav_collections'))}</a>
      <a href="${langPath(ctx, '/categories')}">${esc(t(lang, 'nav_categories'))}</a>
      <a href="${langPath(ctx, '/places')}">${esc(t(lang, 'nav_places'))}</a>
      <a href="${langPath(ctx, '/people')}">${esc(t(lang, 'nav_people'))}</a>
      <a href="${langPath(ctx, '/sources')}">${esc(t(lang, 'nav_sources'))}</a>
    </nav>
    <nav class="footer-col" aria-label="footer-2">
      <h3>${esc(t(lang, 'site_name'))}</h3>
      <a href="${langPath(ctx, '/journal')}">${esc(t(lang, 'nav_journal'))}</a>
      <a href="${langPath(ctx, '/discussions')}">${esc(t(lang, 'nav_discussions'))}</a>
      <a href="${langPath(ctx, '/advanced-search')}">${esc(t(lang, 'nav_advanced'))}</a>
      <a href="${langPath(ctx, '/about')}">${esc(t(lang, 'nav_about'))}</a>
      <a href="${langPath(ctx, '/methodology')}">${esc(t(lang, 'nav_methodology'))}</a>
    </nav>
  </div>
  <div class="footer-bottom">
    <div class="wrap">© ${year} ${esc(t(lang, 'site_name'))} — ${esc(t(lang, 'all_rights'))}.</div>
  </div>
</footer>`;
}

export function layout(ctx, { title, description, ogImage, canonical, active, content }) {
  return head(ctx, { title, description, ogImage, canonical }) +
    `<body>\n${header(ctx, active)}\n<main id="main">\n${content}\n</main>\n${footer(ctx)}\n${pwaBar(ctx, active)}\n<script src="/app.js" defer></script>\n</body>\n</html>`;
}

// شريط سفلي يظهر فقط في وضع التطبيق (standalone)
function pwaBar(ctx, active = '') {
  const { lang } = ctx;
  const items = [
    ['/', 'nav_home', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>'],
    ['/discussions', 'nav_discussions', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/></svg>'],
    ['/sections', 'nav_sections', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'],
    ['/search', 'nav_search', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'],
  ];
  const links = items.map(([p, label, svg]) =>
    `<a href="${langPath(ctx, p)}" class="${active === p ? 'active' : ''}">${svg}<span>${esc(t(lang, label))}</span></a>`
  ).join('');
  return `<nav class="pwa-bar" aria-label="app">${links}</nav>`;
}

/* ---------- بطاقات المواد ---------- */

// إثراء دفعي: أماكن + مصادر + مصغرات لصفوف materials
export async function enrichMaterials(env, items) {
  const db = env.DB;
  const ids = items.map(m => m.id).filter(Boolean);
  const placeIds = [...new Set(items.map(m => m.place_id).filter(Boolean))];
  const sourceIds = [...new Set(items.map(m => m.source_id).filter(Boolean))];
  const placeMap = {}, sourceMap = {}, thumbMap = {};
  if (placeIds.length) {
    const rows = await db.prepare(
      `SELECT id, name_ar, name_orig FROM places WHERE id IN (${placeIds.map(() => '?').join(',')})`
    ).bind(...placeIds).all();
    for (const r of rows.results || []) placeMap[r.id] = r;
  }
  if (sourceIds.length) {
    const rows = await db.prepare(
      `SELECT id, name, name_ar FROM sources WHERE id IN (${sourceIds.map(() => '?').join(',')})`
    ).bind(...sourceIds).all();
    for (const r of rows.results || []) sourceMap[r.id] = r;
  }
  if (ids.length) {
    const rows = await db.prepare(
      `SELECT material_id, id FROM files
        WHERE material_id IN (${ids.map(() => '?').join(',')})
          AND (kind IN ('thumbnail', 'cover') OR mime LIKE 'image/%')
        ORDER BY material_id, CASE kind WHEN 'cover' THEN 0 WHEN 'thumbnail' THEN 1 ELSE 2 END, id`
    ).bind(...ids).all();
    for (const r of rows.results || []) {
      if (!(r.material_id in thumbMap)) thumbMap[r.material_id] = r.id;
    }
  }
  return items.map(m => ({ ...m, _place: placeMap[m.place_id], _source: sourceMap[m.source_id], _thumb: thumbMap[m.id] }));
}

export function cardHTML(ctx, m) {
  const { lang } = ctx;
  const title = displayTitle(lang, m);
  const titleOrig = (m.title_ar && m.title_orig && m.title_orig !== m.title_ar)
    ? `<div class="card-orig">${esc(m.title_orig)}</div>` : '';
  const thumb = m._thumb
    ? `<img class="card-thumb" src="/file/${m._thumb}" alt="" loading="lazy">`
    : `<div class="card-thumb card-thumb-empty" aria-hidden="true"><span>${esc(typeLabel(lang, m.type))}</span></div>`;
  const place = m._place ? `<span class="card-meta-item">📍 ${esc(m._place.name_ar || m._place.name_orig || '')}</span>` : '';
  const source = m._source ? `<span class="card-meta-item">🏛 ${esc(m._source.name_ar || m._source.name)}</span>` : '';
  const date = m.date_text || m.year || '';
  const snippet = m.snippet
    ? `<p class="card-snippet">${m.snippet}</p>` : '';
  return `<article class="card">
    <a class="card-link" href="${langPath(ctx, '/document/' + encodeURIComponent(m.ark))}" aria-label="${esc(title)}">
      ${thumb}
      <div class="card-body">
        <div class="card-tags"><span class="badge badge-type">${esc(typeLabel(lang, m.type))}</span>${m.material_level ? `<span class="badge badge-level" title="${esc(materialLevelDescription(m.material_level, lang))}">${esc(levelLabel(lang, m.material_level))}</span>` : ''}</div>
        <h3 class="card-title">${esc(title)}</h3>
        ${titleOrig}
        ${snippet}
        <div class="card-meta">
          ${date ? `<span class="card-meta-item">🗓 ${esc(date)}</span>` : ''}
          ${place}
          ${source}
        </div>
      </div>
    </a>
  </article>`;
}

export function cardsGrid(ctx, items) {
  if (!items.length) return `<p class="empty">${esc(t(ctx.lang, 'no_results'))}</p>`;
  return `<div class="cards-grid">${items.map(m => cardHTML(ctx, m)).join('')}</div>`;
}

export function paginationHTML(ctx, page, perPage, total, baseUrl) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return '';
  const { lang } = ctx;
  const urlFor = (p) => {
    const u = new URL(baseUrl, 'https://x/');
    u.searchParams.set('page', String(p));
    u.searchParams.set('lang', lang);
    return esc(u.pathname + '?' + u.searchParams.toString());
  };
  let nums = '';
  const win = 2;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= win) {
      nums += p === page
        ? `<span class="pg-cur" aria-current="page">${p}</span>`
        : `<a class="pg-num" href="${urlFor(p)}">${p}</a>`;
    } else if (Math.abs(p - page) === win + 1) {
      nums += `<span class="pg-gap">…</span>`;
    }
  }
  return `<nav class="pagination" aria-label="${esc(t(lang, 'page'))}">
    ${page > 1 ? `<a class="pg-btn" href="${urlFor(page - 1)}">‹ ${esc(t(lang, 'prev'))}</a>` : ''}
    ${nums}
    ${page < pages ? `<a class="pg-btn" href="${urlFor(page + 1)}">${esc(t(lang, 'next'))} ›</a>` : ''}
    <span class="pg-info">${esc(t(lang, 'page'))} ${page} ${esc(t(lang, 'of'))} ${pages} · ${total} ${esc(t(lang, 'results_count'))}</span>
  </nav>`;
}

export function confidenceBadge(lang, value) {
  const cls = 'conf-' + (value || 'unknown');
  return `<span class="conf ${cls}" title="${esc(confidenceLabel(lang, value))}">${esc(confidenceLabel(lang, value))}</span>`;
}

/* ---------- الصفحة الرئيسية ---------- */

async function homePage(ctx) {
  const { lang, env } = ctx;
  const db = env.DB;

  // أحدث الإضافات (8)
  const latestRes = await db.prepare(
    `SELECT * FROM materials WHERE publish_status='published' ORDER BY created_at DESC LIMIT 8`
  ).all();
  const latest = await enrichMaterials(env, latestRes.results || []);

  // عدّادات الأنواع للوصول السريع
  const typeCounts = {};
  const tc = await db.prepare(
    `SELECT type, COUNT(*) c FROM materials WHERE publish_status='published' GROUP BY type`
  ).all();
  for (const r of tc.results || []) typeCounts[r.type] = r.c;

  // عدّادات المناطق
  const regionCounts = {};
  const rc = await db.prepare(
    `SELECT p.region AS region, COUNT(*) c FROM materials m
     JOIN places p ON p.id = m.place_id
     WHERE m.publish_status='published' AND p.region IS NOT NULL AND p.region <> ''
     GROUP BY p.region`
  ).all();
  for (const r of rc.results || []) regionCounts[r.region] = r.c;

  // المجموعات المختارة (الموضوعية فقط — الأقسام لها شريطها الخاص)
  const colRes = await db.prepare(
    `SELECT * FROM collections WHERE kind = 'collection' ORDER BY sort_order ASC, id ASC LIMIT 6`
  ).all();
  const collections = colRes.results || [];
  const colMatCounts = {};
  if (collections.length) {
    const ids = collections.map(c => c.id);
    const cc = await db.prepare(
      `SELECT c.id, COUNT(mc.material_id) n FROM collections c
       LEFT JOIN material_collections mc ON mc.collection_id = c.id
       LEFT JOIN materials m ON m.id = mc.material_id AND m.publish_status='published'
       WHERE c.id IN (${ids.map(() => '?').join(',')})
       GROUP BY c.id`
    ).bind(...ids).all();
    for (const r of cc.results || []) colMatCounts[r.id] = r.n;
  }

  const quick = QUICK_TYPES.map(tp => `
    <a class="quick-card" href="${langPath(ctx, '/archive?type=' + tp)}">
      <span class="quick-icon" aria-hidden="true">${esc(quickIcon(tp))}</span>
      <span class="quick-name">${esc(typeLabel(lang, tp))}</span>
      <span class="quick-count">${typeCounts[tp] || 0}</span>
    </a>`).join('');

  const regions = REGIONS.map(r => {
    const name = lang === 'fr' ? r.fr : r.ar;
    const n = regionCounts[r.ar] || regionCounts[r.fr] || 0;
    return `<a class="region-chip" href="${langPath(ctx, '/archive?region=' + encodeURIComponent(r.ar))}">
      <span class="region-name">${esc(name)}</span><span class="region-count">${n}</span></a>`;
  }).join('');

  const cols = collections.length ? collections.map(c => `
    <a class="collection-card" href="${langPath(ctx, '/collection/' + c.id)}">
      <span class="collection-card-title">${esc(lang === 'fr' && c.title_fr ? c.title_fr : c.title_ar)}</span>
      ${colDesc(lang, c) ? `<span class="collection-card-desc">${esc(truncate(colDesc(lang, c), 140))}</span>` : ''}
      <span class="collection-card-count">${colMatCounts[c.id] || 0} ${esc(t(lang, 'materials_count'))}</span>
      <span class="collection-card-go">${esc(t(lang, 'explore_collection'))} →</span>
    </a>`).join('') : `<p class="empty">—</p>`;

  // الإعلانات النشطة ضمن تاريخها
  const annRes = await db.prepare(
    `SELECT * FROM announcements
     WHERE active = 1
       AND (starts_at IS NULL OR starts_at = '' OR starts_at <= datetime('now'))
       AND (ends_at IS NULL OR ends_at = '' OR ends_at >= datetime('now'))
     ORDER BY sort_order ASC, id ASC`
  ).all();
  const announcements = (annRes.results || []).map(a => {
    const title = lang === 'fr' && a.title_fr ? a.title_fr : a.title_ar;
    const body = lang === 'fr' && a.body_fr ? a.body_fr : a.body_ar;
    return `<div class="announcement" data-announcement="${a.id}">
      <h3>${esc(title)}</h3>
      ${body ? `<p>${esc(truncate(body, 220))}</p>` : ''}
      ${a.link_url ? `<a class="ann-link" href="${esc(a.link_url)}" target="_blank" rel="noopener">${esc(t(lang, 'announcement_more'))} →</a>` : ''}
      <button class="ann-dismiss" type="button" data-ann-dismiss="${a.id}" aria-label="${esc(t(lang, 'announcement_dismiss'))}">×</button>
    </div>`;
  }).join('');
  const annHTML = announcements
    ? `<section class="wrap" aria-label="${esc(t(lang, 'announcements_title'))}"><div class="announcements">${announcements}</div></section>`
    : '';

  // شريط أقسام سجل
  const secRes = await db.prepare(
    `SELECT s.*, COUNT(m.id) AS n
     FROM collections s
     LEFT JOIN material_collections mc ON mc.collection_id = s.id
     LEFT JOIN materials m ON m.id = mc.material_id AND m.publish_status = 'published'
     WHERE s.kind = 'section'
     GROUP BY s.id ORDER BY s.sort_order ASC, s.id ASC`
  ).all();
  const sections = secRes.results || [];
  const secTiles = sections.map(s => `
    <a class="section-tile" href="${langPath(ctx, '/section/' + s.id)}">
      <span class="section-tile-title">${esc(lang === 'fr' && s.title_fr ? s.title_fr : s.title_ar)}</span>
      <span class="section-tile-count">${s.n || 0} ${esc(t(lang, 'section_count_materials'))}</span>
    </a>`).join('');
  const secHTML = sections.length ? `
  <section class="wrap section">
    <div class="section-head">
      <h2 class="section-title">${esc(t(lang, 'sections_strip_title'))}</h2>
      <a class="more-link" href="${langPath(ctx, '/sections')}">${esc(t(lang, 'sections_strip_more'))} →</a>
    </div>
    <div class="sections-strip">${secTiles}</div>
  </section>` : '';

  const content = `
  <section class="hero">
    <div class="wrap hero-inner">
      <div class="hero-seal" aria-hidden="true">
        <span class="hero-logo-wrap"><img src="/logo.png" alt="" height="84"></span>
      </div>
      <h1 class="hero-title">${esc(t(lang, 'site_name'))}</h1>
      <div class="hero-sub">${esc(t(lang, 'site_sub'))}</div>
      <p class="hero-tagline">${esc(t(lang, 'tagline'))}</p>
      <p class="hero-desc">${esc(t(lang, 'hero_desc'))}</p>
      <form class="hero-search" action="${langPath(ctx, '/search')}" method="get" role="search">
        <input type="hidden" name="lang" value="${lang}">
        <input type="search" name="q" class="hero-input" placeholder="${esc(t(lang, 'search_placeholder'))}" aria-label="${esc(t(lang, 'nav_search'))}" autocomplete="off">
        <button type="submit" class="btn btn-primary btn-lg">${esc(t(lang, 'search_button'))}</button>
      </form>
    </div>
  </section>

  ${annHTML}

  ${secHTML}

  <section class="wrap section" aria-labelledby="sidjilMapTitle">
    <div class="section-head">
      <h2 class="section-title" id="sidjilMapTitle">${esc(t(lang, 'map_title'))}</h2>
    </div>
    <p class="section-sub">${esc(t(lang, 'map_subtitle'))}</p>
    <div id="sidjilMap" data-sidjil-map
         data-lang="${lang}" data-langq="?lang=${lang}"
         data-str-loading="${esc(t(lang, 'map_loading'))}"
         data-str-error="${esc(t(lang, 'map_error'))}"
         data-str-no-points="${esc(t(lang, 'map_no_points'))}"
         data-str-events="${esc(t(lang, 'map_events'))}"
         data-str-region="${esc(t(lang, 'map_region'))}"
         data-str-all-regions="${esc(t(lang, 'map_all_regions'))}"
         data-str-kind="${esc(t(lang, 'map_kind'))}"
         data-str-city="${esc(t(lang, 'map_kind_city'))}"
         data-str-region-kind="${esc(t(lang, 'map_kind_region'))}"
         data-str-site="${esc(t(lang, 'map_kind_site'))}"
         data-str-view-material="${esc(t(lang, 'map_view_material'))}"
         data-str-map-label="${esc(t(lang, 'map_aria'))}"></div>
  </section>
  <script src="/js/sidjil-map.js" defer></script>

  <section class="wrap section">
    <h2 class="section-title">${esc(t(lang, 'quick_access'))}</h2>
    <div class="quick-grid">${quick}</div>
  </section>

  <section class="wrap section">
    <div class="section-head">
      <h2 class="section-title">${esc(t(lang, 'latest_additions'))}</h2>
      <a class="more-link" href="${langPath(ctx, '/archive')}">${esc(t(lang, 'view_all'))} →</a>
    </div>
    ${cardsGrid(ctx, latest)}
  </section>

  <section class="wrap section">
    <h2 class="section-title">${esc(t(lang, 'explore_regions'))}</h2>
    <div class="region-grid">${regions}</div>
  </section>

  <section class="wrap section">
    <h2 class="section-title">${esc(t(lang, 'featured_collections'))}</h2>
    <div class="collections-grid">${cols}</div>
  </section>`;

  return layout(ctx, {
    title: null, // العنوان الافتراضي: الاسم + الشعار
    description: t(lang, 'tagline2') + ' — ' + t(lang, 'hero_desc'),
    active: '/',
    content,
  });
}

function quickIcon(tp) {
  return { document: '📜', book: '📚', image: '🖼', manuscript: '📖', map: '🗺', press: '📰', correspondence: '✉', excerpt: '❝', journal: '📓', article: '📝' }[tp] || '📄';
}

export function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/** وصف المجموعة/القسم حسب لغة الواجهة — الفرنسي أولًا ثم العربي كبديل */
function colDesc(lang, c) {
  return lang === 'fr' && c.description_fr ? c.description_fr : c.description;
}

/* ---------- الأرشيف + البحث ---------- */

async function filterOptions(env) {
  const db = env.DB;
  const [types, regions, langs, sources] = await Promise.all([
    db.prepare(`SELECT DISTINCT type FROM materials WHERE publish_status='published'`).all(),
    db.prepare(`SELECT DISTINCT region FROM places WHERE region IS NOT NULL AND region <> '' ORDER BY region`).all(),
    db.prepare(`SELECT DISTINCT language FROM materials WHERE publish_status='published' AND language IS NOT NULL AND language <> '' ORDER BY language`).all(),
    db.prepare(`SELECT id, name, name_ar FROM sources ORDER BY name`).all(),
  ]);
  return {
    types: (types.results || []).map(r => r.type),
    regions: (regions.results || []).map(r => r.region),
    langs: (langs.results || []).map(r => r.language),
    sources: sources.results || [],
    levels: Object.keys(MATERIAL_LEVELS),
  };
}

function filterBarHTML(ctx, opts, current, basePath) {
  const { lang } = ctx;
  const sel = (name, options, allLabel) => `
    <label class="filter-field"><span>${esc(t(lang, 'field_' + name))}</span>
    <select name="${name}">
      <option value="">${esc(allLabel)}</option>
      ${options.map(o => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return `<option value="${esc(val)}"${String(current[name]) === String(val) ? ' selected' : ''}>${esc(label)}</option>`;
      }).join('')}
    </select></label>`;
  return `<form class="filter-bar" action="${langPath(ctx, basePath)}" method="get">
    <input type="hidden" name="lang" value="${lang}">
    <input type="search" name="q" class="filter-q" value="${esc(current.q || '')}" placeholder="${esc(t(lang, 'search_placeholder'))}" aria-label="${esc(t(lang, 'nav_search'))}">
    ${sel('type', opts.types.map(tp => ({ value: tp, label: typeLabel(lang, tp) })), t(lang, 'all_types'))}
    ${sel('level', opts.levels.map(level => ({ value: level, label: levelLabel(lang, level) })), lang === 'fr' ? 'Tous les formats' : 'كل التصنيفات')}
    ${sel('region', opts.regions, t(lang, 'all_regions'))}
    ${sel('language', opts.langs, t(lang, 'all_languages'))}
    ${sel('source', opts.sources.map(s => ({ value: String(s.id), label: s.name_ar || s.name })), t(lang, 'all_sources'))}
    <button type="submit" class="btn btn-primary">${esc(t(lang, 'filters'))}</button>
    <a class="btn btn-ghost" href="${langPath(ctx, basePath)}">${esc(t(lang, 'clear_filters'))}</a>
  </form>`;
}

async function archivePage(ctx) {
  const { lang, env, url } = ctx;
  const sp = url.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const params = {
    q: sp.get('q') || '',
    type: sp.get('type') || '',
    region: sp.get('region') || '',
    lang: sp.get('language') || '',
    sourceId: sp.get('source') || '',
    level: sp.get('level') || '',
    page, perPage: PER_PAGE, publishedOnly: true,
  };
  if (!params.type) delete params.type;
  if (!params.region) delete params.region;
  if (!params.lang) delete params.lang;
  if (!params.sourceId) delete params.sourceId;
  if (!params.level) delete params.level;

  const res = await searchMaterials(env.DB, params);
  const items = await enrichMaterials(env, res.items || []);
  const opts = await filterOptions(env);

  const base = '/archive?' + new URLSearchParams([...sp].filter(([k]) => k !== 'page')).toString();
  const content = `
  <div class="wrap page-head">
    <h1 class="page-title">${esc(t(lang, 'nav_archive'))}</h1>
    ${filterBarHTML(ctx, opts, { q: params.q, type: params.type || '', level: params.level || '', region: params.region || '', language: params.lang || '', source: params.sourceId || '' }, '/archive')}
  </div>
  <div class="wrap section">
    ${cardsGrid(ctx, items)}
    ${paginationHTML(ctx, res.page || page, res.perPage || PER_PAGE, res.total || 0, base)}
  </div>`;
  return layout(ctx, {
    title: t(lang, 'nav_archive'),
    description: t(lang, 'nav_archive') + ' — ' + t(lang, 'footer_about'),
    active: '/archive',
    content,
  });
}

async function searchPage(ctx) {
  const { lang, env, url } = ctx;
  const sp = url.searchParams;
  const q = (sp.get('q') || '').trim();
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  let items = [], total = 0;
  if (q) {
    const res = await searchMaterials(env.DB, { q, page, perPage: PER_PAGE, publishedOnly: true });
    items = await enrichMaterials(env, res.items || []);
    total = res.total || 0;
  }
  const base = '/search?' + new URLSearchParams([...sp].filter(([k]) => k !== 'page')).toString();
  const content = `
  <div class="wrap page-head">
    <h1 class="page-title">${esc(t(lang, 'search_results'))}</h1>
    <form class="big-search" action="${langPath(ctx, '/search')}" method="get" role="search">
      <input type="hidden" name="lang" value="${lang}">
      <input type="search" name="q" value="${esc(q)}" placeholder="${esc(t(lang, 'search_placeholder'))}" aria-label="${esc(t(lang, 'nav_search'))}">
      <button type="submit" class="btn btn-primary">${esc(t(lang, 'search_button'))}</button>
    </form>
    ${q ? `<p class="results-line">${esc(t(lang, 'results_for'))} «${esc(q)}» — ${total} ${esc(t(lang, 'results_count'))}</p>` : ''}
  </div>
  <div class="wrap section">
    ${q ? cardsGrid(ctx, items) : `<p class="empty">${esc(t(lang, 'search_placeholder'))}</p>`}
    ${paginationHTML(ctx, page, PER_PAGE, total, base)}
  </div>`;
  return layout(ctx, {
    title: q ? `${t(lang, 'search_results')}: ${q}` : t(lang, 'nav_search'),
    description: t(lang, 'search_results') + (q ? ' — ' + q : ''),
    active: '/search',
    content,
  });
}

/* ---------- البحث المتقدم ---------- */

async function advancedSearchPage(ctx) {
  const { lang, env, url } = ctx;
  const sp = url.searchParams;
  const hasQuery = [...sp.keys()].some(k => k !== 'lang' && k !== 'page' && sp.get(k));
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);

  const db = env.DB;
  const [opts, people, tags] = await Promise.all([
    filterOptions(env),
    db.prepare(`SELECT id, name_ar, name_orig FROM people ORDER BY name_ar LIMIT 500`).all(),
    db.prepare(`SELECT id, name_ar, name_orig FROM tags ORDER BY name_ar LIMIT 500`).all(),
  ]);
  const peopleRows = people.results || [], tagRows = tags.results || [];

  let items = [], total = 0;
  if (hasQuery) {
    const params = {
      q: sp.get('q') || '', page, perPage: PER_PAGE, publishedOnly: true,
    };
    const map = { type: 'type', level: 'level', fromYear: 'from_year', toYear: 'to_year', region: 'region', lang: 'language', sourceId: 'source', personId: 'person', tagId: 'tag', translationStatus: 'translation_status' };
    for (const [pk, qk] of Object.entries(map)) {
      const v = sp.get(qk);
      if (v) params[pk] = v;
    }
    const res = await searchMaterials(db, params);
    items = await enrichMaterials(env, res.items || []);
    total = res.total || 0;
  }

  const field = (name, label, inner) => `
    <label class="adv-field"><span>${esc(label)}</span>${inner}</label>`;
  const sel = (name, options, allLabel) => `
    <select name="${name}">
      <option value="">${esc(allLabel)}</option>
      ${options.map(o => `<option value="${esc(o.value)}"${sp.get(name) === String(o.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>`;
  const base = '/advanced-search?' + new URLSearchParams([...sp].filter(([k]) => k !== 'page')).toString();

  const content = `
  <div class="wrap page-head">
    <h1 class="page-title">${esc(t(lang, 'advanced_search_title'))}</h1>
    <p class="page-desc">${esc(t(lang, 'advanced_search_desc'))}</p>
  </div>
  <div class="wrap">
    <form class="adv-form" action="${langPath(ctx, '/advanced-search')}" method="get">
      <input type="hidden" name="lang" value="${lang}">
      ${field('q', t(lang, 'field_keyword'), `<input type="search" name="q" value="${esc(sp.get('q') || '')}" placeholder="${esc(t(lang, 'search_placeholder'))}">`)}
      ${field('type', t(lang, 'field_type'), sel('type', opts.types.map(tp => ({ value: tp, label: typeLabel(lang, tp) })), t(lang, 'all_types')))}
      ${field('level', lang === 'fr' ? 'Format de la matière' : 'تصنيف المادة', sel('level', opts.levels.map(level => ({ value: level, label: levelLabel(lang, level) })), lang === 'fr' ? 'Tous les formats' : 'كل التصنيفات'))}
      <div class="adv-row">
        ${field('from_year', t(lang, 'field_from_year'), `<input type="number" name="from_year" value="${esc(sp.get('from_year') || '')}" min="1500" max="2100">`)}
        ${field('to_year', t(lang, 'field_to_year'), `<input type="number" name="to_year" value="${esc(sp.get('to_year') || '')}" min="1500" max="2100">`)}
      </div>
      ${field('region', t(lang, 'field_region'), sel('region', opts.regions.map(r => ({ value: r, label: r })), t(lang, 'all_regions')))}
      ${field('language', t(lang, 'field_language'), sel('language', opts.langs.map(l => ({ value: l, label: l })), t(lang, 'all_languages')))}
      ${field('source', t(lang, 'field_source'), sel('source', opts.sources.map(s => ({ value: String(s.id), label: s.name_ar || s.name })), t(lang, 'all_sources')))}
      ${field('person', t(lang, 'field_person'), sel('person', peopleRows.map(p => ({ value: String(p.id), label: p.name_ar + (p.name_orig ? ' — ' + p.name_orig : '') })), '—'))}
      ${field('tag', t(lang, 'field_tag'), sel('tag', tagRows.map(x => ({ value: String(x.id), label: x.name_ar + (x.name_orig ? ' — ' + x.name_orig : '') })), '—'))}
      <div class="adv-actions">
        <button type="submit" class="btn btn-primary btn-lg">${esc(t(lang, 'search_button'))}</button>
        <a class="btn btn-ghost" href="${langPath(ctx, '/advanced-search')}">${esc(t(lang, 'clear_filters'))}</a>
      </div>
    </form>
  </div>
  ${hasQuery ? `<div class="wrap section">
    <p class="results-line">${total} ${esc(t(lang, 'results_count'))}</p>
    ${cardsGrid(ctx, items)}
    ${paginationHTML(ctx, page, PER_PAGE, total, base)}
  </div>` : ''}`;

  return layout(ctx, {
    title: t(lang, 'advanced_search_title'),
    description: t(lang, 'advanced_search_desc'),
    active: '/advanced-search',
    content,
  });
}

/* ---------- صندوق مشاركة المادة على المنصات (أيقونات) ---------- */
const ICON_WA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
const ICON_TG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>';
const ICON_FB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
export function shareHTML(ctx, m, override) {
  const { lang } = ctx;
  const origin = new URL(ctx.url).origin;
  const url = (override && override.url) || `${origin}/document/${encodeURIComponent(m.ark)}?lang=${lang}`;
  const title = (override && override.title) || displayTitle(lang, m);
  const e = encodeURIComponent;
  const text = `${title} — ${t(lang, 'site_name')}`;
  const ic = (href, color, label, svg) => `<a class="share-ic" style="--sc:${color}" target="_blank" rel="noopener" href="${href}" title="${esc(label)}" aria-label="${esc(label)}">${svg}</a>`;
  return `<div class="share-box" role="group" aria-label="${esc(t(lang, 'share_title'))}">
    <span class="share-title">${esc(t(lang, 'share_title'))}</span>
    <div class="share-icons">
      ${ic(`https://wa.me/?text=${e(text + '\n' + url)}`, '#25d366', t(lang, 'share_whatsapp'), ICON_WA)}
      ${ic(`https://t.me/share/url?url=${e(url)}&text=${e(text)}`, '#229ed9', t(lang, 'share_telegram'), ICON_TG)}
      ${ic(`https://twitter.com/intent/tweet?url=${e(url)}&text=${e(text)}`, '#111111', t(lang, 'share_x'), ICON_X)}
      ${ic(`https://www.facebook.com/sharer/sharer.php?u=${e(url)}`, '#1877f2', t(lang, 'share_facebook'), ICON_FB)}
      <button class="share-ic" type="button" style="--sc:#0a84ff" data-copy-open="${esc(url)}" data-open="https://mujtam3.com/feed" data-app-android="intent://mujtam3.com/feed#Intent;scheme=https;package=com.mujtam3.production;S.browser_fallback_url=https%3A%2F%2Fmujtam3.com%2Ffeed;end" data-copied="${esc(t(lang, 'share_copied'))}" title="${esc(t(lang, 'share_mujtam3'))}" aria-label="${esc(t(lang, 'share_mujtam3'))}"><img src="/img/mujtam3.png" alt=""></button>
      <button class="share-ic" type="button" style="--sc:#5b6472" data-copy-link="${esc(url)}" data-copied="${esc(t(lang, 'share_copied'))}" title="${esc(t(lang, 'share_copy'))}" aria-label="${esc(t(lang, 'share_copy'))}">${ICON_LINK}</button>
    </div>
  </div>`;
}

/* ---------- كتلة عارض PDF (تُستخدم في صفحة المادة وصفحة العدد) ---------- */
function pdfViewerBlock(ctx, pdfFiles, materialId = '', documentTitle = '', fileTranslations = []) {
  const { lang } = ctx;
  if (!pdfFiles || !pdfFiles.length) return '';
  const pf = pdfFiles[0];
  const counterparts = (fileTranslations || []).filter(
    (x) => Number(x.source_file_id) === Number(pf.id) && x.translation_file_id
  );
  const langName = (l) => l === 'ar' ? (lang === 'fr' ? 'Arabe' : 'العربية') : (lang === 'fr' ? 'Français' : 'الفرنسية');
  const toggleBtns = counterparts.map((c) => {
    const label = lang === 'fr' ? `Lire en ${langName(c.target_lang)}` : `اقرأ بـ${langName(c.target_lang)}`;
    const back = lang === 'fr' ? 'Lire l’original' : 'اقرأ الأصل';
    return `<button type="button" class="btn btn-small btn-translate" data-doc-toggle data-docx="/file/${c.translation_file_id}" data-docx-lang="${esc(c.target_lang)}" data-label-read="${esc(label)}" data-label-back="${esc(back)}">${esc(label)}</button>`;
  }).join('');
  const requestBtn = counterparts.length ? '' :
    `<button type="button" class="btn btn-small btn-ghost" data-request-translation data-material-id="${esc(String(materialId))}" data-file-id="${esc(String(pf.id))}">${esc(t(lang, 'request_translation'))}</button>`;
  return `
    <section class="doc-section" id="pdfViewer">
      <h2 class="doc-section-title">${esc(t(lang, 'pdf_viewer_label'))}</h2>
      <div class="pdf-viewer" id="pdfViewerBox" data-pdf="/file/${pf.id}" data-pdf-file-id="${esc(String(pf.id))}" data-material-id="${esc(String(materialId))}">
        <div class="pdf-toolbar" role="toolbar" aria-label="${esc(t(lang, 'pdf_viewer_label'))}">
          <button type="button" class="btn btn-small" data-pdf-prev>${esc(t(lang, 'prev'))}</button>
          <span class="pdf-pageinfo"><span data-pdf-num>1</span> / <span data-pdf-count>…</span></span>
          <button type="button" class="btn btn-small" data-pdf-next>${esc(t(lang, 'next'))}</button>
          <span class="pdf-sep"></span>
          <button type="button" class="btn btn-small" data-pdf-zoom-out aria-label="${esc(t(lang, 'zoom_out'))}">−</button>
          <button type="button" class="btn btn-small" data-pdf-zoom-in aria-label="${esc(t(lang, 'zoom_in'))}">+</button>
          <button type="button" class="btn btn-small" data-pdf-fit>${esc(t(lang, 'fit_width'))}</button>
          <button type="button" class="btn btn-small" data-pdf-full>${esc(t(lang, 'fullscreen'))}</button>
          <button type="button" class="btn btn-small btn-primary" data-pdf-read data-read-label="${esc(t(lang, 'read_full_book'))}" data-close-label="${esc(t(lang, 'close_full_book'))}">${esc(t(lang, 'read_full_book'))}</button>
          ${toggleBtns}
          ${requestBtn}
          <a class="btn btn-small btn-ghost" href="/file/${pf.id}?download=1">${esc(t(lang, 'download_original'))}</a>
        </div>
        <div class="pdf-canvas-wrap" id="pdfCanvasWrap"><canvas data-pdf-canvas></canvas></div>
        <div class="docx-view hidden" data-docx-view aria-live="polite"></div>
        <div class="pdf-reading-shell hidden" data-reading-shell aria-label="${esc(t(lang, 'read_full_book'))}">
          <div class="pdf-reading-header">
            <button type="button" class="pdf-reading-close" data-reading-close aria-label="${esc(t(lang, 'close_full_book'))}">×</button>
            <div class="pdf-reading-heading">
              <strong>${esc(documentTitle || t(lang, 'pdf_viewer_label'))}</strong>
              <span><span data-reading-current>1</span> / <span data-reading-count>…</span></span>
            </div>
            <div class="pdf-reading-actions" data-reading-actions></div>
          </div>
          <div class="pdf-reading-columns">
            <section class="pdf-reading-column" data-reading-original-pane>
              <h3 class="pdf-reading-column-title">${lang === 'fr' ? 'Original' : 'الأصل'}</h3>
              <div class="pdf-reading-pages" data-pdf-reading-pages aria-live="polite"></div>
            </section>
            <section class="pdf-reading-column pdf-reading-translation-pane hidden" data-reading-translation-pane>
              <h3 class="pdf-reading-column-title" data-reading-translation-label>${lang === 'fr' ? 'Traduction' : 'الترجمة'}</h3>
            </section>
          </div>
        </div>
        <p class="pdf-error hidden" data-pdf-error>${esc(t(lang, 'pdf_load_error'))} <a href="/file/${pf.id}?download=1">${esc(t(lang, 'download_original'))}</a></p>
      </div>
    </section>
    <script type="module" src="/js/pdf-viewer.js?v=20261009-bilingual-reader"></script>
    <script src="/vendor/jszip/jszip.min.js?v=20261005" defer></script>
    <script src="/vendor/docx-preview/docx-preview.min.js?v=20261005" defer></script>
    <script src="/js/docx-reader.js?v=20261008-cache-safe" defer></script>`;
}

/* ---------- صفحة المادة ---------- */

function versionFileId(v) {
  if (!v) return null;
  if (v.file && (v.file.id || v.file_id)) return v.file.id || v.file_id;
  return v.file_id || v.fileId || null;
}
function versionFile(v) {
  if (!v) return {};
  return v.file || {};
}

async function documentPage(ctx, ark) {
  const { lang, env } = ctx;
  const db = env.DB;
  let m;
  try {
    m = await getMaterialFull(db, ark);
  } catch (e) {
    m = null;
  }
  if (!m || m.publish_status !== 'published') return notFoundPage(ctx);

  // عدّاد المشاهدات (§views.js)
  try { await db.prepare(`UPDATE materials SET views = views + 1 WHERE id = ?`).bind(m.id).run(); } catch (e) {}

  const title = displayTitle(lang, m);
  const citation = buildCitation(m, lang);
  const origin = new URL(ctx.url).origin;
  const canonical = `${origin}/document/${encodeURIComponent(m.ark)}`;

  /* --- بيانات التعريف --- */
  const dateStr = m.date_text || (m.year ? String(m.year) : '');
  const placeName = m.place ? (m.place.name_ar || m.place.name_orig) : null;
  const sourceName = m.source ? (m.source.name_ar || m.source.name) : null;
  const metaRows = [];
  if (dateStr) metaRows.push([t(lang, 'date_label'), esc(dateStr) + ' ' + confidenceBadge(lang, m.date_confidence)]);
  if (placeName) metaRows.push([t(lang, 'place_label'), esc(placeName) + ' ' + confidenceBadge(lang, m.place_confidence)]);
  if (m.author) metaRows.push([t(lang, 'author_label'), esc(m.author)]);
  if (m.photographer) metaRows.push([t(lang, 'photographer_label'), esc(m.photographer)]);
  if (m.language) metaRows.push([t(lang, 'language_label'), esc(m.language)]);
  if (sourceName) metaRows.push([t(lang, 'source_label'), m.source.website
    ? `<a href="${esc(m.source.website)}" rel="noopener" target="_blank">${esc(sourceName)}</a>` : esc(sourceName)]);
  if (m.archive_ref) metaRows.push([t(lang, 'archive_ref_label'), `<code class="ref" dir="ltr">${esc(m.archive_ref)}</code>`]);
  if (m.source_url) metaRows.push([t(lang, 'source_label') + ' ↗', `<a href="${esc(m.source_url)}" rel="noopener" target="_blank">${esc(truncate(m.source_url, 60))}</a>`]);
  if (m.rights) metaRows.push([t(lang, 'rights_label'), esc(m.rights)]);
  const tags = (m.tags || []).map(x => `<a class="tag-chip" href="${langPath(ctx, '/archive?tag=' + x.id)}">${esc(x.name_ar)}${x.name_orig ? ` <span class="latin">${esc(x.name_orig)}</span>` : ''}</a>`).join('');
  if (tags) metaRows.push([t(lang, 'tag_label'), tags]);
  const metaHTML = metaRows.map(([k, v]) => `<div class="meta-row"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('');

  const people = (m.people || []).map(p => `<a class="chip" href="${langPath(ctx, '/person/' + p.id)}">${esc(p.name_ar)}${p.name_orig ? ` <span class="latin">${esc(p.name_orig)}</span>` : ''}</a>`).join('');
  const places = (m.places || []).map(p => `<a class="chip" href="${langPath(ctx, '/place/' + p.id)}">${esc(p.name_ar)}</a>`).join('');
  const sections = (m.collections || []).filter(c => c.kind === 'section')
    .map(c => `<a class="chip" href="${langPath(ctx, '/section/' + c.id)}">${esc(lang === 'fr' && c.title_fr ? c.title_fr : c.title_ar)}</a>`).join('');
  const collections = (m.collections || []).filter(c => c.kind !== 'section')
    .map(c => `<a class="chip" href="${langPath(ctx, '/collection/' + c.id)}">${esc(lang === 'fr' && c.title_fr ? c.title_fr : c.title_ar)}</a>`).join('');

  /* --- الملفات --- */
  const files = (m.files || []).filter(f => f.kind !== 'thumbnail' && f.kind !== 'cover');
  const isImageFile = (f) => /^image\//.test(f.mime || '') || /\.(jpe?g|png|webp|tiff?|gif|heic)$/i.test(f.filename || '');
  const filesHTML = files.length ? `<ul class="file-list">` + files.map(f => {
    const url = `/file/${f.id}`;
    const size = f.size ? ` · ${formatSize(f.size)}` : '';
    const sha = f.sha256 ? `<span class="sha" dir="ltr" title="SHA-256">⛨ ${esc(String(f.sha256).slice(0, 12))}…</span>` : '';
    return `<li class="file-item">
      <span class="file-name">${esc(f.filename)}${size}</span> ${sha}
      <span class="file-actions">
        <a class="btn btn-small" href="${url}" target="_blank" rel="noopener">${esc(t(lang, 'view'))}</a>
        <a class="btn btn-small btn-ghost" href="${url}?download=1">${esc(t(lang, 'download'))}</a>
      </span></li>`;
  }).join('') + `</ul>` : '';

  /* --- عارض PDF داخل الصفحة (PDF.js — مكتبة وظيفية فقط، الأصل في R2 كما هو) --- */
  const pdfFiles = files.filter((f) => (f.mime || '') === 'application/pdf' || /\.pdf$/i.test(f.filename || ''));
  const pdfViewerHTML = pdfViewerBlock(ctx, pdfFiles, m.id, title, m.file_translations);

  /* --- معرض الصور: النسخ + مقارنة قبل/بعد --- */
  const versions = (m.image_versions || []).filter(v => versionFileId(v));
  const imageFiles = files.filter(isImageFile);
  let galleryHTML = '';
  if (versions.length || imageFiles.length) {
    const allV = versions.length ? versions : imageFiles.map(f => ({ version_type: 'original', file_id: f.id, file: f }));
    const original = allV.find(v => v.version_type === 'original') || allV[0];
    const derived = allV.filter(v => v !== original);
    const origId = versionFileId(original);
    const tabs = allV.map((v, i) => `<button type="button" class="ver-tab${v === original ? ' active' : ''}" data-vid="${versionFileId(v)}" data-vtype="${esc(v.version_type)}">${esc(versionLabel(lang, v.version_type))}</button>`).join('');
    const compareBlock = derived.length ? `
      <div class="compare-wrap" id="compareWrap">
        <h3 class="sub-title">${esc(t(lang, 'compare_title'))}</h3>
        <p class="hint">${esc(t(lang, 'compare_hint'))}</p>
        <div class="compare" id="compare" dir="ltr">
          <img class="compare-img compare-after" id="compareAfter" src="/file/${versionFileId(derived[0])}" alt="">
          <div class="compare-before" id="compareBefore"><img class="compare-img" src="/file/${origId}" alt=""></div>
          <span class="compare-label label-before">${esc(t(lang, 'original'))}</span>
          <span class="compare-label label-after" id="compareAfterLabel">${esc(versionLabel(lang, derived[0].version_type))}</span>
          <input type="range" class="compare-range" id="compareRange" min="0" max="100" value="50" aria-label="${esc(t(lang, 'compare_title'))}">
        </div>
        <p class="process-note" id="compareNote">${esc(derived[0].process_note || processDisclaimer(lang, derived[0].version_type))}</p>
        <div class="disclaimers">
          <p class="disclaimer">⚠ ${esc(t(lang, 'disclaimer_restored'))}</p>
          <p class="disclaimer">⚠ ${esc(t(lang, 'disclaimer_colorized'))}</p>
        </div>
      </div>` : '';
    galleryHTML = `
    <section class="doc-section" id="gallery">
      <h2 class="doc-section-title">${esc(t(lang, 'gallery_label'))}</h2>
      <div class="version-tabs" role="tablist" aria-label="${esc(t(lang, 'image_versions_title'))}">${tabs}</div>
      <div class="gallery-main">
        <img id="galleryImg" src="/file/${origId}" alt="${esc(title)}" loading="lazy">
      </div>
      <p class="process-note" id="galleryNote">${esc(t(lang, 'original_version_note'))}</p>
      ${compareBlock}
    </section>
    <script type="application/json" id="versionData">${esc(JSON.stringify(allV.map(v => ({ id: versionFileId(v), type: v.version_type, note: v.process_note || processDisclaimer(lang, v.version_type), label: versionLabel(lang, v.version_type) }))))}</script>`;
  }

  /* --- التفريغ --- */
  const trans = m.transcriptions || [];
  const tAuto = trans.find(x => x.layer === 'auto');
  const tManual = trans.find(x => x.layer === 'manual');
  let transcriptionHTML = '';
  if (tAuto || tManual) {
      transcriptionHTML = `<section class="doc-section" id="transcription">
      <h2 class="doc-section-title">${esc(t(lang, 'transcription_label'))}</h2>
      ${tManual ? `<h3 class="sub-title">${esc(t(lang, 'transcription_manual'))}</h3><div class="text-block" dir="auto" data-translation-source>${esc(tManual.text)}</div>` : ''}
      ${tAuto ? `<h3 class="sub-title">${esc(t(lang, 'transcription_auto'))}</h3><div class="text-block text-auto" dir="auto" data-translation-source>${esc(tAuto.text)}</div>` : ''}
    </section>`;
  }

  /* --- نظائر الترجمة اليدوية --- */
  const translationHTML = (m.file_translations || []).length
    ? '<p class="hint translation-availability">تتوفر نظائر ترجمة منسقة داخل القارئ أعلاه.</p>'
    : '';

  /* --- مواد ذات صلة --- */
  let related = (m.relations || []).map(r => r.material || r).filter(Boolean);
  if (!related.length && m.place_id) {
    try {
      const rr = await searchMaterials(db, { placeId: m.place_id, page: 1, perPage: 5, publishedOnly: true });
      related = (rr.items || []).filter(x => x.id !== m.id).slice(0, 4);
      related = await enrichMaterials(env, related);
    } catch (e) { related = []; }
  }
  const relatedHTML = related.length ? `
    <section class="doc-section">
      <h2 class="doc-section-title">${esc(t(lang, 'related_materials'))}</h2>
      ${cardsGrid(ctx, related)}
    </section>` : '';

  /* --- الاستشهاد --- */
  const citeCopyLabel = esc(t(lang, 'citation_copy'));
  const linkCopyLabel = esc(t(lang, 'copy_link'));
  const permLabel = esc(t(lang, 'permanent_link'));
  const citationHTML = `
    <section class="doc-section" id="citationBox">
      <h2 class="doc-section-title">${esc(t(lang, 'citation'))}</h2>
      <p class="hint">${esc(t(lang, 'citation_hint'))}</p>
      <blockquote class="citation-text" id="citationText" dir="auto">${esc(citation)}</blockquote>
      <div class="citation-actions">
        <button type="button" class="icon-btn" id="copyCitation" data-copied="${esc(t(lang, 'copied'))}" title="${citeCopyLabel}" aria-label="${citeCopyLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/></svg></button>
        <button type="button" class="icon-btn" id="copyLink" data-link="${esc(canonical)}" data-copied="${esc(t(lang, 'copied'))}" title="${linkCopyLabel}" aria-label="${linkCopyLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
        <a class="icon-btn" href="${esc(canonical)}" target="_blank" rel="noopener" title="${permLabel}" aria-label="${permLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
      </div>
    </section>`;

  const content = `
  <div class="wrap">
    <nav class="breadcrumb" aria-label="breadcrumb">
      <a href="${langPath(ctx, '/archive')}">${esc(t(lang, 'archive_home'))}</a> /
      <a href="${langPath(ctx, '/archive?type=' + m.type)}">${esc(typeLabel(lang, m.type))}</a> /
      <span class="ark" dir="ltr">${esc(m.ark)}</span>
    </nav>
    <article class="doc">
      <header class="doc-head">
        <div class="doc-badges">
          <span class="badge badge-type">${esc(typeLabel(lang, m.type))}</span>
          ${m.material_level ? `<span class="badge badge-level" title="${esc(materialLevelDescription(m.material_level, lang))}">${esc(levelLabel(lang, m.material_level))}</span>` : ''}
          <span class="badge badge-ark" dir="ltr">${esc(m.ark)}</span>
        </div>
        <h1 class="doc-title">${esc(title)}</h1>
        ${m.title_orig && m.title_ar && m.title_orig !== m.title_ar ? `<p class="doc-title-orig" dir="auto">${esc(m.title_orig)}</p>` : ''}
      </header>

      ${shareHTML(ctx, m)}

      <section class="doc-section">
        <h2 class="doc-section-title">${esc(t(lang, 'description_label'))}</h2>
        <dl class="meta-grid">${metaHTML}</dl>
        ${m.description ? `<div class="doc-desc" dir="auto" data-translation-description>${esc(m.description)}</div>` : `<p class="empty">${esc(t(lang, 'no_description'))}</p>`}
        ${(people || places || sections || collections) ? `<div class="chip-groups">
          ${people ? `<div class="chip-group"><span class="chip-group-label">${esc(t(lang, 'nav_people'))}:</span> ${people}</div>` : ''}
          ${places ? `<div class="chip-group"><span class="chip-group-label">${esc(t(lang, 'nav_places'))}:</span> ${places}</div>` : ''}
          ${sections ? `<div class="chip-group"><span class="chip-group-label">${esc(t(lang, 'nav_sections'))}:</span> ${sections}</div>` : ''}
          ${collections ? `<div class="chip-group"><span class="chip-group-label">${esc(t(lang, 'nav_collections'))}:</span> ${collections}</div>` : ''}
        </div>` : ''}
      </section>

      ${filesHTML ? `<section class="doc-section"><h2 class="doc-section-title">${esc(t(lang, 'files_label'))}</h2>${filesHTML}</section>` : ''}
      ${pdfViewerHTML}
      ${galleryHTML}
      ${transcriptionHTML}
      ${translationHTML}
      ${relatedHTML}
      ${await discussionSectionHTML(ctx, m)}
      ${citationHTML}
    </article>
  </div>`;

  const ogImage = versions.length ? `/file/${versionFileId(versions[0])}` : (imageFiles[0] ? `/file/${imageFiles[0].id}` : '/logo.png');
  return layout(ctx, {
    title,
    description: truncate(m.description || title, 160),
    ogImage,
    canonical,
    active: '/archive',
    content,
  });
}

function processDisclaimer(lang, versionType) {
  if (versionType === 'colorized') return t(lang, 'disclaimer_colorized');
  if (versionType === 'enhanced') return t(lang, 'disclaimer_enhanced');
  if (versionType === 'restored') return t(lang, 'disclaimer_restored');
  if (versionType === 'original') return t(lang, 'original_version_note');
  return t(lang, 'disclaimer_restored');
}

function formatSize(n) {
  n = Number(n) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

/* ---------- التصنيفات ---------- */

async function categoriesPage(ctx) {
  const { lang, env } = ctx;
  const db = env.DB;
  const counts = {};
  const r = await db.prepare(
    `SELECT type, COUNT(*) c FROM materials WHERE publish_status='published' GROUP BY type`
  ).all();
  for (const row of r.results || []) counts[row.type] = row.c;
  const cards = ALL_TYPES.map(tp => `
    <a class="cat-card" href="${langPath(ctx, '/archive?type=' + tp)}">
      <span class="cat-icon" aria-hidden="true">${esc(quickIcon(tp))}</span>
      <span class="cat-name">${esc(typeLabel(lang, tp))}</span>
      <span class="cat-count">${counts[tp] || 0} ${esc(t(lang, 'materials_count'))}</span>
    </a>`).join('');
  const content = `
  <div class="wrap page-head"><h1 class="page-title">${esc(t(lang, 'nav_categories'))}</h1></div>
  <div class="wrap section"><div class="cat-grid">${cards}</div></div>`;
  return layout(ctx, { title: t(lang, 'nav_categories'), active: '/categories', content });
}

/* ---------- الأماكن ---------- */

async function placesPage(ctx) {
  const { lang, env, url } = ctx;
  const db = env.DB;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const totalRow = await db.prepare(`SELECT COUNT(*) n FROM places`).first();
  const total = totalRow ? totalRow.n : 0;
  const rows = await db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM materials m
       LEFT JOIN material_places mp ON mp.material_id = m.id
       WHERE m.publish_status='published' AND (m.place_id = p.id OR mp.place_id = p.id)) AS n
     FROM places p ORDER BY p.name_ar LIMIT ? OFFSET ?`
  ).bind(PER_PAGE, (page - 1) * PER_PAGE).all();
  const items = (rows.results || []).map(p => `
    <a class="list-card" href="${langPath(ctx, '/place/' + p.id)}">
      <span class="list-card-title">${esc(p.name_ar)}${p.name_orig ? ` <span class="latin">${esc(p.name_orig)}</span>` : ''}</span>
      <span class="list-card-meta">${p.region ? esc(p.region) + ' · ' : ''}${p.n} ${esc(t(lang, 'materials_count'))}</span>
    </a>`).join('');
  const content = `
  <div class="wrap page-head"><h1 class="page-title">${esc(t(lang, 'nav_places'))}</h1></div>
  <div class="wrap section">
    ${items ? `<div class="list-grid">${items}</div>` : `<p class="empty">${esc(t(lang, 'no_results'))}</p>`}
    ${paginationHTML(ctx, page, PER_PAGE, total, '/places?' + url.searchParams.toString())}
  </div>`;
  return layout(ctx, { title: t(lang, 'nav_places'), active: '/places', content });
}

async function placePage(ctx, id) {
  const { lang, env, url } = ctx;
  const db = env.DB;
  const p = await db.prepare(`SELECT * FROM places WHERE id = ?`).bind(id).first();
  if (!p) return notFoundPage(ctx);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const res = await searchMaterials(db, { placeId: id, page, perPage: PER_PAGE, publishedOnly: true });
  const items = await enrichMaterials(env, res.items || []);
  const content = `
  <div class="wrap page-head">
    <nav class="breadcrumb"><a href="${langPath(ctx, '/places')}">${esc(t(lang, 'nav_places'))}</a> / ${esc(p.name_ar)}</nav>
    <h1 class="page-title">${esc(p.name_ar)}${p.name_orig ? ` <span class="latin">(${esc(p.name_orig)})</span>` : ''}</h1>
    <dl class="meta-grid">
      ${p.region ? `<div class="meta-row"><dt>${esc(t(lang, 'region_label'))}</dt><dd>${esc(p.region)}</dd></div>` : ''}
      ${p.kind ? `<div class="meta-row"><dt>${esc(t(lang, 'kind_label'))}</dt><dd>${esc(p.kind)}</dd></div>` : ''}
      <div class="meta-row"><dt>${esc(t(lang, 'place_label'))}</dt><dd>${confidenceBadge(lang, p.place_confidence)}</dd></div>
      ${p.notes ? `<div class="meta-row"><dt>${esc(t(lang, 'notes_label'))}</dt><dd dir="auto">${esc(p.notes)}</dd></div>` : ''}
    </dl>
  </div>
  <div class="wrap section">
    <h2 class="section-title">${esc(t(lang, 'materials_of_place'))} (${res.total || 0})</h2>
    ${cardsGrid(ctx, items)}
    ${paginationHTML(ctx, page, PER_PAGE, res.total || 0, '/place/' + id + '?' + url.searchParams.toString())}
  </div>`;
  return layout(ctx, {
    title: p.name_ar,
    description: `${p.name_ar} — ${t(lang, 'nav_places')} — ${t(lang, 'site_name')}`,
    active: '/places',
    content,
  });
}

/* ---------- الشخصيات ---------- */

async function peoplePage(ctx) {
  const { lang, env, url } = ctx;
  const db = env.DB;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const totalRow = await db.prepare(`SELECT COUNT(*) n FROM people`).first();
  const total = totalRow ? totalRow.n : 0;
  const rows = await db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM material_people mp JOIN materials m ON m.id = mp.material_id
       WHERE mp.person_id = p.id AND m.publish_status='published') AS n
     FROM people p ORDER BY p.name_ar LIMIT ? OFFSET ?`
  ).bind(PER_PAGE, (page - 1) * PER_PAGE).all();
  const items = (rows.results || []).map(p => `
    <a class="list-card" href="${langPath(ctx, '/person/' + p.id)}">
      <span class="list-card-title">${esc(p.name_ar)}${p.name_orig ? ` <span class="latin">${esc(p.name_orig)}</span>` : ''}</span>
      <span class="list-card-meta">${p.birth_year || p.death_year ? `${p.birth_year || '?'}–${p.death_year || '?'} · ` : ''}${p.n} ${esc(t(lang, 'materials_count'))}</span>
    </a>`).join('');
  const content = `
  <div class="wrap page-head"><h1 class="page-title">${esc(t(lang, 'nav_people'))}</h1></div>
  <div class="wrap section">
    ${items ? `<div class="list-grid">${items}</div>` : `<p class="empty">${esc(t(lang, 'no_results'))}</p>`}
    ${paginationHTML(ctx, page, PER_PAGE, total, '/people?' + url.searchParams.toString())}
  </div>`;
  return layout(ctx, { title: t(lang, 'nav_people'), active: '/people', content });
}

async function personPage(ctx, id) {
  const { lang, env, url } = ctx;
  const db = env.DB;
  const p = await db.prepare(`SELECT * FROM people WHERE id = ?`).bind(id).first();
  if (!p) return notFoundPage(ctx);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const res = await searchMaterials(db, { personId: id, page, perPage: PER_PAGE, publishedOnly: true });
  const items = await enrichMaterials(env, res.items || []);
  const years = (p.birth_year || p.death_year) ? `${p.birth_year || '?'} – ${p.death_year || '?'}` : '';
  const content = `
  <div class="wrap page-head">
    <nav class="breadcrumb"><a href="${langPath(ctx, '/people')}">${esc(t(lang, 'nav_people'))}</a> / ${esc(p.name_ar)}</nav>
    <h1 class="page-title">${esc(p.name_ar)}${p.name_orig ? ` <span class="latin">(${esc(p.name_orig)})</span>` : ''}</h1>
    <dl class="meta-grid">
      ${years ? `<div class="meta-row"><dt>${esc(t(lang, 'years_label'))}</dt><dd dir="ltr">${esc(years)}</dd></div>` : ''}
      <div class="meta-row"><dt>${esc(t(lang, 'nav_people'))}</dt><dd>${confidenceBadge(lang, p.identity_confidence)}</dd></div>
    </dl>
    ${p.bio ? `<div class="doc-desc" dir="auto">${esc(p.bio)}</div>` : ''}
  </div>
  <div class="wrap section">
    <h2 class="section-title">${esc(t(lang, 'materials_of_person'))} (${res.total || 0})</h2>
    ${cardsGrid(ctx, items)}
    ${paginationHTML(ctx, page, PER_PAGE, res.total || 0, '/person/' + id + '?' + url.searchParams.toString())}
  </div>`;
  return layout(ctx, {
    title: p.name_ar,
    description: `${p.name_ar} — ${t(lang, 'nav_people')} — ${t(lang, 'site_name')}`,
    active: '/people',
    content,
  });
}

/* ---------- المصادر ---------- */

async function sourcesPage(ctx) {
  const { lang, env } = ctx;
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM materials m WHERE m.source_id = s.id AND m.publish_status='published') AS n
     FROM sources s ORDER BY s.name`
  ).all();
  const items = (rows.results || []).map(s => `
    <a class="list-card" href="${langPath(ctx, '/archive?source=' + s.id)}">
      <span class="list-card-title">${esc(s.name_ar || s.name)}${s.name_ar && s.name ? ` <span class="latin">${esc(s.name)}</span>` : ''}</span>
      <span class="list-card-meta">${s.kind ? esc(s.kind) + ' · ' : ''}${s.n} ${esc(t(lang, 'materials_count'))}</span>
    </a>`).join('');
  const content = `
  <div class="wrap page-head"><h1 class="page-title">${esc(t(lang, 'nav_sources'))}</h1></div>
  <div class="wrap section">
    ${items ? `<div class="list-grid">${items}</div>` : `<p class="empty">${esc(t(lang, 'no_results'))}</p>`}
  </div>`;
  return layout(ctx, { title: t(lang, 'nav_sources'), active: '/sources', content });
}

/* ---------- المجموعات ---------- */

async function collectionsPage(ctx) {
  const { lang, env } = ctx;
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM material_collections mc JOIN materials m ON m.id = mc.material_id
       WHERE mc.collection_id = c.id AND m.publish_status='published') AS n
     FROM collections c WHERE c.kind = 'collection' ORDER BY c.sort_order ASC, c.id ASC`
  ).all();
  const cards = (rows.results || []).map(c => `
    <a class="collection-card" href="${langPath(ctx, '/collection/' + c.id)}">
      <span class="collection-card-title">${esc(lang === 'fr' && c.title_fr ? c.title_fr : c.title_ar)}</span>
      ${colDesc(lang, c) ? `<span class="collection-card-desc">${esc(truncate(colDesc(lang, c), 160))}</span>` : ''}
      <span class="collection-card-count">${c.n} ${esc(t(lang, 'materials_count'))}</span>
      <span class="collection-card-go">${esc(t(lang, 'explore_collection'))} →</span>
    </a>`).join('');
  const content = `
  <div class="wrap page-head"><h1 class="page-title">${esc(t(lang, 'nav_collections'))}</h1></div>
  <div class="wrap section">
    ${cards ? `<div class="collections-grid">${cards}</div>` : `<p class="empty">${esc(t(lang, 'no_results'))}</p>`}
  </div>`;
  return layout(ctx, { title: t(lang, 'nav_collections'), active: '/collections', content });
}

async function collectionPage(ctx, id) {
  const { lang, env, url } = ctx;
  const db = env.DB;
  const c = await db.prepare(`SELECT * FROM collections WHERE id = ?`).bind(id).first();
  if (!c) return notFoundPage(ctx);
  if (c.kind === 'section') {
    // الأقسام لها مسارها الخاص — تحويل دائم
    return { html: '', status: 302, redirect: langPath(ctx, '/section/' + c.id) };
  }
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const res = await searchMaterials(db, { collectionId: id, page, perPage: PER_PAGE, publishedOnly: true });
  const items = await enrichMaterials(env, res.items || []);
  const title = lang === 'fr' && c.title_fr ? c.title_fr : c.title_ar;
  const content = `
  <div class="wrap page-head">
    <nav class="breadcrumb"><a href="${langPath(ctx, '/collections')}">${esc(t(lang, 'nav_collections'))}</a> / ${esc(title)}</nav>
    <h1 class="page-title">${esc(title)}</h1>
    ${colDesc(lang, c) ? `<p class="page-desc" dir="auto">${esc(colDesc(lang, c))}</p>` : ''}
  </div>
  <div class="wrap section">
    ${cardsGrid(ctx, items)}
    ${paginationHTML(ctx, page, PER_PAGE, res.total || 0, '/collection/' + id + '?' + url.searchParams.toString())}
  </div>`;
  return layout(ctx, { title, description: truncate(colDesc(lang, c) || title, 160), active: '/collections', content });
}

/* ---------- أقسام سِجِل ---------- */

async function sectionsPage(ctx) {
  const { lang, env } = ctx;
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM material_collections mc JOIN materials m ON m.id = mc.material_id
       WHERE mc.collection_id = c.id AND m.publish_status='published') AS n
     FROM collections c WHERE c.kind = 'section' ORDER BY c.sort_order ASC, c.id ASC`
  ).all();
  const cards = (rows.results || []).map(s => {
    const title = lang === 'fr' && s.title_fr ? s.title_fr : s.title_ar;
    return `
    <div class="section-card">
      <h2><a href="${langPath(ctx, '/section/' + s.id)}">${esc(title)}</a></h2>
      ${colDesc(lang, s) ? `<p dir="auto">${esc(truncate(colDesc(lang, s), 180))}</p>` : ''}
      <div class="sec-foot">
        <span class="section-count">${s.n} ${esc(t(lang, 'section_count_materials'))}</span>
        <a class="more-link" href="${langPath(ctx, '/section/' + s.id)}">${esc(t(lang, 'sections_explore'))} →</a>
      </div>
    </div>`;
  }).join('');
  const content = `
  <div class="wrap page-head">
    <h1 class="page-title">${esc(t(lang, 'sections_title'))}</h1>
    <p class="page-desc">${esc(t(lang, 'sections_intro'))}</p>
  </div>
  <div class="wrap section">
    ${cards ? `<div class="collections-grid">${cards}</div>` : `<p class="empty">${esc(t(lang, 'no_results'))}</p>`}
  </div>`;
  return layout(ctx, { title: t(lang, 'sections_title'), description: t(lang, 'sections_intro'), active: '/sections', content });
}

async function sectionPage(ctx, id) {
  const { lang, env, url } = ctx;
  const db = env.DB;
  const s = await db.prepare(`SELECT * FROM collections WHERE id = ? AND kind = 'section'`).bind(id).first();
  if (!s) return notFoundPage(ctx);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const res = await searchMaterials(db, { collectionId: id, page, perPage: PER_PAGE, publishedOnly: true });
  const items = await enrichMaterials(env, res.items || []);
  // المجموعات الموضوعية التي تشارك مواد هذا القسم
  const subRes = await db.prepare(
    `SELECT DISTINCT c.id, c.title_ar, c.title_fr
     FROM collections c
     JOIN material_collections mc ON mc.collection_id = c.id
     JOIN materials m ON m.id = mc.material_id AND m.publish_status = 'published'
     WHERE c.kind = 'collection'
       AND mc.material_id IN (SELECT material_id FROM material_collections WHERE collection_id = ?)
     ORDER BY c.sort_order ASC, c.id ASC`
  ).bind(id).all();
  const subs = subRes.results || [];
  const subHTML = subs.length ? `
    <h2 class="section-title" style="margin-top:34px">${esc(t(lang, 'section_collections'))}</h2>
    <div class="region-grid">${subs.map(c => `
      <a class="region-chip" href="${langPath(ctx, '/collection/' + c.id)}">
        <span class="region-name">${esc(lang === 'fr' && c.title_fr ? c.title_fr : c.title_ar)}</span>
      </a>`).join('')}</div>` : '';
  const title = lang === 'fr' && s.title_fr ? s.title_fr : s.title_ar;
  const content = `
  <div class="wrap page-head">
    <nav class="breadcrumb"><a href="${langPath(ctx, '/')}">${esc(t(lang, 'nav_home'))}</a> / <a href="${langPath(ctx, '/sections')}">${esc(t(lang, 'nav_sections'))}</a> / ${esc(title)}</nav>
    <h1 class="page-title">${esc(title)}</h1>
    ${colDesc(lang, s) ? `<p class="page-desc" dir="auto">${esc(colDesc(lang, s))}</p>` : ''}
  </div>
  <div class="wrap section">
    <h2 class="section-title">${esc(t(lang, 'section_materials'))}</h2>
    ${cardsGrid(ctx, items)}
    ${paginationHTML(ctx, page, PER_PAGE, res.total || 0, '/section/' + id + '?' + url.searchParams.toString())}
    ${subHTML}
  </div>`;
  return layout(ctx, { title, description: truncate(colDesc(lang, s) || title, 160), active: '/sections', content });
}

/* ---------- مجلة سِجِل ---------- */

async function journalListPage(ctx) {
  const { lang, env } = ctx;
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT * FROM materials WHERE type = 'journal' AND publish_status = 'published'
     ORDER BY year DESC, created_at DESC`
  ).all();
  const issues = await enrichMaterials(env, rows.results || []);
  const cards = issues.map(m => {
    const title = displayTitle(lang, m);
    const cover = m.thumbUrl
      ? `<div class="journal-issue-cover"><img src="${esc(m.thumbUrl)}" alt="" loading="lazy"></div>`
      : `<div class="journal-issue-cover placeholder" aria-hidden="true">📓</div>`;
    return `
    <a class="journal-issue-card" href="${langPath(ctx, '/journal/' + encodeURIComponent(m.ark))}">
      ${cover}
      <div class="journal-issue-body">
        <h3>${esc(title)}</h3>
        ${m.year ? `<div class="al-meta">${esc(t(lang, 'year_label'))}: ${esc(String(m.year))}</div>` : ''}
        ${m.description ? `<p dir="auto">${esc(truncate(m.description, 180))}</p>` : ''}
        <span class="more-link">${esc(t(lang, 'journal_view_issue'))} →</span>
      </div>
    </a>`;
  }).join('');
  const content = `
  <div class="wrap page-head journal-hero">
    <h1 class="page-title">${esc(t(lang, 'journal_title'))}</h1>
    <p class="page-desc">${esc(t(lang, 'journal_intro'))}</p>
  </div>
  <div class="wrap section">
    <h2 class="section-title">${esc(t(lang, 'journal_issues'))}</h2>
    ${cards ? `<div class="journal-list">${cards}</div>` : `<p class="empty">${esc(t(lang, 'journal_empty'))}</p>`}
  </div>`;
  return layout(ctx, { title: t(lang, 'journal_title'), description: t(lang, 'journal_intro'), active: '/journal', content });
}

async function journalIssuePage(ctx, ark) {
  const { lang, env } = ctx;
  const db = env.DB;
  const m = await getMaterialFull(db, ark, { includeUnpublished: false });
  if (!m || m.publish_status !== 'published' || m.type !== 'journal') return notFoundPage(ctx);
  const title = displayTitle(lang, m);
  const origin = new URL(ctx.url).origin;
  const canonical = `${origin}/journal/${encodeURIComponent(m.ark)}?lang=${lang}`;

  const files = (m.files || []).filter(f => f.kind !== 'thumbnail' && f.kind !== 'cover');
  const pdfFiles = files.filter((f) => (f.mime || '') === 'application/pdf' || /\.pdf$/i.test(f.filename || ''));
  const filesHTML = files.length ? `<ul class="file-list">` + files.map(f => {
    const size = f.size ? ` · ${formatSize(f.size)}` : '';
    return `<li class="file-item">
      <span class="file-name">${esc(f.filename)}${size}</span>
      <span class="file-actions">
        <a class="btn btn-small" href="/file/${f.id}" target="_blank" rel="noopener">${esc(t(lang, 'view'))}</a>
        <a class="btn btn-small btn-ghost" href="/file/${f.id}?download=1">${esc(t(lang, 'download'))}</a>
      </span></li>`;
  }).join('') + `</ul>` : '';

  // مقالات العدد المرتبطة به
  const artRes = await db.prepare(
    `SELECT m2.* FROM material_relations mr
     JOIN materials m2 ON m2.id = CASE WHEN mr.material_a = ? THEN mr.material_b ELSE mr.material_a END
     WHERE (mr.material_a = ? OR mr.material_b = ?) AND m2.type = 'article' AND m2.publish_status = 'published'
     ORDER BY m2.created_at DESC`
  ).bind(m.id, m.id, m.id).all();
  const articles = await enrichMaterials(env, artRes.results || []);
  const articlesHTML = articles.length ? `
    <section class="doc-section">
      <h2 class="doc-section-title">${esc(t(lang, 'journal_articles'))}</h2>
      ${articles.map(a => `
        <a class="article-link-card" href="${langPath(ctx, '/document/' + encodeURIComponent(a.ark))}">
          <div class="al-title">${esc(displayTitle(lang, a))}</div>
          ${a.year ? `<div class="al-meta">${esc(String(a.year))}</div>` : ''}
        </a>`).join('')}
    </section>` : '';

  const imageFiles = files.filter((f) => /^image\//.test(f.mime || '') || /\.(jpe?g|png|webp|tiff?)$/i.test(f.filename || ''));
  const ogImage = imageFiles[0] ? `/file/${imageFiles[0].id}` : '/logo.png';

  const content = `
  <div class="wrap">
    <nav class="breadcrumb" aria-label="breadcrumb">
      <a href="${langPath(ctx, '/')}">${esc(t(lang, 'nav_home'))}</a> /
      <a href="${langPath(ctx, '/journal')}">${esc(t(lang, 'journal_title'))}</a> /
      <span class="ark" dir="ltr">${esc(m.ark)}</span>
    </nav>
    <a class="journal-back" href="${langPath(ctx, '/journal')}">→ ${esc(t(lang, 'journal_all_issues'))}</a>
    <article class="doc">
      <header class="doc-head">
        <div class="doc-badges">
          <span class="badge badge-type">${esc(typeLabel(lang, 'journal'))}</span>
          <span class="badge badge-ark" dir="ltr">${esc(m.ark)}</span>
        </div>
        <h1 class="doc-title">${esc(title)}</h1>
        ${m.year ? `<p class="doc-title-orig">${esc(t(lang, 'year_label'))}: ${esc(String(m.year))}</p>` : ''}
      </header>

      ${shareHTML(ctx, m)}

      ${pdfViewerBlock(ctx, pdfFiles, m.id, title, m.file_translations)}

      ${m.description ? `<section class="doc-section"><h2 class="doc-section-title">${esc(t(lang, 'description_label'))}</h2><div class="doc-desc" dir="auto">${esc(m.description)}</div></section>` : ''}

      ${articlesHTML}

      ${filesHTML ? `<section class="doc-section"><h2 class="doc-section-title">${esc(t(lang, 'files_label'))}</h2>${filesHTML}</section>` : ''}
    </article>
  </div>`;

  return layout(ctx, {
    title,
    description: truncate(m.description || title, 160),
    ogImage,
    canonical,
    active: '/journal',
    content,
  });
}

/* ---------- حول سِجِل / المنهجية ---------- */

const ABOUT = {
  ar: {
    intro: '«سِجِل» منصة رقمية مستقلة متخصصة في جمع وحفظ وفهرسة وإتاحة المصادر المتعلقة بتاريخ تشاد: الوثائق الأرشيفية، الكتب والدراسات، المخطوطات، الصور التاريخية، الخرائط، المراسلات، الصحف، والنصوص والمقتطفات العلمية.',
    p2: 'لا يقوم المشروع على مجرد رفع الملفات، بل على بناء أرشيف بحثي رقمي موثّق: يحافظ على الأصل، ويفصل بوضوح بين الوثيقة التاريخية الأصلية وبين ما أُنتج عنها لاحقًا من تفريغ أو ترجمة أو ترميم أو تحسين أو تلوين.',
    goals_title: 'أهداف المشروع',
    goals: [
      'جمع الوثائق التاريخية المتعلقة بتشاد من المصادر المحلية والدولية.',
      'حفظ النسخ الأصلية للوثائق والصور دون تعديل.',
      'توثيق مصدر كل مادة ومرجعها الأرشيفي.',
      'إتاحة البحث في الوثائق بالعربية والفرنسية.',
      'توفير تفريغ نصي للوثائق المهمة.',
      'ترجمة النصوص الفرنسية إلى العربية ترجمة بحثية دقيقة.',
      'حفظ الصور الأصلية إلى جانب النسخ المرممة أو المحسنة.',
      'تمييز المواد الأصلية عن المواد المعالجة آليًا.',
      'ربط الأشخاص والأماكن والأحداث والمصادر ببعضها.',
      'إنشاء قاعدة معرفية متنامية حول تاريخ تشاد.',
    ],
    principles_title: 'مبادئنا العلمية',
    principles: [
      ['الأصل لا يُمس', 'تبقى الوثيقة الأصلية محفوظة دائمًا كما وردت من المصدر.'],
      ['المشتق يُعرَّف بوضوح', 'أي ترميم أو ترجمة أو تلوين أو تفريغ يُشار إليه صراحة.'],
      ['المصدر مقدَّم على الادعاء', 'كل معلومة تاريخية تقود إلى مصدرها كلما أمكن.'],
      ['عدم الجزم فيما هو محتمل', 'نفرّق بين المؤكد والمرجّح والتقديري والمجهول.'],
    ],
  },
  fr: {
    intro: '« SIDJIL » est une plateforme numérique indépendante dédiée à la collecte, à la conservation, à l’indexation et à la diffusion des sources relatives à l’histoire du Tchad : documents d’archives, livres et études, manuscrits, photographies historiques, cartes, correspondances, presse et textes scientifiques.',
    p2: 'Le projet ne se limite pas à la mise en ligne de fichiers : il s’agit de construire une archive numérique de recherche documentée, qui préserve l’original et distingue clairement le document historique original de tout ce qui en a été dérivé — transcription, traduction, restauration, amélioration ou colorisation.',
    goals_title: 'Objectifs du projet',
    goals: [
      'Rassembler les documents historiques relatifs au Tchad, de sources locales et internationales.',
      'Conserver les copies originales des documents et photographies sans modification.',
      'Documenter la source et la cote archivistique de chaque document.',
      'Offrir la recherche dans les documents en arabe et en français.',
      'Fournir la transcription textuelle des documents importants.',
      'Traduire les textes français en arabe avec une traduction de recherche précise.',
      'Conserver les photographies originales aux côtés des versions restaurées ou améliorées.',
      'Distinguer les documents originaux des documents traités automatiquement.',
      'Relier entre elles les personnes, les lieux, les événements et les sources.',
      'Construire une base de connaissances croissante sur l’histoire du Tchad.',
    ],
    principles_title: 'Nos principes scientifiques',
    principles: [
      ['L’original est intouchable', 'Le document original est toujours conservé tel qu’il a été reçu de la source.'],
      ['Le dérivé est clairement identifié', 'Toute restauration, traduction, colorisation ou transcription est explicitement signalée.'],
      ['La source prime sur l’affirmation', 'Chaque information historique mène à sa source chaque fois que possible.'],
      ['Ne pas affirmer ce qui est incertain', 'Nous distinguons le confirmé, le probable, l’estimatif et l’inconnu.'],
    ],
  }
};

function aboutPage(ctx) {
  const { lang } = ctx;
  const a = ABOUT[lang] || ABOUT.ar;
  const content = `
  <div class="wrap page-head">
    <h1 class="page-title">${esc(t(lang, 'nav_about'))}</h1>
    <p class="page-desc tagline-big">${esc(t(lang, 'tagline'))}</p>
  </div>
  <div class="wrap section prose">
    <p class="lead" dir="auto">${esc(a.intro)}</p>
    <p dir="auto">${esc(a.p2)}</p>
    <blockquote class="method-quote" dir="auto">${esc(t(lang, 'methodology_quote'))}</blockquote>
    <h2>${esc(a.goals_title)}</h2>
    <ol class="goals-list">${a.goals.map(g => `<li dir="auto">${esc(g)}</li>`).join('')}</ol>
    <h2>${esc(a.principles_title)}</h2>
    <div class="principles">${a.principles.map(([k, v]) => `
      <div class="principle"><h3 dir="auto">${esc(k)}</h3><p dir="auto">${esc(v)}</p></div>`).join('')}
    </div>
  </div>`;
  return layout(ctx, {
    title: t(lang, 'nav_about'),
    description: a.intro,
    active: '/about',
    content,
  });
}

const METHOD = {
  ar: {
    title: 'منهجية التوثيق والترميم والترجمة',
    intro: 'يلتزم «سِجِل» بمنهجية علمية صارمة في التعامل مع كل مادة: من لحظة الرفع إلى العرض والاستشهاد.',
    sections: [
      ['توثيق المصدر', 'لكل مادة حقل المصدر إلزامي قدر الإمكان: المؤسسة، اسم المجموعة، رقم الحفظ، رقم الملف، رقم الصفحة أو الصورة، الرابط الأصلي، تاريخ الاطلاع، وعند الاقتباس: اسم الكتاب أو الدراسة والمؤلف وسنة النشر.'],
      ['حماية الأصل', 'عند رفع مادة أصلية: لا يُسمح باستبدالها بالنسخة المعدلة، تُحفظ باسم مستقل، ويُسجَّل تاريخ رفعها ومصدرها وبصمتها الرقمية (SHA-256)، وتبقى النسخ المعدلة مرتبطة بها بوصفها مشتقات.'],
      ['طبقات النص', 'تمر الوثيقة الممسوحة بأربع مراحل منفصلة: الصورة الأصلية، ثم النص المستخرج آليًا، ثم النص المصحح يدويًا، ثم الترجمة العربية. تُحفظ كل طبقة بصورة مستقلة: لا يستبدل النص المصحح النصَّ المستخرج، ولا تستبدل الترجمة النصَّ الأصلي.'],
      ['حالات الترجمة', 'للترجمة خمس حالات ظاهرة للزائر: غير مترجمة، ترجمة آلية، ترجمة قيد المراجعة، ترجمة مراجعة بشريًا، ترجمة معتمدة. ولا تُنشر الترجمة الآلية على أنها ترجمة نهائية.'],
      ['نسخ الصور', 'كل صورة تاريخية مادة أرشيفية مستقلة. نخزن: الأصل كما ورد من المصدر، والترميم (إزالة التلف والخدوش وتحسين الوضوح)، والتحسين (الدقة والوضوح)، والتلوين التقديري، والنسخة المشروحة. ولا تحل أي نسخة محل الأصل.'],
      ['مستوى الثقة', 'لا نقدّم الافتراضات التاريخية باعتبارها حقائق. لكل من التاريخ والمكان وهوية الشخص مستوى ثقة: مؤكد، تقريبي/مرجّح، أو غير معروف.'],
    ],
  },
  fr: {
    title: 'Méthodologie de documentation, de restauration et de traduction',
    intro: '« SIDJIL » suit une méthodologie scientifique rigoureuse pour chaque document, du versement à l’affichage et à la citation.',
    sections: [
      ['Documentation de la source', 'Le champ « source » est obligatoire autant que possible : institution, nom du fonds, cote, numéro de dossier, page ou image, lien original, date de consultation et, pour les citations, titre, auteur et année de publication.'],
      ['Protection de l’original', 'Lors du versement d’un document original : il ne peut être remplacé par une version modifiée, il est conservé sous un nom distinct, avec sa date de versement, sa source et son empreinte numérique (SHA-256) ; les versions modifiées y restent rattachées comme dérivés.'],
      ['Couches de texte', 'Le document numérisé passe par quatre étapes distinctes : l’image originale, le texte extrait automatiquement, le texte corrigé manuellement, puis la traduction arabe. Chaque couche est conservée séparément : le texte corrigé ne remplace pas le texte extrait, et la traduction ne remplace pas le texte original.'],
      ['États de la traduction', 'La traduction comporte cinq états visibles : non traduite, automatique, en cours de révision, révisée par un humain, validée. La traduction automatique n’est jamais présentée comme définitive.'],
      ['Versions des images', 'Chaque photographie historique est un document d’archive indépendant. Nous conservons : l’original tel que reçu, la restauration (suppression des détériorations, netteté), l’amélioration (résolution), la colorisation interprétative et la version annotée. Aucune version ne remplace l’original.'],
      ['Niveau de confiance', 'Nous ne présentons pas les hypothèses historiques comme des faits. La date, le lieu et l’identité des personnes portent un niveau de confiance : confirmé, approximatif/probable ou inconnu.'],
    ],
  }
};

function methodologyPage(ctx) {
  const { lang } = ctx;
  const m = METHOD[lang] || METHOD.ar;
  const content = `
  <div class="wrap page-head">
    <h1 class="page-title">${esc(t(lang, 'nav_methodology'))}</h1>
    <p class="page-desc" dir="auto">${esc(m.intro)}</p>
  </div>
  <div class="wrap section prose">
    <blockquote class="method-quote" dir="auto">${esc(t(lang, 'methodology_quote'))}</blockquote>
    ${m.sections.map(([h, p]) => `<h2 dir="auto">${esc(h)}</h2><p dir="auto">${esc(p)}</p>`).join('')}
  </div>`;
  return layout(ctx, {
    title: t(lang, 'nav_methodology'),
    description: m.intro,
    active: '/methodology',
    content,
  });
}

/* ---------- 404 ---------- */

function notFoundPage(ctx) {
  const { lang } = ctx;
  const content = `
  <div class="wrap section not-found">
    <div class="not-found-code" dir="ltr">404</div>
    <h1 class="page-title">${esc(t(lang, 'page_not_found'))}</h1>
    <p class="page-desc">${esc(t(lang, 'page_not_found_desc'))}</p>
    <a class="btn btn-primary" href="${langPath(ctx, '/')}">${esc(t(lang, 'back_home'))}</a>
  </div>`;
  const html = layout(ctx, { title: t(lang, 'page_not_found'), content });
  return { html, status: 404 };
}

// صفحة الأوفلاين لتطبيق الويب التقدمي
function offlinePage(ctx) {
  const { lang } = ctx;
  const msg = lang === 'fr'
    ? 'Vous êtes hors ligne. Les pages déjà visitées restent disponibles, mais les débats nécessitent une connexion.'
    : 'أنت دون اتصال. الصفحات التي زرتها من قبل متاحة، لكن النقاشات تحتاج إلى اتصال بالإنترنت.';
  const content = `
  <div class="wrap section not-found">
    <div class="not-found-code">📡</div>
    <h1 class="page-title">${lang === 'fr' ? 'Hors ligne' : 'دون اتصال'}</h1>
    <p class="page-desc">${esc(msg)}</p>
    <button class="btn btn-primary" type="button" onclick="location.reload()">${lang === 'fr' ? 'Réessayer' : 'إعادة المحاولة'}</button>
  </div>`;
  return layout(ctx, { title: lang === 'fr' ? 'Hors ligne' : 'دون اتصال', content });
}

/* ---------- الموجّه ---------- */

export async function renderPublic(pathname, req, env, options = {}) {
  const url = new URL(req.url);

  // اللغة: ?lang= ثم كوكي archifouna_lang ثم الافتراضي ar
  let lang = url.searchParams.get('lang');
  let setCookie = null;
  if (lang && SUPPORTED_LANGS.includes(lang)) {
    setCookie = `archifouna_lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`;
  } else {
    const cookie = req.headers.get('cookie') || '';
    const mm = cookie.match(/(?:^|;\s*)archifouna_lang=(ar|fr)/);
    lang = mm ? mm[1] : 'ar';
  }
  const ctx = { lang, url, env, req, dir: htmlDir(lang), csrfToken: options.csrfToken || '' };

  if (options.standaloneResearcherLogin) {
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' };
    if (setCookie) headers['Set-Cookie'] = setCookie;
    return new Response(researcherLoginPage(ctx), { status: 200, headers });
  }

  let result;
  try {
    if (pathname === '/') result = await homePage(ctx);
    else if (pathname === '/archive') result = await archivePage(ctx);
    else if (pathname === '/search') result = await searchPage(ctx);
    else if (pathname === '/advanced-search') result = await advancedSearchPage(ctx);
    else if (pathname === '/categories') result = await categoriesPage(ctx);
    else if (pathname === '/places') result = await placesPage(ctx);
    else if (pathname === '/people') result = await peoplePage(ctx);
    else if (pathname === '/sources') result = await sourcesPage(ctx);
    else if (pathname === '/collections') result = await collectionsPage(ctx);
    else if (pathname === '/sections') result = await sectionsPage(ctx);
    else if (pathname === '/journal') result = await journalListPage(ctx);
    else if (pathname === '/discussions') result = await discussionsPage(ctx);
    else if (pathname === '/researcher/register') result = registerPage(ctx);
    else if (pathname === '/offline') result = offlinePage(ctx);
    else if (pathname === '/about') result = aboutPage(ctx);
    else if (pathname === '/methodology') result = methodologyPage(ctx);
    else {
      let m;
      if ((m = pathname.match(/^\/document\/([^/]+)$/))) result = await documentPage(ctx, decodeURIComponent(m[1]));
      else if ((m = pathname.match(/^\/place\/(\d+)$/))) result = await placePage(ctx, m[1]);
      else if ((m = pathname.match(/^\/person\/(\d+)$/))) result = await personPage(ctx, m[1]);
      else if ((m = pathname.match(/^\/collection\/(\d+)$/))) result = await collectionPage(ctx, m[1]);
      else if ((m = pathname.match(/^\/section\/(\d+)$/))) result = await sectionPage(ctx, m[1]);
      else if ((m = pathname.match(/^\/journal\/([^/]+)$/))) result = await journalIssuePage(ctx, decodeURIComponent(m[1]));
      else if ((m = pathname.match(/^\/discussion\/(\d+)$/))) result = await discussionPage(ctx, m[1]);
      else result = notFoundPage(ctx);
    }
  } catch (err) {
    console.error('renderPublic error:', err);
    // A render/database failure is a server error, not a missing route.
    // Returning the 404 page here hid homepage failures as "page not found".
    result = {
      html: layout(ctx, {
        title: lang === 'fr' ? 'Erreur du serveur' : 'خطأ في الخادم',
        content: `<div class="wrap section not-found"><h1 class="page-title">${lang === 'fr' ? 'Une erreur est survenue' : 'حدث خطأ أثناء تحميل الصفحة'}</h1><p class="page-desc">${lang === 'fr' ? 'Veuillez réessayer dans quelques instants.' : 'يرجى إعادة المحاولة بعد قليل.'}</p><a class="btn btn-primary" href="${langPath(ctx, '/')}">${esc(t(lang, 'back_home'))}</a></div>`,
      }),
      status: 500,
    };
  }

  const html = typeof result === 'string' ? result : result.html;
  const status = typeof result === 'string' ? 200 : (result.status || 200);
  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  if (setCookie) headers['Set-Cookie'] = setCookie;
  if (result && typeof result === 'object' && result.redirect) headers['Location'] = result.redirect;
  return new Response(html, { status, headers });
}
