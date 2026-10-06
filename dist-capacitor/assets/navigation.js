const ROUTES = new Set(['feed', 'search', 'profile', 'discussions', 'account', 'notifications', 'settings', 'new', 'material', 'reader']);

export function parseRoute(hash = '') {
  const value = String(hash || '').replace(/^#/, '').trim();
  if (value.startsWith('profile/')) {
    const id = value.slice('profile/'.length).replace(/[^\d]/g, '');
    return id ? { name: 'profile', id } : { name: 'feed' };
  }
  if (value.startsWith('material/')) {
    const parts = value.slice('material/'.length).split('/');
    const id = parts.shift()?.replace(/[^\d]/g, '');
    if (!id) return { name: 'feed' };
    if (parts[0] === 'read' && (parts[1] === 'original' || parts[1] === 'translation')) {
      return { name: 'reader', id, source: parts[1] };
    }
    return { name: 'material', id };
  }
  return ROUTES.has(value) ? { name: value } : { name: 'feed' };
}

export function navigateToResearcherProfile(navigation, id) {
  return navigation?.navigate?.({ name: 'profile', id });
}

export function navigateToMaterial(navigation, id) {
  return navigation?.navigate?.({ name: 'material', id });
}

export function navigateToMaterialReader(navigation, id, source = 'original') {
  return navigation?.navigate?.({ name: 'reader', id, source: source === 'translation' ? 'translation' : 'original' });
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
  const stack = [current];
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
    if (next?.name === 'profile' && next.id) current = { name: 'profile', id: String(next.id).replace(/[^\d]/g, '') };
    else if ((next?.name === 'material' || next?.name === 'reader') && next.id) {
      const id = String(next.id).replace(/[^\d]/g, '');
      current = next.name === 'reader' ? { name: 'reader', id, source: next.source === 'translation' ? 'translation' : 'original' } : { name: 'material', id };
    } else current = ROUTES.has(next?.name) ? { name: next.name } : { name: 'feed' };
    const hash = current.name === 'profile' ? `#profile/${current.id}` : current.name === 'material' ? `#material/${current.id}` : current.name === 'reader' ? `#material/${current.id}/read/${current.source}` : `#${current.name}`;
    try { historyLike?.pushState?.({ route: current }, '', hash); } catch { /* embedded WebView fallback */ }
    stack.push({ ...current });
    emit();
    return { ...current };
  }
  function back() {
    // A deep link or a restored WebView can start with a non-feed route and
    // an otherwise empty local stack. In that case Android back must still
    // have a safe in-app destination instead of falling through to exitApp.
    if (stack.length > 1) stack.pop();
    else if (current.name !== 'feed') {
      current = { name: 'feed' };
      stack[0] = { ...current };
    }
    const previous = stack[stack.length - 1] || current || { name: 'feed' };
    current = { ...previous };
    const hash = current.name === 'profile' ? `#profile/${current.id}` : current.name === 'material' ? `#material/${current.id}` : current.name === 'reader' ? `#material/${current.id}/read/${current.source}` : `#${current.name}`;
    try { historyLike?.replaceState?.({ route: current }, '', hash); } catch { /* embedded WebView fallback */ }
    emit();
    return { ...current };
  }
  function canGoBack() { return stack.length > 1; }
  function stackDepth() { return stack.length; }
  return { start, navigate, back, canGoBack, stackDepth, getRoute: () => ({ ...current }) };
}

