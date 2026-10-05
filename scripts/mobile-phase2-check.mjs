import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist-capacitor', 'assets');
const read = (name) => readFile(join(dist, name), 'utf8');

const environmentSource = await read('environment.js');
const baseSource = await read('api-base.js');
const clientSource = await read('api-client.js');
const authSource = await read('auth.js');
const indexSource = await readFile(join(root, 'src', 'index.js'), 'utf8');
const adminApiSource = await readFile(join(root, 'src', 'admin-api.js'), 'utf8');

const envSandbox = { console };
envSandbox.globalThis = envSandbox;
vm.runInNewContext(`${environmentSource.replace(/^export /gm, '')}\nthis.__env = { getRuntime, isNativeApp };`, envSandbox);

const requests = [];
const clientSandbox = {
  console,
  URL,
  Headers,
  Response,
  FormData,
  AbortController,
  setTimeout,
  clearTimeout,
  getRuntime: envSandbox.__env.getRuntime,
  resolveAppUrl: undefined,
  fetch: async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  },
};
clientSandbox.globalThis = clientSandbox;
// The resolver function is evaluated in the same VM realm so its runtime
// lookup observes the mocked Capacitor object below.
const baseSandbox = { ...clientSandbox, getRuntime: envSandbox.__env.getRuntime };
baseSandbox.globalThis = baseSandbox;
vm.runInNewContext(`${baseSource.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')}\nthis.__base = { resolveAppUrl };`, baseSandbox);
clientSandbox.resolveAppUrl = baseSandbox.__base.resolveAppUrl;
vm.runInNewContext(`${clientSource.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')}\nthis.__client = { apiFetch, ApiError, setCsrfToken, getCsrfToken };`, clientSandbox);
const client = clientSandbox.__client;

assert.equal(clientSandbox.resolveAppUrl('/api/v1/admin/session'), '/api/v1/admin/session');
await client.apiFetch('/api/v1/admin/session');
assert.equal(requests.at(-1).options.credentials, 'same-origin');

client.setCsrfToken('csrf-test');
await client.apiFetch('/api/v1/admin/logout', { method: 'POST', body: {} });
assert.equal(requests.at(-1).options.headers.get('X-CSRF-Token'), 'csrf-test');

envSandbox.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
clientSandbox.resolveAppUrl = baseSandbox.__base.resolveAppUrl;
await client.apiFetch('/api/v1/admin/session');
assert.equal(requests.at(-1).url, 'https://app.sidjil.org/api/v1/admin/session');
assert.equal(requests.at(-1).options.credentials, 'include');

clientSandbox.fetch = async () => new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 401, headers: { 'content-type': 'application/json' } });
await assert.rejects(() => client.apiFetch('/api/v1/admin/session'), (error) => error.code === 'AUTH_REQUIRED' && error.status === 401);
clientSandbox.fetch = async () => new Response(JSON.stringify({ error: 'ممنوع' }), { status: 403, headers: { 'content-type': 'application/json' } });
await assert.rejects(() => client.apiFetch('/api/v1/admin/session'), (error) => error.code === 'FORBIDDEN' && error.status === 403);
clientSandbox.fetch = async () => new Response('<!doctype html><html><body>login</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
await assert.rejects(() => client.apiFetch('/api/v1/admin/session'), (error) => error.code === 'SESSION_REDIRECT');
clientSandbox.fetch = async () => { throw new Error('offline'); };
await assert.rejects(() => client.apiFetch('/api/v1/admin/session'), (error) => error.code === 'NETWORK_ERROR');

assert.match(authSource, /export async function getSession/);
assert.match(authSource, /export async function login/);
assert.match(authSource, /export async function logout/);
assert.match(indexSource, /CAPACITOR_ORIGINS/);
assert.match(indexSource, /Access-Control-Allow-Credentials/);
assert.match(adminApiSource, /rest === 'session'/);
assert.doesNotMatch(authSource, /localStorage|sessionStorage|password.*setItem/i);

console.log('Phase 2 API/auth compatibility checks passed.');

