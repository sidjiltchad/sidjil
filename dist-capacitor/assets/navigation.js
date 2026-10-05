const ROUTES = new Set(['feed', 'profile', 'account']);

export function parseRoute(hash = '') {
  const value = String(hash || '').replace(/^#/, '').trim();
  if (value.startsWith('profile/')) {
    const id = value.slice('profile/'.length).replace(/[^\d]/g, '');
    return id ? { name: 'profile', id } : { name: 'feed' };
  }
  return ROUTES.has(value) ? { name: value } : { name: 'feed' };
}

export function createNavigation({ onRoute, historyLike = globalThis.history, locationLike = globalThis.location, windowLike = globalThis } = {}) {
  let current = parseRoute(locationLike?.hash || '');
  const emit = () => { if (typeof onRoute === 'function') onRoute({ ...current }); };
  const onHistory = () => { current = parseRoute(locationLike?.hash || ''); emit(); };
  function start() {
    windowLike?.addEventListener?.('popstate', onHistory);
    windowLike?.addEventListener?.('hashchange', onHistory);
    emit();
    return () => {
      windowLike?.removeEventListener?.('popstate', onHistory);
      windowLike?.removeEventListener?.('hashchange', onHistory);
    };
  }
  function navigate(route) {
    const next = typeof route === 'string' ? parseRoute(route) : route;
    current = next?.name === 'profile' && next.id
      ? { name: 'profile', id: String(next.id).replace(/[^\d]/g, '') }
      : ROUTES.has(next?.name) ? { name: next.name } : { name: 'feed' };
    const hash = current.name === 'profile' ? `#profile/${current.id}` : `#${current.name}`;
    try { historyLike?.pushState?.({ route: current }, '', hash); } catch { /* embedded WebView fallback */ }
    emit();
    return { ...current };
  }
  return { start, navigate, getRoute: () => ({ ...current }) };
}

