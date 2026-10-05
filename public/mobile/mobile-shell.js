import { getRuntime } from './environment.js';
import { resolveAppUrl } from './api-base.js';

const shell = document.querySelector('[data-mobile-shell]');
const runtimeEl = shell?.querySelector('[data-runtime]');
const loading = shell?.querySelector('[data-loading-state]');
const offline = shell?.querySelector('[data-offline-state]');
const error = shell?.querySelector('[data-error-state]');
const errorMessage = shell?.querySelector('[data-error-message]');
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
  if (!error?.hasAttribute('hidden')) error.setAttribute('hidden', '');
  loading?.removeAttribute('hidden');
}

function showOfflineState() {
  loading?.setAttribute('hidden', '');
  error?.setAttribute('hidden', '');
  offline?.removeAttribute('hidden');
}

function retry() {
  if (!navigator.onLine) return showOfflineState();
  showOnlineState();
  updateRuntime();
}

updateRuntime();
window.addEventListener('online', retry);
window.addEventListener('offline', showOfflineState);
retries.forEach((button) => button.addEventListener('click', retry));

// Keep the resolver reachable during Phase 1 so the adapter can be tested
// without migrating the existing application fetch calls yet.
if (shell) shell.dataset.apiOrigin = resolveAppUrl('/').replace(/\/$/, '');
if (!navigator.onLine) showOfflineState();

export { updateRuntime, retry, showError };

