import { access, readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, 'dist-capacitor');
const required = [
  join(output, 'index.html'),
  join(output, 'assets', 'mobile-shell.css'),
  join(output, 'assets', 'mobile-shell.js'),
  join(output, 'assets', 'environment.js'),
  join(output, 'assets', 'api-base.js'),
  join(output, 'assets', 'api-client.js'),
  join(output, 'assets', 'auth.js'),
];
for (const file of required) await access(file);
const html = await readFile(join(output, 'index.html'), 'utf8');
if (!html.includes('مساحة الباحث') || !html.includes('mobile-shell.js')) throw new Error('Capacitor shell is incomplete');
const shellCss = await readFile(join(output, 'assets', 'mobile-shell.css'), 'utf8');
if (!shellCss.includes('grid-template-rows: auto minmax(0, 1fr) auto')
  || !shellCss.includes('touch-action: pan-y')
  || !shellCss.includes('-webkit-overflow-scrolling: touch')) {
  throw new Error('Mobile shell scroll contract is incomplete');
}
const files = await Promise.all(required.map((file) => readFile(file, 'utf8')));
if (files.some((content) => /ADMIN_PASSWORD_HASH|TRANSLATION_SERVICE_URL\s*=|-----BEGIN|sk-[A-Za-z0-9]/i.test(content))) throw new Error('Potential secret found in Capacitor shell');
const environment = await readFile(join(output, 'assets', 'environment.js'), 'utf8');
if (!environment.includes('isNativeApp') || !environment.includes('getRuntime')) throw new Error('Runtime adapter missing');

// Exercise the resolver in both supported delivery modes without loading a
// browser-only module into Node.
const envSandbox = { console };
envSandbox.globalThis = envSandbox;
vm.runInNewContext(`${environment.replace(/^export /gm, '')}\nthis.__env = { isNativeApp, getRuntime };`, envSandbox);
const apiSource = await readFile(join(output, 'assets', 'api-base.js'), 'utf8');
const apiSandbox = { console, URL, getRuntime: envSandbox.__env.getRuntime };
apiSandbox.globalThis = apiSandbox;
vm.runInNewContext(`${apiSource.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')}\nthis.__api = { resolveAppUrl };`, apiSandbox);
if (apiSandbox.__api.resolveAppUrl('/api/v1/search') !== '/api/v1/search') throw new Error('Web API resolver returned an unexpected URL');
envSandbox.Capacitor = { isNativePlatform: () => true };
if (apiSandbox.__api.resolveAppUrl('/api/v1/search') !== 'https://app.sidjil.org/api/v1/search') throw new Error('Native API resolver returned an unexpected URL');
console.log('Phase 1 mobile shell checks passed.');

