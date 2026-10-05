import { apiFetch } from './api-client.js';

export function normalizeResearcherId(value) {
  const id = String(value ?? '').trim();
  return /^\d+$/.test(id) && Number(id) > 0 ? id : '';
}

export function normalizeProfileResponse(data) {
  return {
    profile: data?.profile && typeof data.profile === 'object' ? data.profile : null,
    stats: data?.stats && typeof data.stats === 'object' ? data.stats : {},
    discussions: Array.isArray(data?.discussions) ? data.discussions : [],
    replies: Array.isArray(data?.replies) ? data.replies : [],
    materials: Array.isArray(data?.materials) ? data.materials : [],
  };
}

export async function getResearcherProfile(id, { request = apiFetch } = {}) {
  const safeId = normalizeResearcherId(id);
  if (!safeId) throw new TypeError('معرف الباحث غير صالح');
  const data = await request(`/researcher/profile/${safeId}?format=json`, { method: 'GET' });
  return normalizeProfileResponse(data);
}

