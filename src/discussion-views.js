// ============================================================
// SIDJIL — مجلس سِجِل: صفحات النقاش العامة
// /discussions — /discussion/:id — /researcher/register
// ============================================================

import { esc, langPath, paginationHTML, truncate, layout, shareHTML, enrichMaterials } from './views.js';
import { t } from './i18n.js';
import { getSessionUser } from './lib/auth.js';
import {
  fetchDiscussions,
  getDiscussionFull,
  viewerReactions,
  discussionsForMaterial,
  DISCUSSION_KINDS,
  REACTION_KINDS,
} from './discussions.js';

// ---------- أدوات عرض ----------

function fmtDT(s) {
  if (!s) return '';
  try {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return d.toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(s).slice(0, 10);
  }
}

const KIND_CLASS = {
  comment: 'k-comment', review: 'k-review', critique: 'k-critique', idea: 'k-idea', text: 'k-text',
};

export function kindBadge(lang, kind) {
  return `<span class="badge kind-badge ${KIND_CLASS[kind] || ''}">${esc(t(lang, 'kind_' + kind))}</span>`;
}

export function verifiedBadge(lang) {
  return `<span class="verified-badge" title="${esc(t(lang, 'verified_badge'))}">✓ ${esc(t(lang, 'verified_badge'))}</span>`;
}

const REACT_ICON = { like: '👍', support: '✊', useful: '💡', oppose: '👎' };

// أزرار التفاعل (للزوار بلا حساب — تُدار عبر /js/discussions.js)
export function reactionButtons(lang, discussionId, replyId, counts, mine) {
  const btns = REACTION_KINDS.map((k) => {
    const c = (counts && counts[k]) || 0;
    const active = mine === k ? ' active' : '';
    return `<button type="button" class="react-btn${active}" data-react
      data-discussion="${discussionId}" data-reply="${replyId || ''}" data-kind="${k}"
      title="${esc(t(lang, 'react_' + k))}" aria-label="${esc(t(lang, 'react_' + k))}">
      <span class="react-ic">${REACT_ICON[k]}</span>
      <span class="react-label">${esc(t(lang, 'react_' + k))}</span>
      <span class="react-count" data-count>${c}</span>
    </button>`;
  }).join('');
  return `<div class="react-row" role="group" aria-label="${esc(t(lang, 'discussion_share'))}">${btns}</div>`;
}

function authorLine(lang, name, verified) {
  return `<span class="d-author">${esc(name || 'باحث')}</span>${verified ? ' ' + verifiedBadge(lang) : ''}`;
}

function discussionCard(ctx, d) {
  const { lang } = ctx;
  const url = langPath(ctx, `/discussion/${d.id}`);
  const matUrl = d.material_id ? langPath(ctx, `/document/${encodeURIComponent(d.material_ark)}`) : null;
  return `<article class="d-card">
    <div class="d-card-top">${kindBadge(lang, d.kind)}
      <span class="d-meta">${authorLine(lang, d.author_name, Number(d.author_verified) === 1)} · ${fmtDT(d.created_at)}</span>
    </div>
    <h3 class="d-card-title"><a href="${url}">${esc(d.title)}</a></h3>
    <p class="d-card-excerpt">${esc(truncate(d.body, 160))}</p>
    ${matUrl ? `<p class="d-card-mat">${esc(t(lang, 'discussion_about_material'))} <a href="${matUrl}">${esc(d.material_title || d.material_ark)}</a></p>` : ''}
    <div class="d-card-foot">
      <span class="d-count">💬 ${d.replies_count || 0}</span>
      <span class="d-count">👍 ${d.reactions_count || 0}</span>
      <a class="d-more" href="${url}">←</a>
    </div>
  </article>`;
}

function authErrorText(lang, code) {
  return code && t(lang, 'discussion_auth_error_' + code) !== 'discussion_auth_error_' + code
    ? t(lang, 'discussion_auth_error_' + code) : '';
}

function discussionAuthGate(ctx) {
  const { lang } = ctx;
  const url = new URL(ctx.url);
  const error = authErrorText(lang, url.searchParams.get('auth_error'));
  const requestedNext = String(url.searchParams.get('next') || '').trim();
  url.searchParams.delete('auth_error');
  url.searchParams.delete('next');
  const currentNext = `${url.pathname}${url.search}`;
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : currentNext;
  return `<div class="wrap social-auth-page">
    <div class="social-auth-card">
      <div class="social-auth-mark" aria-hidden="true">سِ</div>
      <span class="eyebrow">${esc(t(lang, 'site_name'))}</span>
      <h1>${esc(t(lang, 'discussion_login_title'))}</h1>
      <p class="social-auth-intro">${esc(t(lang, 'discussion_login_intro'))}</p>
      ${error ? `<div class="notice notice-error" role="alert">${esc(error)}</div>` : ''}
      <form id="discussionLoginForm" class="social-auth-form" data-next="${esc(next)}" novalidate>
        <label class="sr-only" for="discussionLoginUsername">${esc(t(lang, 'register_username'))}</label>
        <input id="discussionLoginUsername" name="username" required autocomplete="username" placeholder="${esc(t(lang, 'register_username'))}">
        <label class="sr-only" for="discussionLoginPassword">${esc(t(lang, 'register_password'))}</label>
        <input id="discussionLoginPassword" name="password" required type="password" autocomplete="current-password" placeholder="${esc(t(lang, 'register_password'))}">
        <p class="form-msg" id="discussionLoginMsg" role="status"></p>
        <button class="btn btn-primary btn-block" type="submit">${esc(t(lang, 'discussion_login_button'))}</button>
      </form>
      <div class="social-auth-divider"><span>أو</span></div>
      <a class="btn btn-google btn-block" href="/auth/google/start?next=${encodeURIComponent(next)}">${esc(t(lang, 'discussion_google_button'))}</a>
      <p class="social-auth-note">${esc(t(lang, 'discussion_google_note'))}</p>
      <div class="social-auth-register"><span>${esc(t(lang, 'discussion_login_hint'))}</span> <a href="${langPath(ctx, '/researcher/register')}">${esc(t(lang, 'register_researcher'))}</a></div>
    </div>
  </div><script src="/js/discussions.js" defer></script>`;
}

function materialPostCard(ctx, material) {
  const { lang } = ctx;
  const title = material.title_ar || material.title_orig || material.ark;
  const image = material._thumb
    ? `<img class="material-post-image" src="/file/${material._thumb}" alt="" loading="lazy">`
    : `<div class="material-post-image material-post-placeholder">${esc(t(lang, 'type_' + material.type))}</div>`;
  const description = material.summary || material.description || '';
  const materialUrl = langPath(ctx, `/document/${encodeURIComponent(material.ark)}`);
  const reviewUrl = `/researcher/discussions?material_id=${encodeURIComponent(material.id)}`;
  return `<article class="material-post social-card">
    <div class="post-head">
      <div class="post-avatar" aria-hidden="true">س</div>
      <div><strong>أرشيف سِجِل</strong><div class="post-meta">${esc(t(lang, 'type_' + material.type))}${material.year ? ` · ${esc(material.year)}` : ''}</div></div>
      <span class="post-kind">${esc(t(lang, 'discussion_feed_title'))}</span>
    </div>
    <a class="material-post-title" href="${materialUrl}">${esc(title)}</a>
    ${image}
    ${description ? `<p class="material-post-text">${esc(truncate(description, 360))}</p>` : ''}
    <div class="post-actions">
      <a class="post-action" href="${materialUrl}">↗ ${esc(t(lang, 'discussion_open_material'))}</a>
      <a class="post-action" href="${reviewUrl}">💬 ${esc(t(lang, 'discussion_start_review'))}</a>
    </div>
  </article>`;
}

// ---------- صفحة /discussions ----------

export async function discussionsPage(ctx) {
  const { lang, env } = ctx;
  const user = await getSessionUser(ctx.req, env);
  if (!user) {
    const content = `<header class="page-head"><h1>${esc(t(lang, 'discussions_title'))}</h1></header>${discussionAuthGate(ctx)}`;
    return layout(ctx, { title: t(lang, 'discussions_title'), description: t(lang, 'discussion_login_intro'), active: '/discussions', content });
  }
  const url = new URL(ctx.url);
  const kind = url.searchParams.get('kind');
  const page = url.searchParams.get('page') || 1;
  const { items, total, pages, perPage } = await fetchDiscussions(env.DB, { kind, page, perPage: 12 });

  const chips = [''].concat(DISCUSSION_KINDS).map((k) => {
    const active = (k || '') === (kind || '');
    const href = langPath(ctx, '/discussions') + (k ? `?kind=${k}` : '');
    const label = k ? t(lang, 'kind_' + k) : t(lang, 'kind_all');
    return `<a class="chip${active ? ' active' : ''}" href="${href}">${esc(label)}</a>`;
  }).join('');

  const cards = items.length
    ? `<div class="d-grid">${items.map((d) => discussionCard(ctx, d)).join('')}</div>`
    : `<p class="empty">${esc(t(lang, 'discussions_empty'))}</p>`;

  const materialRows = await env.DB.prepare(
    `SELECT id, ark, type, title_ar, title_orig, description, summary, year, updated_at
     FROM materials WHERE publish_status = 'published' ORDER BY updated_at DESC, id DESC LIMIT 24`
  ).all();
  const materials = await enrichMaterials(env, materialRows.results || []);
  const materialFeed = materials.length
    ? materials.map((m) => materialPostCard(ctx, m)).join('')
    : `<p class="empty">${esc(t(lang, 'discussions_empty'))}</p>`;

  const base = langPath(ctx, '/discussions') + (kind ? `?kind=${kind}&` : '?');

  const content = `
  <div class="wrap page-discussions">
    <nav class="breadcrumb"><a href="${langPath(ctx, '/')}">${esc(t(lang, 'nav_home'))}</a> / ${esc(t(lang, 'discussions_title'))}</nav>
    <header class="page-head social-page-head">
      <h1>${esc(t(lang, 'discussions_title'))}</h1>
      <p class="page-desc">${esc(t(lang, 'discussions_intro'))}</p>
    </header>
    <section class="social-feed-intro social-card"><strong>${esc(t(lang, 'discussion_feed_title'))}</strong><span>${esc(t(lang, 'discussion_feed_intro'))}</span></section>
    <div class="material-feed">${materialFeed}</div>
    <section class="social-section-head"><div><h2>${esc(t(lang, 'discussions_title'))}</h2><p>${esc(t(lang, 'discussion_feed_intro'))}</p></div><a class="btn btn-primary" href="${langPath(ctx, '/researcher/discussions')}">${esc(t(lang, 'discussion_start_review'))}</a></section>
    <div class="chip-row" role="navigation" aria-label="${esc(t(lang, 'discussion_kind_ph'))}">${chips}</div>
    ${cards}
    ${paginationHTML(ctx, page, perPage, total, base)}
    <p class="d-cta"><a class="btn btn-primary" href="${langPath(ctx, '/researcher/register')}">${esc(t(lang, 'register_researcher'))}</a></p>
  </div>
  <script src="/js/discussions.js" defer></script>`;

  return layout(ctx, {
    title: t(lang, 'discussions_title'),
    description: t(lang, 'discussions_intro'),
    active: '/discussions',
    content,
  });
}

// ---------- صفحة /discussion/:id ----------

export async function discussionPage(ctx, id) {
  const { lang, env, req } = ctx;
  const sessionUser = await getSessionUser(req, env);
  if (!sessionUser) {
    const content = `<header class="page-head"><h1>${esc(t(lang, 'discussions_title'))}</h1></header>${discussionAuthGate(ctx)}`;
    return layout(ctx, { title: t(lang, 'discussion_login_title'), description: t(lang, 'discussion_login_intro'), active: '/discussions', content });
  }
  const full = await getDiscussionFull(env.DB, id);
  if (!full) {
    const content = `<div class="wrap"><p class="empty">${esc(t(lang, 'discussion_not_found'))}</p>
      <p><a class="btn" href="${langPath(ctx, '/discussions')}">${esc(t(lang, 'back_to_discussions'))}</a></p></div>`;
    return layout(ctx, { title: t(lang, 'discussion_not_found'), active: '/discussions', content });
  }
  const { discussion: d, replies, counts } = full;
  const { mine, user } = await viewerReactions(env.DB, req, id);
  const canWrite = user && (user.role === 'admin' || (user.role === 'researcher' && Number(user.is_verified) === 1));
  const pending = user && user.role === 'researcher' && Number(user.is_verified) !== 1;
  const csrfMeta = user && user.csrfToken ? `<meta name="csrf-token" content="${esc(user.csrfToken)}">` : '';

  const matUrl = d.material_id ? langPath(ctx, `/document/${encodeURIComponent(d.material_ark)}`) : null;
  const quoteBlock = d.quote_text ? `<blockquote class="d-quote" dir="auto">
      <div class="d-quote-label">${esc(t(lang, 'quote_label'))}${d.page_no ? ` — ${esc(t(lang, 'page_label'))} ${esc(d.page_no)}` : ''}</div>
      ${esc(d.quote_text)}</blockquote>` : '';

  // الردود: مستوى أول + ردود متداخلة
  const byId = new Map(replies.map((r) => [r.id, r]));
  const children = new Map();
  const roots = [];
  for (const r of replies) {
    if (r.parent_id && byId.has(r.parent_id)) {
      if (!children.has(r.parent_id)) children.set(r.parent_id, []);
      children.get(r.parent_id).push(r);
    } else roots.push(r);
  }
  const replyHTML = (r, nested) => {
    const rc = (counts.replies && counts.replies[r.id]) || {};
    const kids = (children.get(r.id) || []).map((k) => replyHTML(k, true)).join('');
    return `<div class="d-reply${nested ? ' nested' : ''}" id="reply-${r.id}">
      <div class="d-reply-head">${authorLine(lang, r.author_name, Number(r.author_verified) === 1)}
        <span class="d-meta">${fmtDT(r.created_at)}</span></div>
      <div class="d-reply-body" dir="auto">${esc(r.body)}</div>
      ${reactionButtons(lang, d.id, r.id, rc, mine[r.id])}
      ${canWrite && !nested ? `<button type="button" class="btn btn-small btn-ghost" data-reply-to="${r.id}">${esc(t(lang, 'reply_to'))}: ${esc(truncate(r.author_name, 20))}</button>` : ''}
      ${kids ? `<div class="d-children">${kids}</div>` : ''}
    </div>`;
  };

  const replyForm = canWrite ? `
    <section class="d-reply-form" id="replyForm">
      <h3>${esc(t(lang, 'add_reply'))}</h3>
      <form id="newReplyForm" data-discussion="${d.id}">
        <input type="hidden" name="parent_id" id="replyParentId" value="">
        <p class="reply-to-line hidden" id="replyToLine">${esc(t(lang, 'reply_to'))} <strong id="replyToName"></strong>
          <button type="button" id="replyToCancel" class="btn btn-small btn-ghost">×</button></p>
        <div class="field"><textarea name="body" id="replyBody" rows="4" required maxlength="10000" placeholder="${esc(t(lang, 'reply_placeholder'))}"></textarea></div>
        <button class="btn btn-primary" type="submit">${esc(t(lang, 'reply_send'))}</button>
      </form>
    </section>` : pending ? `
    <p class="notice">${esc(t(lang, 'pending_verification'))}</p>` : `
    <p class="d-cta"><a class="btn" href="/admin/login?lang=${lang}">${esc(t(lang, 'login_to_discuss'))}</a>
      <a class="btn btn-ghost" href="${langPath(ctx, '/researcher/register')}">${esc(t(lang, 'register_researcher'))}</a></p>`;

  const origin = new URL(ctx.url).origin;
  const canon = `${origin}/discussion/${d.id}?lang=${lang}`;
  const content = `${csrfMeta}
  <div class="wrap page-discussion">
    <nav class="breadcrumb"><a href="${langPath(ctx, '/')}">${esc(t(lang, 'nav_home'))}</a> /
      <a href="${langPath(ctx, '/discussions')}">${esc(t(lang, 'discussions_title'))}</a> / ${esc(truncate(d.title, 40))}</nav>
    <article class="d-full">
      <div class="d-card-top">${kindBadge(lang, d.kind)}
        <span class="d-meta">${authorLine(lang, d.author_name, Number(d.author_verified) === 1)} · ${fmtDT(d.created_at)}</span></div>
      <h1 class="d-title">${esc(d.title)}</h1>
      ${matUrl ? `<p class="d-card-mat">${esc(t(lang, 'discussion_about_material'))} <a href="${matUrl}">${esc(d.material_title || d.material_ark)}</a></p>` : `<p class="d-card-mat">${esc(t(lang, 'discussion_general'))}</p>`}
      ${quoteBlock}
      <div class="d-body" dir="auto">${esc(d.body)}</div>
      ${reactionButtons(lang, d.id, null, counts.discussion, mine[0])}
      ${shareHTML(ctx, null, { url: canon, title: `${d.title} — ${t(lang, 'discussions_title')}` })}
    </article>
    <section class="d-replies" id="replies">
      <h2>${esc(t(lang, 'replies_label'))} (${replies.length})</h2>
      ${roots.length ? roots.map((r) => replyHTML(r, false)).join('') : `<p class="empty">${esc(t(lang, 'discussions_empty'))}</p>`}
    </section>
    ${replyForm}
  </div>
  <script src="/js/discussions.js" defer></script>`;

  return layout(ctx, {
    title: d.title,
    description: truncate(d.body, 160),
    canonical: canon,
    ogImage: '/logo.png',
    active: '/discussions',
    content,
  });
}

// ---------- صفحة /researcher/register ----------

export function registerPage(ctx) {
  const { lang } = ctx;
  const content = `
  <div class="wrap page-register">
    <nav class="breadcrumb"><a href="${langPath(ctx, '/')}">${esc(t(lang, 'nav_home'))}</a> / ${esc(t(lang, 'register_researcher'))}</nav>
    <header class="page-head"><h1>${esc(t(lang, 'register_researcher'))}</h1>
      <p class="page-desc">${esc(t(lang, 'register_intro'))}</p></header>
    <form id="registerForm" class="card form-card register-card" novalidate>
      <div class="register-card-head">
        <div class="register-card-mark" aria-hidden="true">سِ</div>
        <div><span class="eyebrow">${esc(t(lang, 'site_name'))}</span><h2>${esc(t(lang, 'register_researcher'))}</h2></div>
      </div>
      <div class="register-form-section">
        <h2 class="register-section-title"><span>1</span>${esc(t(lang, 'register_profile_title'))}</h2>
        <div class="register-fields">
          <div class="register-field">
            <label for="rg-name"><span class="register-label-main">${esc(t(lang, 'register_name'))} <b aria-hidden="true">*</b></span><small>${esc(t(lang, 'register_required'))}</small></label>
            <div class="register-control"><input id="rg-name" name="display_name" required maxlength="80" autocomplete="name"></div>
            <p class="register-help">${esc(t(lang, 'register_name_help'))}</p>
          </div>
          <div class="register-fields register-contact-fields">
            <div class="register-field">
              <label for="rg-email"><span class="register-label-main">${esc(t(lang, 'register_email'))} <b aria-hidden="true">*</b></span><small>${esc(t(lang, 'register_required'))}</small></label>
              <div class="register-control"><input id="rg-email" name="email" type="email" required maxlength="160" autocomplete="email" dir="ltr"></div>
              <p class="register-help">${esc(t(lang, 'register_email_help'))}</p>
            </div>
            <div class="register-field">
              <label for="rg-phone"><span class="register-label-main">${esc(t(lang, 'register_phone'))} <b aria-hidden="true">*</b></span><small>${esc(t(lang, 'register_required'))}</small></label>
              <div class="register-control"><input id="rg-phone" name="phone" type="tel" required maxlength="40" autocomplete="tel" dir="ltr"></div>
              <p class="register-help">${esc(t(lang, 'register_phone_help'))}</p>
            </div>
          </div>
          <div class="register-field">
            <label for="rg-aff"><span class="register-label-main">${esc(t(lang, 'register_affiliation'))}</span><small>${esc(t(lang, 'register_affiliation').match(/\(([^)]+)\)/)?.[1] || '')}</small></label>
            <div class="register-control"><input id="rg-aff" name="affiliation" maxlength="160" autocomplete="organization"></div>
            <p class="register-help">${esc(t(lang, 'register_affiliation_help'))}</p>
          </div>
          <div class="register-field">
            <label for="rg-title"><span class="register-label-main">${esc(t(lang, 'register_job_title'))} <b aria-hidden="true">*</b></span><small>${esc(t(lang, 'register_required'))}</small></label>
            <div class="register-control"><input id="rg-title" name="job_title" required maxlength="160" autocomplete="organization-title"></div>
            <p class="register-help">${esc(t(lang, 'register_job_title_help'))}</p>
          </div>
          <div class="register-field">
            <label for="rg-bio"><span class="register-label-main">${esc(t(lang, 'register_bio'))} <b aria-hidden="true">*</b></span><small>${esc(t(lang, 'register_required'))}</small></label>
            <div class="register-control"><textarea id="rg-bio" name="bio" rows="4" required maxlength="500"></textarea></div>
            <p class="register-help">${esc(t(lang, 'register_bio_help'))}</p>
          </div>
        </div>
      </div>
      <div class="register-form-section">
        <h2 class="register-section-title"><span>2</span>${esc(t(lang, 'register_account_title'))}</h2>
        <div class="register-fields register-account-fields">
          <div class="register-field">
            <label for="rg-user"><span class="register-label-main">${esc(t(lang, 'register_username'))} <b aria-hidden="true">*</b></span><small>${esc(t(lang, 'register_required'))}</small></label>
            <div class="register-control"><input id="rg-user" name="username" required minlength="3" dir="ltr" autocomplete="username" placeholder="${esc(lang === 'ar' ? 'مثال: researcher_ahmed' : 'ex. researcher_ahmed')}"></div>
            <p class="register-help">${esc(t(lang, 'register_username_help'))}</p>
          </div>
          <div class="register-field">
            <label for="rg-pass"><span class="register-label-main">${esc(t(lang, 'register_password'))} <b aria-hidden="true">*</b></span><small>${esc(t(lang, 'register_required'))}</small></label>
            <div class="register-control register-password-control"><input id="rg-pass" name="password" type="password" required minlength="8" dir="ltr" autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle="rg-pass" data-show-label="${esc(t(lang, 'register_show_password'))}" data-hide-label="${esc(t(lang, 'register_hide_password'))}" aria-label="${esc(t(lang, 'register_show_password'))}" title="${esc(t(lang, 'register_show_password'))}">◉</button></div>
            <p class="register-help">${esc(t(lang, 'register_password_help'))}</p>
          </div>
        </div>
      </div>
      <div class="register-form-actions">
        <p class="form-msg" id="registerMsg" role="status" data-done="${esc(t(lang, 'register_done'))}"></p>
        <button class="btn btn-primary register-submit" type="submit">${esc(t(lang, 'register_submit'))}</button>
      </div>
      <div class="social-auth-divider"><span>${esc(lang === 'ar' ? 'أو' : 'ou')}</span></div>
      <a class="btn btn-google btn-block" href="/auth/google/start?next=${encodeURIComponent('/researcher')}">${esc(t(lang, 'discussion_google_button'))}</a>
      <p class="social-auth-note">${esc(t(lang, 'discussion_google_note'))}</p>
    </form>
  </div>
  <script src="/js/discussions.js" defer></script>`;
  return layout(ctx, { title: t(lang, 'register_researcher'), active: '/discussions', content });
}

// ---------- قسم النقاشات في صفحة المادة ----------

export async function discussionSectionHTML(ctx, material) {
  const { lang, env } = ctx;
  const items = await discussionsForMaterial(env.DB, material.id, 5);
  const list = items.length ? `<div class="d-list-mini">${items.map((d) => `
    <a class="d-mini" href="${langPath(ctx, `/discussion/${d.id}`)}">
      ${kindBadge(lang, d.kind)}
      <span class="d-mini-title">${esc(d.title)}</span>
      <span class="d-mini-meta">${esc(d.author_name || '')} · 💬 ${d.replies_count || 0}</span>
    </a>`).join('')}</div>`
    : `<p class="empty">${esc(t(lang, 'no_discussions_yet'))}</p>`;
  return `<section class="doc-section" id="discussions">
    <h2 class="doc-section-title">${esc(t(lang, 'discussions_on_material'))}</h2>
    ${list}
    <p class="d-cta">
      <a class="btn btn-small" href="${langPath(ctx, '/discussions')}?material_id=${material.id}">${esc(t(lang, 'view_all_discussions'))}</a>
      <a class="btn btn-small btn-ghost" href="${langPath(ctx, '/researcher/discussions')}?material_id=${material.id}">${esc(t(lang, 'start_discussion'))}</a>
    </p>
  </section>`;
}
