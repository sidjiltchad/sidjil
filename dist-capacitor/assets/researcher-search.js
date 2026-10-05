import { apiFetch } from './api-client.js';

const DEFAULT_LIMIT = 8;

function text(value) { return value == null ? '' : String(value); }

export function normalizeSearchResponse(data, query = '') {
  const items = Array.isArray(data?.items) ? data.items.filter(Boolean) : [];
  return {
    query: text(data?.q || query),
    items,
    groups: data?.groups && typeof data.groups === 'object' ? data.groups : {},
    nextCursor: text(data?.nextCursor),
    hasMore: Boolean(data?.hasMore && data?.nextCursor),
  };
}

export function createResearcherSearchClient({ request = apiFetch, limit = DEFAULT_LIMIT } = {}) {
  const state = { query: '', items: [], groups: {}, cursor: '', hasMore: false, loading: false };
  let generation = 0;
  let activeController = null;
  const snapshot = () => ({ ...state, items: state.items.slice(), groups: { ...state.groups } });

  async function search(query) {
    const value = text(query).trim().slice(0, 120);
    generation += 1;
    const current = generation;
    activeController?.abort();
    activeController = typeof AbortController === 'undefined' ? null : new AbortController();
    state.query = value;
    state.items = [];
    state.groups = {};
    state.cursor = '';
    state.hasMore = false;
    if (value.length < 2) return snapshot();
    state.loading = true;
    try {
      const params = new URLSearchParams({ q: value, limit: String(limit), format: 'json' });
      const data = normalizeSearchResponse(await request(`/researcher/search?${params.toString()}`, { method: 'GET', signal: activeController?.signal }), value);
      if (current !== generation) return snapshot();
      state.items = data.items;
      state.groups = data.groups;
      state.cursor = data.nextCursor;
      state.hasMore = data.hasMore;
      return snapshot();
    } finally {
      if (current === generation) state.loading = false;
    }
  }

  async function loadMore() {
    if (state.loading || !state.hasMore || state.query.length < 2) return snapshot();
    state.loading = true;
    try {
      const params = new URLSearchParams({ q: state.query, limit: String(limit), format: 'json', cursor: state.cursor });
      const data = normalizeSearchResponse(await request(`/researcher/search?${params.toString()}`, { method: 'GET' }), state.query);
      const seen = new Set(state.items.map(item => `${text(item.kind)}:${text(item.id)}`));
      for (const item of data.items) {
        const key = `${text(item.kind)}:${text(item.id)}`;
        if (!seen.has(key)) { seen.add(key); state.items.push(item); }
      }
      state.groups = data.groups;
      state.cursor = data.nextCursor;
      state.hasMore = data.hasMore;
      return snapshot();
    } finally { state.loading = false; }
  }

  return { getState: snapshot, search, loadMore };
}

