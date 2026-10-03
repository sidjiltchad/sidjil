// SIDJIL — تسجيل الباحثين عبر Google OAuth (اختياري، يحتاج أسرار Cloudflare)
import { audit } from './db.js';
import { hashPassword, setSessionCookie } from './auth.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function randomHex(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return [...value].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cookieValue(req, name) {
  const cookies = req.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function safeNext(value) {
  const next = String(value || '/researcher').trim();
  return next.startsWith('/') && !next.startsWith('//') ? next : '/researcher';
}

function clearCookie(name) {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function redirectWithCookies(url, cookies = []) {
  // Response.redirect() exposes immutable headers in some Workers runtimes;
  // build a mutable redirect response before appending OAuth cookies.
  const response = new Response(null, { status: 302, headers: { Location: url } });
  cookies.forEach((cookie) => response.headers.append('Set-Cookie', cookie));
  return response;
}

function authError(req, code) {
  const url = new URL('/discussions', req.url);
  url.searchParams.set('auth_error', code);
  return redirectWithCookies(url.toString(), [clearCookie('sidjil_google_state'), clearCookie('sidjil_google_next')]);
}

function googleConfig(env) {
  return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET;
}

export function googleStart(req, env) {
  if (!googleConfig(env)) return authError(req, 'google_not_configured');
  const requestUrl = new URL(req.url);
  const state = randomHex(24);
  const next = safeNext(requestUrl.searchParams.get('next') || '/researcher');
  const redirectUri = new URL('/auth/google/callback', req.url).toString();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
  const stateCookie = `sidjil_google_state=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
  const nextCookie = `sidjil_google_next=${encodeURIComponent(next)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
  return redirectWithCookies(authUrl, [stateCookie, nextCookie]);
}

async function createSession(env, userId, req) {
  const token = randomHex(32);
  const csrfToken = randomHex(32);
  const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, csrf_token, user_agent, ip, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
  ).bind(token, userId, expiresAt, csrfToken, req.headers.get('User-Agent') || '', req.headers.get('CF-Connecting-IP') || '').run();
  return { token, csrfToken };
}

async function usernameForEmail(db, email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()));
  const suffix = [...new Uint8Array(digest)].slice(0, 7).map((b) => b.toString(16).padStart(2, '0')).join('');
  const base = `google_${suffix}`;
  const exists = await db.prepare('SELECT id FROM admin_users WHERE username = ?').bind(base).first();
  return exists ? `${base}_${randomHex(3)}` : base;
}

export async function googleCallback(req, env) {
  if (!googleConfig(env)) return authError(req, 'google_not_configured');
  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const expectedState = cookieValue(req, 'sidjil_google_state');
  const code = url.searchParams.get('code') || '';
  if (!state || !expectedState || state !== expectedState) return authError(req, 'google_state');
  if (url.searchParams.get('error') || !code) return authError(req, 'google_cancelled');

  const redirectUri = new URL('/auth/google/callback', req.url).toString();
  let tokenData;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) return authError(req, 'google_token');
  } catch {
    return authError(req, 'google_network');
  }

  let profile;
  try {
    const profileRes = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub || !profile.email || profile.email_verified === false) return authError(req, 'google_profile');
  } catch {
    return authError(req, 'google_network');
  }

  const db = env.DB;
  let user = await db.prepare(
    'SELECT id, username, role, is_active, google_sub, email FROM admin_users WHERE google_sub = ?'
  ).bind(profile.sub).first();
  if (!user) {
    user = await db.prepare(
      'SELECT id, username, role, is_active, google_sub, email FROM admin_users WHERE lower(email) = lower(?)'
    ).bind(profile.email).first();
    if (user) {
      await db.prepare('UPDATE admin_users SET google_sub = ?, avatar_url = COALESCE(NULLIF(avatar_url, \'\'), ?), display_name = COALESCE(NULLIF(display_name, \'\'), ?), updated_at = datetime(\'now\') WHERE id = ?')
        .bind(profile.sub, profile.picture || null, profile.name || null, user.id).run();
    }
  }
  if (!user) {
    const username = await usernameForEmail(db, profile.email);
    const passwordHash = await hashPassword(randomHex(32));
    const created = await db.prepare(
      `INSERT INTO admin_users
       (username, password_hash, role, is_active, is_verified, display_name, email, avatar_url, google_sub, updated_at)
       VALUES (?, ?, 'researcher', 1, 0, ?, ?, ?, ?, datetime('now'))`
    ).bind(username, passwordHash, profile.name || profile.email.split('@')[0], profile.email, profile.picture || null, profile.sub).run();
    user = { id: created.meta.last_row_id, username, role: 'researcher', is_active: 1 };
    await audit(db, { userId: user.id, action: 'researcher.google_register', target: profile.email, detail: 'إنشاء حساب باحث عبر Google', ip: req.headers.get('CF-Connecting-IP') || '' });
  }
  if (Number(user.is_active) === 0) return authError(req, 'account_disabled');
  const session = await createSession(env, user.id, req);
  await audit(db, { userId: user.id, action: 'admin.google_login', target: user.username, ip: req.headers.get('CF-Connecting-IP') || '' });
  const next = safeNext(cookieValue(req, 'sidjil_google_next'));
  return redirectWithCookies(new URL(next, req.url).toString(), [
    setSessionCookie(session.token, req.url),
    clearCookie('sidjil_google_state'),
    clearCookie('sidjil_google_next'),
  ]);
}
