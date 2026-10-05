import { apiFetch } from './api-client.js';

const DEFAULT_LIMIT = 18;

function asText(value) {
  return value == null ? '' : String(value);
}

function stableKey(item) {
  return `${asText(item?.kind || 'material')}:${asText(item?.id || item?.ark || item?.title)}`;
}

export function normalizeFeedResponse(data) {
  const items = Array.isArray(data?.items) ? data.items.filter(Boolean) : [];
  return {
    items,
    nextCursor: asText(data?.nextCursor),
    hasMore: Boolean(data?.hasMore && data?.nextCursor),
    count: Number(data?.count || items.length),
  };
}

export function mergeFeedItems(existing, incoming) {
  const result = Array.isArray(existing) ? existing.slice() : [];
  const seen = new Set(result.map(stableKey));
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const key = stableKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function createResearcherFeedClient({ request = apiFetch, limit = DEFAULT_LIMIT } = {}) {
  const state = {
    feed: 'discover',
    section: '',
    items: [],
    cursor: '',
    hasMore: true,
    loading: false,
  };

  function snapshot() {
    return { ...state, items: state.items.slice() };
  }

  async function load({ feed = state.feed, section = state.section, reset = true } = {}) {
    if (state.loading) return snapshot();
    if (!reset && !state.hasMore) return snapshot();
    state.loading = true;
    if (reset) {
      state.feed = ['discover', 'latest', 'official', 'following'].includes(feed) ? feed : 'discover';
      state.section = section ? String(section) : '';
      state.items = [];
      state.cursor = '';
      state.hasMore = true;
    }
    try {
      const params = new URLSearchParams({ feed: state.feed, limit: String(limit), format: 'json' });
      if (state.section) params.set('section', state.section);
      if (state.cursor) params.set('cursor', state.cursor);
      const data = normalizeFeedResponse(await request(`/researcher/feed?${params.toString()}`, { method: 'GET' }));
      state.items = mergeFeedItems(state.items, data.items);
      state.cursor = data.nextCursor;
      state.hasMore = data.hasMore;
      return snapshot();
    } finally {
      state.loading = false;
    }
  }

  return {
    getState: snapshot,
    loadInitial(options) { return load({ ...options, reset: true }); },
    loadMore() { return load({ reset: false }); },
  };
}

