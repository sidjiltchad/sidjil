/**
 * Android UX bridge for the Capacitor shell.
 *
 * The web build has no native plugins, so every call is optional and safely
 * ignored outside a Capacitor WebView. This keeps the same shell usable as a
 * PWA while giving Android a single place for Back, keyboard, lifecycle,
 * status-bar and splash handling.
 */

function plugin(name) {
  const capacitor = globalThis.Capacitor;
  if (!capacitor) return null;
  return capacitor.Plugins?.[name] || null;
}

function listen(value, eventName, handler, handles) {
  if (!value?.addListener) return;
  try {
    const pending = value.addListener(eventName, handler);
    if (pending?.then) pending.then(handle => { if (handle?.remove) handles.push(handle); }).catch(() => {});
    else if (pending?.remove) handles.push(pending);
  } catch { /* native plugin is optional in browser/PWA */ }
}

export function getNativePlugin(name) { return plugin(name); }

export function measureViewport(documentLike = globalThis.document, windowLike = globalThis) {
  const viewport = windowLike.visualViewport;
  const height = Number(viewport?.height || windowLike.innerHeight || 0);
  if (height > 0) documentLike?.documentElement?.style.setProperty('--sidjil-viewport-height', `${height}px`);
  return height;
}

export async function configureNativeChrome() {
  const statusBar = plugin('StatusBar');
  if (!statusBar) return false;
  await Promise.allSettled([
    statusBar.setOverlaysWebView?.({ overlay: false }),
    statusBar.setBackgroundColor?.({ color: '#0b1220' }),
    statusBar.setStyle?.({ style: 'DARK' }),
  ]);
  return true;
}

export async function hideNativeSplash() {
  const splash = plugin('SplashScreen');
  if (!splash?.hide) return false;
  try { await splash.hide({ fadeOutDuration: 180 }); return true; } catch { return false; }
}

export function installInternalNavigationGuard({ documentLike = globalThis.document, allowedOrigin = 'https://app.sidjil.org' } = {}) {
  if (!documentLike?.addEventListener) return () => {};
  const origins = new Set((Array.isArray(allowedOrigin) ? allowedOrigin : [allowedOrigin])
    .map(value => String(value || '').replace(/\/$/, ''))
    .filter(Boolean));
  const localOrigin = documentLike.defaultView?.location?.origin || globalThis.location?.origin || '';
  if (localOrigin) origins.add(localOrigin.replace(/\/$/, ''));
  const onClick = event => {
    if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    let url;
    try { url = new URL(anchor.href, localOrigin || [...origins][0]); } catch { return; }
    if ((url.protocol === 'https:' || url.protocol === 'capacitor:') && origins.has(url.origin)) return;
    event.preventDefault();
    documentLike.dispatchEvent?.(new CustomEvent('sidjil:external-navigation-blocked', { detail: { href: url.href } }));
  };
  documentLike.addEventListener('click', onClick, true);
  return () => documentLike.removeEventListener('click', onClick, true);
}

/**
 * Register only the native events that affect the existing shell.
 * The returned cleanup is useful for tests and hot reloads.
 */
export function setupNativeUx({ documentLike = globalThis.document, windowLike = globalThis, onBack } = {}) {
  const app = plugin('App');
  const keyboard = plugin('Keyboard');
  const handles = [];
  const root = documentLike?.documentElement;
  const setKeyboard = (open, height = 0) => {
    root?.classList.toggle('sidjil-keyboard-open', open);
    if (height) root?.style.setProperty('--sidjil-keyboard-height', `${height}px`);
    else root?.style.removeProperty('--sidjil-keyboard-height');
    measureViewport(documentLike, windowLike);
  };

  listen(app, 'backButton', event => onBack?.(event || { canGoBack: false }), handles);
  listen(app, 'appStateChange', state => {
    if (root) root.dataset.sidjilAppState = state?.isActive ? 'active' : 'background';
    windowLike?.dispatchEvent?.(new CustomEvent('sidjil:app-state', { detail: state }));
  }, handles);
  listen(keyboard, 'keyboardWillShow', info => setKeyboard(true, Number(info?.keyboardHeight || 0)), handles);
  listen(keyboard, 'keyboardWillHide', () => setKeyboard(false), handles);
  if (windowLike?.visualViewport?.addEventListener) {
    const resize = () => measureViewport(documentLike, windowLike);
    windowLike.visualViewport.addEventListener('resize', resize, { passive: true });
    handles.push({ remove: () => windowLike.visualViewport.removeEventListener('resize', resize) });
  }
  measureViewport(documentLike, windowLike);
  return () => { for (const handle of handles.splice(0)) { try { handle.remove?.(); } catch {} } };
}
