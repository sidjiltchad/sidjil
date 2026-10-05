import { getRuntime } from './environment.js';
import { resolveAppUrl } from './api-base.js';
import { ApiError, apiFetch } from './api-client.js';
import { getSession, login, logout } from './auth.js';
import { createResearcherFeedClient } from './researcher-feed.js';
import { createNavigation, navigateToResearcherProfile, navigateToMaterial, navigateToMaterialReader } from './navigation.js';
import { createResearcherSearchClient } from './researcher-search.js';
import { getResearcherProfile } from './researcher-profile.js';
import { createMaterialClient, isPdfFile, isDocxFile } from './material.js';
import { mountPdfReader } from './pdf-reader.js';
import { mountWordReader } from './docx-reader.js';
import { createNativeFilesClient, NativeFileError } from './native-files.js';
import { createNativeUploadClient, UploadError, validateUploadFile } from './native-upload.js';

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
const refreshButton = shell?.querySelector('[data-refresh]');
const searchForm = shell?.querySelector('[data-search-form]');
const searchInput = shell?.querySelector('#mobileSearchInput');
const searchClear = shell?.querySelector('[data-search-clear]');
const searchStatus = shell?.querySelector('[data-search-status]');
const searchResults = shell?.querySelector('[data-search-results]');
const searchMore = shell?.querySelector('[data-search-more]');
const profileAvatar = shell?.querySelector('[data-profile-avatar]');
const profileTitle = shell?.querySelector('[data-profile-title]');
const profileUsername = shell?.querySelector('[data-profile-username]');
const profileBio = shell?.querySelector('[data-profile-bio]');
const profileMeta = shell?.querySelector('[data-profile-meta]');
const profileStats = shell?.querySelector('[data-profile-stats]');
const profileContent = shell?.querySelector('[data-profile-content]');
const materialDetails = shell?.querySelector('[data-material-details]');
const materialBack = shell?.querySelector('[data-material-back]');
const newMaterialBack = shell?.querySelector('[data-new-material-back]');
const newMaterialForm = shell?.querySelector('[data-new-material-form]');
const uploadFileName = shell?.querySelector('[data-upload-file-name]');
const uploadPreview = shell?.querySelector('[data-upload-preview]');
const uploadProgress = shell?.querySelector('[data-upload-progress]');
const uploadProgressBar = shell?.querySelector('[data-upload-progress-bar]');
const uploadStatus = shell?.querySelector('[data-upload-status]');
const uploadSubmit = shell?.querySelector('[data-upload-submit]');
const uploadCancel = shell?.querySelector('[data-upload-cancel]');
const uploadRetry = shell?.querySelector('[data-upload-retry]');
const readerHost = shell?.querySelector('[data-mobile-reader]');
const feedClient = createResearcherFeedClient();
const searchClient = createResearcherSearchClient();
const materialClient = createMaterialClient();
const nativeFiles = createNativeFilesClient();
const nativeUpload = createNativeUploadClient();
let activeFilter = 'discover';
let feedRequestPending = false;
let profileRequestId = 0;
const profileCache = new Map();
let materialReader = null;
let materialRequestId = 0;
let readerRequestId = 0;
let currentUpload = null;
let lastUpload = null;

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
        image.crossOrigin = 'use-credentials';
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
  if (className === 'mobile-feed-title' || className === 'mobile-feed-excerpt') {
    node.dir = /[\u0600-\u06ff]/u.test(String(text || '')) ? 'rtl' : 'ltr';
  }
  parent.append(node);
  return node;
}
function materialCard(item) {
  const card = document.createElement('article');
  card.className = 'mobile-feed-card';
  card.dataset.materialId = String(item.id || '');
  card.tabIndex = 0;
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

function showSearchStatus(message = '') {
  if (searchStatus) searchStatus.textContent = message;
}

function searchResultCard(item) {
  const type = item.kind === 'researcher' ? 'باحث' : item.kind === 'material' ? 'مادة' : item.kind === 'discussion' ? 'منشور' : 'رد';
  const card = document.createElement(item.kind === 'researcher' ? 'button' : 'article');
  card.className = 'mobile-search-result';
  if (item.kind === 'researcher') {
    card.type = 'button';
    card.dataset.profileId = String(item.id || '');
    card.append(avatarElement({ name: item.name, avatarUrl: item.avatarUrl }));
    const textWrap = document.createElement('span');
    addText(textWrap, 'h3', item.name || 'باحث');
    addText(textWrap, 'p', [type, item.jobTitle || item.specialty || ''].filter(Boolean).join(' · '));
    card.append(textWrap);
    return card;
  }
  if (item.kind === 'material') {
    card.dataset.materialId = String(item.id || '');
    card.tabIndex = 0;
    if (item.thumbnailUrl) {
      const image = document.createElement('img');
      image.className = 'mobile-search-thumb'; image.alt = ''; image.loading = 'lazy'; image.src = resolveAppUrl(item.thumbnailUrl); image.referrerPolicy = 'strict-origin-when-cross-origin';
      image.addEventListener('error', () => image.remove(), { once: true }); card.append(image);
    }
    const textWrap = document.createElement('span');
    addText(textWrap, 'h3', item.title || item.ark || 'مادة');
    addText(textWrap, 'p', [type, item.year, 'عرض التفاصيل داخل مساحة الباحث'].filter(Boolean).join(' · '));
    card.append(textWrap); return card;
  }
  const textWrap = document.createElement('span');
  addText(textWrap, 'h3', item.title || (item.kind === 'reply' ? 'رد باحث' : 'منشور باحث'));
  addText(textWrap, 'p', [type, item.body || item.authorName || ''].filter(Boolean).join(' · '));
  card.append(textWrap); return card;
}

function materialDetailRow(label, value) {
  if (!value) return null;
  const row = document.createElement('div'); row.className = 'mobile-material-row';
  addText(row, 'span', label, 'mobile-material-label'); addText(row, 'span', value, 'mobile-material-value');
  return row;
}

async function runFileAction(file, action, title, variant, statusEl) {
  if (!file || !file.url) return;
  statusEl.textContent = action === 'download' ? 'جارٍ حفظ الملف…' : action === 'share' ? 'جارٍ تجهيز المشاركة…' : 'جارٍ تجهيز الفتح الخارجي…';
  try {
    const handler = action === 'download' ? nativeFiles.downloadFile : action === 'share' ? nativeFiles.shareFile : nativeFiles.openFile;
    const result = await handler(file, { title, variant, onProgress: value => { if (value != null) statusEl.textContent = `${action === 'download' ? 'جارٍ حفظ الملف' : 'جارٍ تجهيز الملف'}… ${Math.round(value * 100)}%`; } });
    statusEl.textContent = action === 'download'
      ? (result.native ? `تم حفظ ${result.filename} داخل مساحة التطبيق.` : 'بدأ تنزيل الملف.')
      : action === 'share' ? 'تم فتح نافذة المشاركة.' : 'تم فتح قائمة التطبيقات المناسبة.';
  } catch (error) {
    if (error instanceof NativeFileError && error.code === 'AUTH_REQUIRED') return showLogin(error.message);
    statusEl.textContent = error?.message || 'تعذر تنفيذ عملية الملف.';
  }
}

function fileActions(file, title, variant, statusEl) {
  const wrap = document.createElement('div'); wrap.className = 'mobile-file-actions';
  const label = variant === 'translation' ? 'الترجمة' : 'الأصل'; addText(wrap, 'strong', label, 'mobile-file-actions-label');
  [['download', 'حفظ'], ['share', 'مشاركة'], ['open', 'فتح خارجيًا']].forEach(([action, text]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.addEventListener('click', async () => { button.disabled = true; try { await runFileAction(file, action, title, variant, statusEl); } finally { button.disabled = false; } }); wrap.append(button); });
  return wrap;
}

function renderMaterialDetails(material) {
  if (!materialDetails) return;
  materialDetails.replaceChildren();
  const header = document.createElement('div'); header.className = 'mobile-material-head';
  addText(header, 'span', typeLabels[material.materialLevel] || material.type || 'مادة أرشيفية', 'mobile-feed-type');
  addText(header, 'h1', material.title, 'mobile-material-title');
  if (material.ark) addText(header, 'p', material.ark, 'mobile-feed-meta');
  materialDetails.append(header);
  if (material.thumbnail?.url) { const image = document.createElement('img'); image.className = 'mobile-material-cover'; image.src = resolveAppUrl(material.thumbnail.url); image.alt = `معاينة ${material.title}`; image.loading = 'lazy'; materialDetails.append(image); }
  const summary = material.summary || material.description;
  if (summary) addText(materialDetails, 'p', summary, 'mobile-material-description');
  const rows = [
    ['المؤلف', material.author], ['المصور', material.photographer], ['السنة', material.year], ['التاريخ', material.dateText],
    ['المصدر', material.sourceName], ['الموضع', material.placeName], ['المرجع الأرشيفي', material.archiveRef],
  ].map(([label, value]) => materialDetailRow(label, value)).filter(Boolean);
  if (rows.length) { const grid = document.createElement('div'); grid.className = 'mobile-material-meta-grid'; rows.forEach(row => grid.append(row)); materialDetails.append(grid); }
  const actions = document.createElement('div'); actions.className = 'mobile-material-actions';
  if (material.readableOriginal) { const read = document.createElement('button'); read.type = 'button'; read.className = 'mobile-primary-action'; read.textContent = isDocxFile(material.readableOriginal) ? 'قراءة Word' : 'قراءة الأصل'; read.addEventListener('click', () => navigateToMaterialReader(navigation, material.id, 'original')); actions.append(read); }
  const readableTranslations = material.translations.filter(item => isPdfFile(item) || isDocxFile(item));
  if (readableTranslations.length) { const translate = document.createElement('button'); translate.type = 'button'; translate.className = 'mobile-secondary-action'; translate.textContent = 'قراءة الترجمة'; translate.addEventListener('click', () => navigateToMaterialReader(navigation, material.id, 'translation')); actions.append(translate); }
  else if (material.translations.length) addText(actions, 'span', 'توجد ترجمة مرفوعة بصيغة غير PDF.', 'mobile-feed-meta');
  materialDetails.append(actions);
  const fileStatus = document.createElement('p'); fileStatus.className = 'mobile-file-status'; fileStatus.setAttribute('role', 'status');
  if (material.original) materialDetails.append(fileActions(material.original, material.title, 'original', fileStatus));
  const translationFile = material.translations.find(item => item.url);
  if (translationFile) materialDetails.append(fileActions(translationFile, material.title, 'translation', fileStatus));
  materialDetails.append(fileStatus);
  if (material.fullText) { addText(materialDetails, 'h2', 'النص المفرغ', 'mobile-material-section-title'); const text = addText(materialDetails, 'div', material.fullText, 'mobile-material-text'); text.dir = /[\u0600-\u06ff]/u.test(material.fullText) ? 'rtl' : 'ltr'; }
}

async function loadMaterial(id) {
  const requestId = ++materialRequestId;
  if (!materialDetails) return;
  materialDetails.replaceChildren(); addText(materialDetails, 'p', 'جارٍ تحميل تفاصيل المادة…', 'mobile-feed-status');
  try {
    const material = await materialClient.getMaterial(id);
    if (requestId !== materialRequestId) return;
    renderMaterialDetails(material);
  } catch (cause) {
    if (requestId !== materialRequestId) return;
    materialDetails.replaceChildren(); addText(materialDetails, 'p', cause?.message || 'تعذر تحميل تفاصيل المادة.', 'mobile-feed-status');
  }
}

async function loadReader(id, source) {
  if (!readerHost) return;
  const requestId = ++readerRequestId;
  materialReader?.destroy?.(); materialReader = null;
  readerHost.replaceChildren(); addText(readerHost, 'p', 'جارٍ تجهيز القارئ…', 'mobile-feed-status');
  try {
    const material = await materialClient.getMaterial(id);
    if (requestId !== readerRequestId) return;
    const file = source === 'translation'
      ? material.translations.find(item => isPdfFile(item) || isDocxFile(item))
      : material.readableOriginal;
    if (!file) throw new Error('لا يوجد ملف قابل للقراءة لهذا العرض.');
    readerHost.replaceChildren();
    const mount = isDocxFile(file) ? mountWordReader : mountPdfReader;
    materialReader = await mount(readerHost, {
      material,
      source,
      fileActions: nativeFiles,
      onBack: () => navigation.back(),
      onSourceChange: next => loadReader(id, next),
    });
  } catch (cause) { if (requestId === readerRequestId) { readerHost.replaceChildren(); addText(readerHost, 'p', cause?.message || 'تعذر تشغيل القارئ.', 'mobile-feed-status'); } }
}

function setUploadStatus(message = '', errorState = false) {
  if (!uploadStatus) return;
  uploadStatus.textContent = message;
  uploadStatus.classList.toggle('is-error', Boolean(errorState));
}

function selectedNewMaterialFile() { return newMaterialForm?.querySelector('input[name="file"]')?.files?.[0] || null; }
function selectedUploadKind() { return newMaterialForm?.querySelector('select[name="kind"]')?.value || 'content-file'; }

function renderUploadPreview(file) {
  if (!uploadPreview) return;
  uploadPreview.replaceChildren();
  if (!file) { uploadPreview.hidden = true; return; }
  uploadPreview.hidden = false;
  if (/^image\//i.test(file.type || '') || /\.(?:jpe?g|png|webp|gif|tiff?|heic)$/i.test(file.name || '')) {
    const image = document.createElement('img'); image.alt = 'معاينة الملف'; image.src = URL.createObjectURL(file); image.onload = () => URL.revokeObjectURL(image.src); uploadPreview.append(image);
  }
  addText(uploadPreview, 'span', `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`, 'mobile-upload-file-meta');
}

function resetUploadControls({ keepStatus = false } = {}) {
  if (uploadProgress) uploadProgress.hidden = true;
  if (uploadProgressBar) uploadProgressBar.style.width = '0%';
  if (uploadCancel) uploadCancel.hidden = true;
  if (!keepStatus && uploadRetry) uploadRetry.hidden = true;
}

async function uploadCreatedMaterial(id, file, kind) {
  lastUpload = { id: String(id), file, kind };
  currentUpload = nativeUpload.uploadFile(id, file, {
    kind,
    onProgress: value => {
      if (uploadProgress) uploadProgress.hidden = false;
      if (uploadProgressBar) uploadProgressBar.style.width = `${Math.round(value * 100)}%`;
      setUploadStatus(`جارٍ رفع ${file.name}… ${Math.round(value * 100)}%`);
    },
  });
  if (uploadCancel) uploadCancel.hidden = false;
  try {
    const result = await currentUpload;
    setUploadStatus('تم رفع الملف وإنشاء المسودة. يمكنك إرسالها للمراجعة من تفاصيل المادة.');
    if (uploadRetry) uploadRetry.hidden = true;
    resetUploadControls({ keepStatus: true });
    materialClient.clear(id);
    navigation.navigate({ name: 'material', id: String(id) });
    return result;
  } catch (cause) {
    const message = cause?.message || 'تعذر إكمال الرفع.';
    setUploadStatus(message, true);
    if (uploadRetry) uploadRetry.hidden = false;
    resetUploadControls({ keepStatus: true });
    throw cause;
  } finally {
    currentUpload = null;
    if (uploadCancel) uploadCancel.hidden = true;
  }
}

async function submitNewMaterial(event) {
  event.preventDefault();
  if (!newMaterialForm || currentUpload) return;
  const file = selectedNewMaterialFile();
  const kind = selectedUploadKind();
  let fileRule;
  try { fileRule = validateUploadFile(file, { kind }); } catch (cause) { setUploadStatus(cause.message, true); return; }
  const data = new FormData(newMaterialForm);
  const payload = {
    type: String(data.get('type') || 'document'),
    material_level: String(data.get('material_level') || ''),
    title_ar: String(data.get('title_ar') || '').trim(),
    title_orig: String(data.get('title_orig') || '').trim(),
    description: String(data.get('description') || '').trim(),
    language: String(data.get('language') || 'ar'),
  };
  const year = Number.parseInt(String(data.get('year') || ''), 10); if (Number.isInteger(year)) payload.year = year;
  if (!payload.title_ar) { setUploadStatus('العنوان بالعربية مطلوب.', true); return; }
  uploadSubmit.disabled = true; uploadRetry.hidden = true; setUploadStatus('جارٍ إنشاء المسودة…'); resetUploadControls({ keepStatus: true });
  try {
    const created = await apiFetch('/api/v1/admin/materials', { method: 'POST', body: payload });
    await uploadCreatedMaterial(created.id, file, fileRule.kind);
  } catch (cause) {
    if (cause instanceof ApiError && (cause.code === 'AUTH_REQUIRED' || cause.code === 'SESSION_REDIRECT')) return showLogin('انتهت جلسة الباحث. سجّل الدخول من جديد.');
    if (cause instanceof UploadError && cause.code === 'AUTH_REQUIRED') return showLogin(cause.message);
    if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') return showOfflineState();
    if (!(cause instanceof UploadError)) setUploadStatus(cause?.message || 'تعذر إنشاء المسودة.', true);
  } finally { uploadSubmit.disabled = false; }
}

newMaterialForm?.querySelector('input[name="file"]')?.addEventListener('change', () => {
  const file = selectedNewMaterialFile();
  if (uploadFileName) uploadFileName.textContent = file?.name || 'لم يُختر ملف';
  renderUploadPreview(file);
  if (file) { try { setUploadStatus(validateUploadFile(file, { kind: selectedUploadKind() }).filename); } catch (cause) { setUploadStatus(cause.message, true); } }
});
newMaterialForm?.querySelector('select[name="kind"]')?.addEventListener('change', () => {
  const file = selectedNewMaterialFile();
  if (file) { try { setUploadStatus(validateUploadFile(file, { kind: selectedUploadKind() }).filename); } catch (cause) { setUploadStatus(cause.message, true); } }
});
newMaterialForm?.addEventListener('submit', submitNewMaterial);
newMaterialBack?.addEventListener('click', () => navigation.back());
uploadCancel?.addEventListener('click', () => {
  if (!lastUpload || !currentUpload) return;
  nativeUpload.cancelUpload(lastUpload.id, lastUpload.file, { kind: lastUpload.kind });
});
uploadRetry?.addEventListener('click', () => {
  if (!lastUpload || currentUpload) return;
  uploadRetry.hidden = true;
  uploadCreatedMaterial(lastUpload.id, lastUpload.file, lastUpload.kind).catch(cause => { if (cause instanceof UploadError && cause.code === 'AUTH_REQUIRED') showLogin(cause.message); });
});

function renderSearchResults(items) {
  if (!searchResults) return;
  searchResults.replaceChildren();
  if (!items.length) { showSearchStatus(searchInput?.value.trim().length >= 2 ? 'لا توجد نتائج مطابقة.' : 'اكتب حرفين على الأقل لبدء البحث.'); return; }
  showSearchStatus('');
  const fragment = document.createDocumentFragment();
  items.forEach(item => fragment.append(searchResultCard(item)));
  searchResults.append(fragment);
}

async function runSearch(query) {
  const value = String(query || '').trim();
  if (searchClear) searchClear.hidden = !value;
  if (value.length < 2) { searchResults?.replaceChildren(); showSearchStatus('اكتب حرفين على الأقل لبدء البحث.'); return; }
  showSearchStatus('جارٍ البحث…');
  if (searchMore) { searchMore.hidden = true; searchMore.disabled = true; }
  try {
    const state = await searchClient.search(value);
    renderSearchResults(state.items);
    if (searchMore) { searchMore.hidden = !state.hasMore; searchMore.disabled = false; }
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'ABORTED') return;
    if (cause instanceof ApiError && (cause.code === 'AUTH_REQUIRED' || cause.code === 'SESSION_REDIRECT')) return showLogin('انتهت جلسة الباحث. سجّل الدخول من جديد.');
    if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') return showOfflineState();
    showSearchStatus(cause?.message || 'تعذر تنفيذ البحث الآن. حاول مرة أخرى.');
    if (searchMore) { searchMore.hidden = true; searchMore.disabled = false; }
  }
}

function renderProfile(profileData) {
  const profile = profileData.profile || {};
  const stats = profileData.stats || {};
  if (profileTitle) profileTitle.textContent = profile.name || 'باحث';
  if (profileUsername) profileUsername.textContent = profile.username ? '@' + profile.username : '';
  if (profileBio) profileBio.textContent = profile.bio || 'لا توجد نبذة تعريفية.';
  if (profileMeta) { profileMeta.replaceChildren(); [profile.jobTitle, profile.affiliation, profile.specialty].filter(Boolean).forEach(value => addText(profileMeta, 'span', value)); }
  if (profileAvatar) {
    profileAvatar.replaceChildren();
    const avatar = avatarElement({ name: profile.name, avatarUrl: profile.avatarUrl });
    if (avatar.firstChild) profileAvatar.append(avatar.firstChild); else profileAvatar.textContent = profile.name?.trim().slice(0, 1) || 'ب';
  }
  if (profileStats) {
    profileStats.replaceChildren();
    [['materials', 'مواد'], ['discussions', 'منشورات'], ['replies', 'ردود'], ['followers', 'متابعون'], ['following', 'يتابع']].forEach(([key, label]) => {
      const stat = document.createElement('span'); stat.className = 'mobile-profile-stat';
      addText(stat, 'strong', String(stats[key] || 0)); addText(stat, 'small', label); profileStats.append(stat);
    });
  }
  if (!profileContent) return;
  profileContent.replaceChildren();
  const all = [...(profileData.materials || []).map(item => ({ ...item, displayKind: 'مادة' })), ...(profileData.discussions || []).map(item => ({ ...item, displayKind: 'منشور' })), ...(profileData.replies || []).map(item => ({ ...item, displayKind: 'رد' }))];
  if (!all.length) { addText(profileContent, 'p', 'لا توجد منشورات أو مواد منشورة بعد.', 'mobile-feed-status'); return; }
  all.forEach(item => {
    const card = document.createElement('article'); card.className = 'mobile-search-result';
    addText(card, 'span', item.displayKind, 'mobile-feed-type');
    const wrap = document.createElement('span');
    addText(wrap, 'h3', item.title || item.discussionTitle || 'مشاركة باحث');
    addText(wrap, 'p', item.summary || item.body || item.description || '');
    card.append(wrap); profileContent.append(card);
  });
}

async function loadProfile(id) {
  const requestId = ++profileRequestId;
  if (!id) { if (profileTitle) profileTitle.textContent = 'معرف الباحث غير صالح'; return; }
  if (profileContent) { profileContent.replaceChildren(); addText(profileContent, 'p', 'جارٍ تحميل الملف…', 'mobile-feed-status'); }
  try {
    const data = profileCache.get(String(id)) || await getResearcherProfile(id);
    profileCache.set(String(id), data);
    if (requestId !== profileRequestId) return;
    renderProfile(data);
  } catch (cause) {
    if (requestId !== profileRequestId) return;
    if (cause instanceof ApiError && (cause.code === 'AUTH_REQUIRED' || cause.code === 'SESSION_REDIRECT')) return showLogin('انتهت جلسة الباحث. سجّل الدخول من جديد.');
    if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') return showOfflineState();
    if (cause instanceof ApiError && cause.status === 404) { if (profileTitle) profileTitle.textContent = 'الباحث غير موجود'; if (profileContent) { profileContent.replaceChildren(); addText(profileContent, 'p', 'لم يعد هذا الحساب متاحًا.', 'mobile-feed-status'); } return; }
    if (cause instanceof ApiError && cause.status === 403) { if (profileTitle) profileTitle.textContent = 'الملف خاص'; if (profileContent) { profileContent.replaceChildren(); addText(profileContent, 'p', cause.message || 'لا يتيح هذا الباحث ملفه للعامة.', 'mobile-feed-status'); } return; }
    if (profileContent) { profileContent.replaceChildren(); addText(profileContent, 'p', cause?.message || 'تعذر تحميل ملف الباحث.', 'mobile-feed-status'); }
  }
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
  if (bottomNav) bottomNav.hidden = route.name === 'reader';
  document.body.classList.toggle('mobile-reader-open', route.name === 'reader');
  if (route.name !== 'reader') { materialReader?.destroy?.(); materialReader = null; }
  if (route.name === 'feed') loadFeed({ reset: activeFilter !== feedClient.getState().feed });
  if (route.name === 'search') {
    const state = searchClient.getState();
    if (searchInput && searchInput.value !== state.query) searchInput.value = state.query;
    if (searchClear) searchClear.hidden = !state.query;
    renderSearchResults(state.items);
  }
  if (route.name === 'profile') {
    if (profileTitle) profileTitle.textContent = route.id ? 'باحث رقم ' + route.id : 'مجتمع الباحثين';
    loadProfile(route.id);
  }
  if (route.name === 'material') loadMaterial(route.id);
  if (route.name === 'reader') loadReader(route.id, route.source);
}
const navigation = createNavigation({ onRoute: renderRoute });
shell?.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => navigation.navigate(button.dataset.route)));
shell?.addEventListener('click', event => {
  const author = event.target.closest('[data-profile-id]');
  if (author?.dataset.profileId) navigateToResearcherProfile(navigation, author.dataset.profileId);
  const material = event.target.closest('[data-material-id]');
  if (material?.dataset.materialId && !event.target.closest('button[data-profile-id]')) navigateToMaterial(navigation, material.dataset.materialId);
});
materialBack?.addEventListener('click', () => navigation.back());
shell?.querySelectorAll('[data-feed-filter]').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.feedFilter || 'discover';
  updateFilterButtons();
  navigation.navigate('feed');
  loadFeed({ reset: true });
}));
loadMoreButton?.addEventListener('click', () => loadFeed({ reset: false }));
refreshButton?.addEventListener('click', () => loadFeed({ reset: true }));
let searchTimer = null;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value;
  if (searchClear) searchClear.hidden = !query.trim();
  searchTimer = setTimeout(() => runSearch(query), 320);
});
searchForm?.addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); runSearch(searchInput?.value || ''); });
searchClear?.addEventListener('click', () => { if (searchInput) { searchInput.value = ''; searchInput.focus(); } clearTimeout(searchTimer); runSearch(''); });
searchMore?.addEventListener('click', async () => {
  searchMore.disabled = true;
  try { const state = await searchClient.loadMore(); renderSearchResults(state.items); searchMore.hidden = !state.hasMore; }
  catch (cause) { if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') showOfflineState(); else showSearchStatus(cause?.message || 'تعذر تحميل المزيد.'); searchMore.disabled = false; }
});
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
    nativeFiles.cleanupTemporaryFiles().catch(() => {});
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

