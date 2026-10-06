import { apiFetch } from './api-client.js';

export async function getDiscussions({ materialId = '', kind = '', cursor = '', perPage = 20 } = {}) {
  const query = new URLSearchParams({ perPage: String(perPage) });
  if (materialId) query.set('material_id', String(materialId));
  if (kind) query.set('kind', String(kind));
  if (cursor) query.set('cursor', String(cursor));
  const data = await apiFetch(`/api/v1/discussions?${query.toString()}`);
  return { items: Array.isArray(data?.items) ? data.items : [], nextCursor: String(data?.nextCursor || ''), hasMore: Boolean(data?.hasMore && data?.nextCursor) };
}

export function getDiscussion(id) { return apiFetch(`/api/v1/discussions/${encodeURIComponent(id)}`); }

export function createReply(discussionId, body) {
  return apiFetch(`/api/v1/admin/discussions/${encodeURIComponent(discussionId)}/replies`, { method: 'POST', body: { body: String(body || '').trim() } });
}
