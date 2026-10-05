import { getRuntime } from './environment.js';
import { resolveAppUrl } from './api-base.js';
import { ApiError } from './api-client.js';
import { getSession, login, logout } from './auth.js';
import { createResearcherFeedClient } from './researcher-feed.js';
import { createNavigation } from './navigation.js';

const shell = document.querySelector('[data-mobile-shell]');
const runtimeEl = shell?.querySelector('[data-runtime]');
const loading = shell?.querySelector('[data-loading-state]');
const offline = shell?.querySelector('[data-offline-state]');
const error = shell?.querySelector('[data-error-state]');
const errorMessage = shell?.querySelector('[data-error-message]');
const loginState = shell?.querySelector('[data-login-state]');
const appState = shell?.querySelector('[data-app-state]');
const loginForm = shell?.querySelector('[data-login-form]');
const loginSubmit = shell?.querySelector('[data-login-submit]');
const loginMessage = shell?.querySelector('[data-login-message]');
const sessionUser = shell?.querySelector('[data-session-user]');
const accountName = shell?.querySelector('[data-account-name]');
const sessionMessage = shell?.querySelector('[data-session-message]');
const logoutButtons = shell?.querySelectorAll('[data-logout]') || [];
const feedList = shell?.querySelector('[data-feed-list]');
const feedStatus = shell?.querySelector('[data-feed-status]');
const loadMoreButton = shell?.querySelector('[data-load-more]');
const bottomNav = shell?.querySelector('.mobile-bottom-nav');
const feedClient = createResearcherFeedClient();
let activeFilter = 'discover';
let feedRequestPending = false;

const typeLabels = {
  archival_image: 'صورة أرشيفية',
  archival_text: 'مادة أرشيفية مفرغة',
  archival_book_original: 'كتاب أرشيفي أصيل',
  archival_book_unavailable: 'كتاب أرشيفي غير متاح للتحميل',
  chadian_publication: 'مؤلف تشادي',
};
const discussionLabels = { comment: 'تعليق', review: 'مراجعة', critique: 'نقد', idea: 'فكرة', text: 'تلخيص' };

function updateRuntime() {
  const runtime = getRuntime();
  if (runtimeEl) runtimeEl.textContent = runtime === 'capacitor' ? 'تطبيق Android' : runtime === 'pwa' ? 'تطبيق ويب مثبت' : 'نسخة الويب';
  document.documentElement.dataset.sidjilRuntime = runtime;
}
function hideState(element) { element?.setAttribute('hidden', ''); }
function showState(element) { element?.removeAttribute('hidden'); }
function showError(message) {
  hideState(loading); hideState(offline); hideState(appState); hideState(loginState);
  hideState(bottomNav);
  if (errorMessage) errorMessage.textContent = message;
  showState(error);
}
function showOfflineState() { hideState(loading); hideState(error); hideState(appState); hideState(bottomNav); showState(offline); }
function showLogin(message = '') {
  hideState(loading); hideState(offline); hideState(error); hideState(appState);
  hideState(bottomNav);
  if (loginMessage) loginMessage.textContent = message;
  showState(loginState);
}
function showApp() {
  hideState(loading); hideState(offline); hideState(error); hideState(loginState);
  showState(appState); showState(bottomNav);
}
function setFeedStatus(message, { hidden = false } = {}) {
  if (!feedStatus) return;
  feedStatus.textContent = message || '';
  feedStatus.hidden = hidden;
}
function showSkeletons() {
  if (!feedList) return;
  feedList.replaceChildren(...Array.from({ length: 3 }, () => {
    const skeleton = document.createElement('div');
    skeleton.className = 'mobile-skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    return skeleton;
  }));
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar-TD', { dateStyle: 'medium' }).format(date);
}
function avatarElement(person, fallback = 'ب') {
  const avatar = document.createElement('span');
  avatar.className = 'mobile-avatar';
  const name = String(person?.name || fallback);
  const url = String(person?.avatarUrl || '').trim();
  if (url) {
    try {
      const absolute = new URL(resolveAppUrl(url), globalThis.location?.origin || 'https://app.sidjil.org');
      if (absolute.hostname.endsWith('sidjil.org')) {
        const image = document.createElement('img');
        image.src = absolute.toString();
        image.alt = name;
        image.loading = 'lazy';
        image.referrerPolicy = 'strict-origin-when-cross-origin';
        image.addEventListener('error', () => { image.remove(); avatar.textContent = name.trim().slice(0, 1) || fallback; }, { once: true });
        avatar.append(image);
        return avatar;
      }
    } catch { /* initials fallback */ }
  }
  avatar.textContent = name.trim().slice(0, 1) || fallback;
  return avatar;
}
function addText(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}
function materialCard(item) {
  const card = document.createElement('article');
  card.className = 'mobile-feed-card';
  const body = document.createElement('div');
  body.className = 'mobile-feed-card-body';
  const authorButton = document.createElement('button');
  authorButton.type = 'button';
  authorButton.className = 'mobile-feed-author';
  authorButton.dataset.profileId = item.creator?.id ? String(item.creator.id) : '';
  authorButton.append(avatarElement(item.creator, 'س'));
  const authorWrap = document.createElement('span');
  addText(authorWrap, 'strong', item.creator?.name || 'أرشيف سِجِل');
  addText(authorWrap, 'span', [typeLabels[item.materialLevel] || 'مادة أرشيفية', item.year, formatDate(item.updatedAt)].filter(Boolean).join(' · '), 'mobile-feed-meta');
  authorButton.append(authorWrap);
  body.append(authorButton);
  addText(body, 'span', typeLabels[item.materialLevel] || 'مادة أرشيفية', 'mobile-feed-type');
  addText(body, 'h2', item.title || item.ark || 'مادة بلا عنوان', 'mobile-feed-title');
  if (item.thumbnailUrl) {
    const image = document.createElement('img');
    image.className = 'mobile-feed-image';
    image.alt = item.title || 'صورة المادة';
    image.loading = 'lazy';
    image.src = resolveAppUrl(item.thumbnailUrl);
    image.referrerPolicy = 'strict-origin-when-cross-origin';
    image.addEventListener('error', () => image.remove(), { once: true });
    body.append(image);
  }
  const excerpt = item.summary || item.description;
  if (excerpt) addText(body, 'p', excerpt, 'mobile-feed-excerpt');
  const source = [item.sourceName && 'المصدر: ' + item.sourceName, item.placeName && 'الموضع: ' + item.placeName, item.author && 'المؤلف: ' + item.author, item.archiveRef && 'المرجع: ' + item.archiveRef].filter(Boolean);
  if (source.length) {
    const sourceWrap = document.createElement('div');
    sourceWrap.className = 'mobile-feed-source';
    source.forEach(value => addText(sourceWrap, 'span', value));
    body.append(sourceWrap);
  }
  addText(body, 'span', String(item.discussionsCount || 0) + ' نقاش', 'mobile-feed-meta');
  card.append(body);
  return card;
}
function discussionCard(item) {
  const card = document.createElement('article');
  card.className = 'mobile-feed-card';
  const body = document.createElement('div');
  body.className = 'mobile-feed-card-body';
  const authorButton = document.createElement('button');
  authorButton.type = 'button';
  authorButton.className = 'mobile-feed-author';
  authorButton.dataset.profileId = item.author?.id ? String(item.author.id) : '';
  authorButton.append(avatarElement(item.author));
  const info = document.createElement('span');
  addText(info, 'strong', item.author?.name || 'باحث');
  addText(info, 'span', [discussionLabels[item.discussionKind] || 'مشاركة', formatDate(item.createdAt)].filter(Boolean).join(' · '), 'mobile-feed-meta');
  authorButton.append(info);
  body.append(authorButton);
  addText(body, 'h2', item.title || 'مشاركة باحث', 'mobile-feed-title');
  addText(body, 'p', item.body || '', 'mobile-feed-excerpt');
  if (item.materialTitle) addText(body, 'div', 'حول: ' + item.materialTitle, 'mobile-feed-source');
  addText(body, 'span', String(item.repliesCount || 0) + ' رد', 'mobile-feed-meta');
  card.append(body);
  return card;
}
function renderFeed(items) {
  if (!feedList) return;
  feedList.replaceChildren();
  if (!items.length) {
    setFeedStatus(activeFilter === 'following' ? 'لا توجد منشورات من الباحثين الذين تتابعهم بعد.' : 'لا توجد مواد منشورة في هذا التبويب بعد.');
    return;
  }
  setFeedStatus('', { hidden: true });
  const fragment = document.createDocumentFragment();
  items.forEach(item => fragment.append(item.kind === 'discussion' ? discussionCard(item) : materialCard(item)));
  feedList.append(fragment);
}
function updateFilterButtons() {
  shell?.querySelectorAll('[data-feed-filter]').forEach(button => {
    const selected = button.dataset.feedFilter === activeFilter;
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}
async function loadFeed({ reset = true } = {}) {
  if (feedRequestPending || (!reset && !feedClient.getState().hasMore)) return;
  feedRequestPending = true;
  if (reset) { showSkeletons(); setFeedStatus('جارٍ تحميل موجز الباحث…'); }
  if (loadMoreButton) { loadMoreButton.hidden = true; loadMoreButton.disabled = true; }
  try {
    const state = reset ? await feedClient.loadInitial({ feed: activeFilter }) : await feedClient.loadMore();
    renderFeed(state.items);
    if (loadMoreButton) { loadMoreButton.hidden = !state.hasMore; loadMoreButton.disabled = false; }
  } catch (cause) {
    if (cause instanceof ApiError && (cause.code === 'AUTH_REQUIRED' || cause.code === 'SESSION_REDIRECT')) {
      showLogin('انتهت جلسة الباحث. سجّل الدخول من جديد.');
    } else if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') {
      showOfflineState();
    } else {
      setFeedStatus(cause?.message || 'تعذر تحميل الموجز الآن. حاول مرة أخرى.');
      if (loadMoreButton) { loadMoreButton.hidden = false; loadMoreButton.disabled = false; }
    }
  } finally { feedRequestPending = false; }
}
function renderRoute(route) {
  shell?.querySelectorAll('[data-view]').forEach(view => { view.hidden = view.dataset.view !== route.name; });
  shell?.querySelectorAll('[data-nav-route]').forEach(button => button.classList.toggle('is-active', button.dataset.navRoute === route.name));
  if (route.name === 'feed') loadFeed({ reset: activeFilter !== feedClient.getState().feed });
  if (route.name === 'profile') {
    const title = shell?.querySelector('[data-profile-title]');
    if (title) title.textContent = route.id ? 'باحث رقم ' + route.id : 'مجتمع الباحثين';
  }
}
const navigation = createNavigation({ onRoute: renderRoute });
shell?.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => navigation.navigate(button.dataset.route)));
shell?.addEventListener('click', event => {
  const author = event.target.closest('[data-profile-id]');
  if (author?.dataset.profileId) navigation.navigate({ name: 'profile', id: author.dataset.profileId });
});
shell?.querySelectorAll('[data-feed-filter]').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.feedFilter || 'discover';
  updateFilterButtons();
  navigation.navigate('feed');
  loadFeed({ reset: true });
}));
loadMoreButton?.addEventListener('click', () => loadFeed({ reset: false }));
function retry() {
  if (!navigator.onLine) return showOfflineState();
  bootstrapSession();
}
async function bootstrapSession() {
  if (!navigator.onLine) return showOfflineState();
  showState(loading); hideState(error); hideState(offline);
  updateRuntime();
  try {
    const state = await getSession();
    if (!state.authenticated) return showLogin();
    const name = state.user?.display_name || state.user?.username || 'باحث';
    if (sessionUser) sessionUser.textContent = 'مرحبًا ' + name;
    if (accountName) accountName.textContent = name;
    showApp();
    updateFilterButtons();
    navigation.start();
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') return showOfflineState();
    showError(cause?.message || 'تعذر التحقق من الجلسة.');
  }
}
loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!navigator.onLine) return showOfflineState();
  const username = String(loginForm.username.value || '').trim();
  const password = String(loginForm.password.value || '');
  if (!username || !password) { if (loginMessage) loginMessage.textContent = 'اسم المستخدم وكلمة المرور مطلوبان.'; return; }
  loginSubmit.disabled = true;
  if (loginMessage) loginMessage.textContent = '';
  try {
    const result = await login(username, password);
    const name = result.user?.display_name || result.user?.username || username;
    if (sessionUser) sessionUser.textContent = 'مرحبًا ' + name;
    if (accountName) accountName.textContent = name;
    showApp();
    navigation.start();
    await loadFeed({ reset: true });
  } catch (cause) {
    if (loginMessage) loginMessage.textContent = cause?.message || 'تعذر تسجيل الدخول.';
  } finally { loginSubmit.disabled = false; }
});
logoutButtons.forEach(button => button.addEventListener('click', async () => {
  button.disabled = true;
  if (sessionMessage) sessionMessage.textContent = '';
  try { await logout(); showLogin(); }
  catch (cause) { if (sessionMessage) sessionMessage.textContent = cause?.message || 'تعذر تسجيل الخروج.'; }
  finally { button.disabled = false; }
}));
window.addEventListener('online', retry);
window.addEventListener('offline', showOfflineState);
shell?.querySelectorAll('[data-retry]').forEach(button => button.addEventListener('click', retry));
if (new URLSearchParams(globalThis.location?.search || '').get('diagnostics') === '1') {
  const capacitor = globalThis.Capacitor;
  globalThis.__SIDJIL_MOBILE_DIAGNOSTICS__ = {
    origin: globalThis.location?.origin || '',
    protocol: globalThis.location?.protocol || '',
    host: globalThis.location?.host || '',
    platform: typeof capacitor?.getPlatform === 'function' ? capacitor.getPlatform() : 'web',
    native: typeof capacitor?.isNativePlatform === 'function' ? capacitor.isNativePlatform() : false,
  };
}
if (shell) shell.dataset.apiOrigin = resolveAppUrl('/').replace(/\/$/, '');
bootstrapSession();

