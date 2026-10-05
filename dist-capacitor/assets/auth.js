import { apiFetch, getCsrfToken, setCsrfToken } from './api-client.js';

let currentUser = null;

export function isAuthenticated() {
  return Boolean(currentUser);
}

export function getCurrentUser() {
  return currentUser;
}

export async function getSession() {
  try {
    const data = await apiFetch('/api/v1/admin/session', { method: 'GET' });
    currentUser = data?.user || null;
    setCsrfToken(data?.csrfToken || '');
    return { authenticated: Boolean(currentUser), user: currentUser };
  } catch (error) {
    if (error.code === 'AUTH_REQUIRED' || error.code === 'SESSION_REDIRECT') {
      currentUser = null;
      setCsrfToken('');
      return { authenticated: false, user: null, reason: 'expired' };
    }
    throw error;
  }
}

export async function login(username, password) {
  const data = await apiFetch('/api/v1/admin/login', {
    method: 'POST',
    csrf: false,
    body: { username: String(username || '').trim(), password: String(password || '') },
  });
  setCsrfToken(data?.csrfToken || '');
  currentUser = data?.user || null;
  return { user: currentUser };
}

export async function logout() {
  if (getCsrfToken()) await apiFetch('/api/v1/admin/logout', { method: 'POST' });
  currentUser = null;
  setCsrfToken('');
}

