const ROUTES = new Set(['feed', 'search', 'profile', 'account']);

export function parseRoute(hash = '') {
  const value = String(hash || '').replace(/^#/, '').trim();
  if (value.startsWith('profile/')) {
    const id = value.slice('profile/'.length).replace(/[^\d]/g, '');
    return id ? { name: 'profile', id } : { name: 'feed' };
  }
  return ROUTES.has(value) ? { name: value } : { name: 'feed' };
}

export function navigateToResearcherProfile(navigation, id) {
  return navigation?.navigate?.({ name: 'profile', id });
}

export function classifyNavigationUrl(value, appOrigin = 'https://app.sidjil.org') {
  try {
    const url = new URL(String(value || ''), appOrigin);
    const app = new URL(appOrigin);
    if (!/^https?:$/.test(url.protocol)) return 'invalid';
    return url.origin === app.origin ? 'internal' : 'external';
  } catch { return 'invalid'; }
}

export function createNavigation({ onRoute, historyLike = globalThis.history, locationLike = globalThis.location, windowLike = globalThis } = {}) {
  let current = parseRoute(locationLike?.hash || '');
  let started = false;
  const emit = () => { if (typeof onRoute === 'function') onRoute({ ...current }); };
  const onHistory = () => { current = parseRoute(locationLike?.hash || ''); emit(); };
  function start() {
    if (started) { emit(); return () => {}; }
    started = true;
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

