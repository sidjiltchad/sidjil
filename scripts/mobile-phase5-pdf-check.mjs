import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const materialSource = await readFile(join(root, 'src', 'mobile', 'material.js'), 'utf8');
const navigationSource = await readFile(join(root, 'src', 'mobile', 'navigation.js'), 'utf8');
const readerSource = await readFile(join(root, 'src', 'mobile', 'pdf-reader.js'), 'utf8');
const sharedReaderSource = await readFile(join(root, 'public', 'js', 'researcher-pdf-core.js'), 'utf8');
const shellSource = await readFile(join(root, 'public', 'mobile', 'mobile-shell.js'), 'utf8');
const indexSource = await readFile(join(root, 'public', 'mobile', 'index.html'), 'utf8');
const buildSource = await readFile(join(root, 'scripts', 'build-mobile.mjs'), 'utf8');
const apiSource = await readFile(join(root, 'src', 'api.js'), 'utf8');
const indexWorkerSource = await readFile(join(root, 'src', 'index.js'), 'utf8');

const materialSandbox = { URL, apiFetch: async () => ({}), resolveAppUrl: value => `https://app.sidjil.org${value}` };
materialSandbox.globalThis = materialSandbox;
vm.runInNewContext(materialSource.replace(/^import.*$/gm, '').replace(/^export /gm, '') + '\nthis.__material = { normalizeMaterialResponse, normalizeMaterialId, safeFileUrl };', materialSandbox);
const material = materialSandbox.__material;
assert.equal(material.normalizeMaterialId('x17'), '');
assert.equal(material.normalizeMaterialId('17'), '17');
assert.equal(material.safeFileUrl('/file/12'), 'https://app.sidjil.org/file/12');
assert.equal(material.safeFileUrl('https://evil.example/file/12'), '');
const normalized = material.normalizeMaterialResponse({ id: 17, ark: 'ARC-TD-BOK-000017', title_ar: 'كتاب', files: [{ id: 20, filename: 'book.pdf', mime: 'application/pdf', kind: 'original', size: 100 }], file_translations: [{ id: 3, translation_file_id: 21, target_lang: 'ar', translation_filename: 'book-ar.pdf', translation_mime: 'application/pdf' }] }, '17');
assert.equal(normalized.original.id, 20);
assert.equal(normalized.translations[0].url, '/file/21');
assert.equal(normalized.translations[0].targetLang, 'ar');

const navSandbox = { URL, history: { pushState(_state, _title, hash) { navSandbox.location.hash = hash; } }, location: { hash: '#feed' }, window: { addEventListener() {}, removeEventListener() {} } };
navSandbox.globalThis = navSandbox;
vm.runInNewContext(navigationSource.replace(/^export /gm, '') + '\nthis.__nav = { parseRoute, createNavigation, navigateToMaterial, navigateToMaterialReader };', navSandbox);
const nav = navSandbox.__nav;
assert.equal(nav.parseRoute('#material/17').name, 'material');
assert.equal(nav.parseRoute('#material/17').id, '17');
assert.equal(nav.parseRoute('#material/17/read/translation').name, 'reader');
assert.equal(nav.parseRoute('#material/17/read/translation').source, 'translation');
const navigation = nav.createNavigation({ locationLike: navSandbox.location, historyLike: navSandbox.history, windowLike: navSandbox.window });
assert.equal(nav.navigateToMaterialReader(navigation, '17', 'translation').source, 'translation');
assert.equal(navSandbox.location.hash, '#material/17/read/translation');
assert.equal(navigation.back().name, 'feed');

const fullReaderSource = `${readerSource}\n${sharedReaderSource}`;
assert.match(fullReaderSource, /pdfjsLib\.GlobalWorkerOptions\.workerSrc/);
assert.match(fullReaderSource, /standard_fonts/);
assert.match(fullReaderSource, /cmaps/);
assert.match(fullReaderSource, /withCredentials: true/);
assert.match(fullReaderSource, /canvas(?:\.setAttribute\('dir', 'ltr'\)|\.dir\s*=\s*['"]ltr['"])/);
assert.match(fullReaderSource, /pagesObserver/);
assert.match(fullReaderSource, /data-rpdf-tab/);
assert.match(fullReaderSource, /data-rpdf-close/);
assert.match(fullReaderSource, /data-rpdf-grab/);
assert.ok(!/\bfetch\s*\(/.test(readerSource));
assert.ok(!readerSource.includes('innerHTML'));
assert.match(shellSource, /createMaterialClient/);
assert.match(shellSource, /mountPdfReader/);
assert.match(indexSource, /data-view="material"/);
assert.match(indexSource, /data-view="reader"/);
assert.match(apiSource, /materials.*details/);
assert.match(indexWorkerSource, /api\\\/v1\\\/materials.*details/);
assert.match(buildSource, /pdf\.worker\.min\.mjs/);
assert.match(buildSource, /standard_fonts/);
for (const path of ['dist-capacitor/assets/pdfjs/pdf.min.mjs', 'dist-capacitor/assets/pdfjs/pdf.worker.min.mjs', 'dist-capacitor/assets/material.js', 'dist-capacitor/assets/pdf-reader.js']) {
  const info = await stat(join(root, path));
  assert.ok(info.size > 100, `${path} was not copied`);
}
for (const path of ['dist-capacitor/assets/researcher-pdf-core.js', 'dist-capacitor/assets/rpdf-reader.css', 'dist-capacitor/vendor/pdfjs/pdf.min.mjs']) {
  const info = await stat(join(root, path));
  assert.ok(info.size > 100, `${path} was not copied`);
}
console.log('Phase 5 material/PDF reader checks passed.');
