import { getRuntime } from './environment.js';
import { resolveAppUrl } from './api-base.js';
import { ApiError } from './api-client.js';
import { getSession, login, logout } from './auth.js';

const shell = document.querySelector('[data-mobile-shell]');
const runtimeEl = shell?.querySelector('[data-runtime]');
const loading = shell?.querySelector('[data-loading-state]');
const offline = shell?.querySelector('[data-offline-state]');
const error = shell?.querySelector('[data-error-state]');
const errorMessage = shell?.querySelector('[data-error-message]');
const loginState = shell?.querySelector('[data-login-state]');
const authenticatedState = shell?.querySelector('[data-authenticated-state]');
const loginForm = shell?.querySelector('[data-login-form]');
const loginSubmit = shell?.querySelector('[data-login-submit]');
const loginMessage = shell?.querySelector('[data-login-message]');
const sessionUser = shell?.querySelector('[data-session-user]');
const sessionMessage = shell?.querySelector('[data-session-message]');
const logoutButton = shell?.querySelector('[data-logout]');
const retries = shell?.querySelectorAll('[data-retry]') || [];

function updateRuntime() {
  const runtime = getRuntime();
  if (runtimeEl) runtimeEl.textContent = runtime === 'capacitor' ? 'تطبيق Android' : runtime === 'pwa' ? 'تطبيق ويب مثبت' : 'نسخة الويب';
  document.documentElement.dataset.sidjilRuntime = runtime;
}

function showError(message) {
  loading?.setAttribute('hidden', '');
  offline?.setAttribute('hidden', '');
  if (errorMessage) errorMessage.textContent = message;
  error?.removeAttribute('hidden');
}

function showOnlineState() {
  offline?.setAttribute('hidden', '');
  if (error && !error.hasAttribute('hidden')) error.setAttribute('hidden', '');
  loading?.removeAttribute('hidden');
  loginState?.setAttribute('hidden', '');
  authenticatedState?.setAttribute('hidden', '');
}

function showOfflineState() {
  loading?.setAttribute('hidden', '');
  error?.setAttribute('hidden', '');
  offline?.removeAttribute('hidden');
}

function retry() {
  if (!navigator.onLine) return showOfflineState();
  bootstrapSession();
}

async function bootstrapSession() {
  if (!navigator.onLine) return showOfflineState();
  showOnlineState();
  updateRuntime();
  try {
    const state = await getSession();
    loading?.setAttribute('hidden', '');
    if (state.authenticated) {
      const name = state.user?.display_name || state.user?.username || 'باحث';
      if (sessionUser) sessionUser.textContent = `مرحبًا ${name}`;
      authenticatedState?.removeAttribute('hidden');
    } else {
      loginState?.removeAttribute('hidden');
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NETWORK_ERROR') return showOfflineState();
    showError(error?.message || 'تعذر التحقق من الجلسة.');
  }
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!navigator.onLine) return showOfflineState();
  const username = String(loginForm.username.value || '').trim();
  const password = String(loginForm.password.value || '');
  if (!username || !password) { if (loginMessage) loginMessage.textContent = 'اسم المستخدم وكلمة المرور مطلوبان.'; return; }
  loginSubmit.disabled = true;
  if (loginMessage) loginMessage.textContent = '';
  try {
    const result = await login(username, password);
    loginForm.reset();
    if (sessionUser) sessionUser.textContent = `مرحبًا ${result.user?.display_name || result.user?.username || username}`;
    loginState?.setAttribute('hidden', '');
    authenticatedState?.removeAttribute('hidden');
  } catch (error) {
    if (loginMessage) loginMessage.textContent = error?.message || 'تعذر تسجيل الدخول.';
  } finally { loginSubmit.disabled = false; }
});

logoutButton?.addEventListener('click', async () => {
  logoutButton.disabled = true;
  if (sessionMessage) sessionMessage.textContent = '';
  try {
    await logout();
    authenticatedState?.setAttribute('hidden', '');
    loginState?.removeAttribute('hidden');
  } catch (error) {
    if (sessionMessage) sessionMessage.textContent = error?.message || 'تعذر تسجيل الخروج.';
  } finally { logoutButton.disabled = false; }
});

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

bootstrapSession();
window.addEventListener('online', retry);
window.addEventListener('offline', showOfflineState);
retries.forEach((button) => button.addEventListener('click', retry));

// Keep the resolver reachable during Phase 1 so the adapter can be tested
// without migrating the existing application fetch calls yet.
if (shell) shell.dataset.apiOrigin = resolveAppUrl('/').replace(/\/$/, '');
if (!navigator.onLine) showOfflineState();

export { updateRuntime, retry, showError };

