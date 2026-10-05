/**
 * SIDJIL mobile foundation: runtime detection shared by the future
 * Capacitor shell and the web/PWA delivery.  This module deliberately has
 * no Capacitor import so it is safe to load from the browser as well.
 */

export function isNativeApp() {
  const capacitor = globalThis.Capacitor;
  if (capacitor && typeof capacitor.isNativePlatform === 'function') {
    return Boolean(capacitor.isNativePlatform());
  }
  if (capacitor && typeof capacitor.getPlatform === 'function') {
    return capacitor.getPlatform() !== 'web';
  }
  return /^(capacitor|ionic):$/i.test(globalThis.location?.protocol || '');
}

export function isPwaApp() {
  if (isNativeApp()) return false;
  return Boolean(
    globalThis.matchMedia?.('(display-mode: standalone)')?.matches
    || globalThis.navigator?.standalone === true
  );
}

export function getRuntime() {
  if (isNativeApp()) return 'capacitor';
  if (isPwaApp()) return 'pwa';
  return 'web';
}

export function getRuntimeDiagnostics() {
  const capacitor = globalThis.Capacitor;
  return {
    runtime: getRuntime(),
    origin: globalThis.location?.origin || '',
    protocol: globalThis.location?.protocol || '',
    host: globalThis.location?.host || '',
    platform: typeof capacitor?.getPlatform === 'function' ? capacitor.getPlatform() : 'web',
    native: isNativeApp(),
  };
}

