import { apiFetch } from './api-client.js';

export async function getNotifications({ limit = 30 } = {}) {
  const data = await apiFetch(`/api/v1/social/notifications?limit=${encodeURIComponent(limit)}`);
  return { items: Array.isArray(data?.items) ? data.items : [], unread: Number(data?.unread || 0) };
}

export function markNotificationsRead(id = null) {
  return apiFetch('/api/v1/social/notifications/read', {
    method: 'POST',
    body: id ? { id: Number(id) } : { all: true },
  });
}

export function toggleReaction(targetType, targetId, kind = 'useful') {
  return apiFetch('/api/v1/social/reaction', {
    method: 'POST',
    body: { target_type: targetType, target_id: Number(targetId), kind },
  });
}

export function getReactionStatus(targetType, targetId) {
  const query = new URLSearchParams({ target_type: targetType, target_id: String(targetId) });
  return apiFetch(`/api/v1/social/reactions?${query.toString()}`);
}

export function toggleBookmark(targetType, targetId) {
  return apiFetch('/api/v1/social/bookmark', {
    method: 'POST',
    body: { target_type: targetType, target_id: Number(targetId) },
  });
}

export function toggleFollow(userId) {
  return apiFetch('/api/v1/social/follow', {
    method: 'POST',
    body: { followed_id: Number(userId) },
  });
}

export function getFollowStatus(userId) {
  return apiFetch(`/api/v1/social/follow-status?user_id=${encodeURIComponent(userId)}`);
}

export function createDiscussion({ materialId, kind = 'comment', title, body, quoteText = '', pageNo = '' } = {}) {
  return apiFetch('/api/v1/admin/discussions', {
    method: 'POST',
    body: {
      material_id: materialId ? Number(materialId) : undefined,
      kind,
      title: String(title || '').trim(),
      body: String(body || '').trim(),
      quote_text: String(quoteText || '').trim() || undefined,
      page_no: String(pageNo || '').trim() || undefined,
    },
  });
}
