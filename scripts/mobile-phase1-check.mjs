import { access, readFile } from 'node:fs/promises';
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
];
for (const file of required) await access(file);
const html = await readFile(join(output, 'index.html'), 'utf8');
if (!html.includes('مساحة الباحث') || !html.includes('mobile-shell.js')) throw new Error('Capacitor shell is incomplete');
const files = await Promise.all(required.map((file) => readFile(file, 'utf8')));
if (files.some((content) => /ADMIN_PASSWORD|TOKEN|SECRET|PRIVATE_KEY/i.test(content))) throw new Error('Potential secret found in Capacitor shell');
const environment = await readFile(join(output, 'assets', 'environment.js'), 'utf8');
if (!environment.includes('isNativeApp') || !environment.includes('getRuntime')) throw new Error('Runtime adapter missing');
console.log('Phase 1 mobile shell checks passed.');

