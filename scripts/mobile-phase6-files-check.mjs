import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = await readFile(join(root, 'src', 'mobile', 'native-files.js'), 'utf8');
const materialSource = await readFile(join(root, 'src', 'mobile', 'material.js'), 'utf8');
const shellSource = await readFile(join(root, 'public', 'mobile', 'mobile-shell.js'), 'utf8');
const readerSource = await readFile(join(root, 'src', 'mobile', 'pdf-reader.js'), 'utf8');
const buildSource = await readFile(join(root, 'scripts', 'build-mobile.mjs'), 'utf8');
const manifest = await readFile(join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
const filePaths = await readFile(join(root, 'android', 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml'), 'utf8');

const sandbox = {
  resolveAppUrl: value => `https://app.sidjil.org${value}`,
  isNativeApp: () => false,
  btoa,
  document: { createElement: () => ({ click() {}, set href(value) { this._href = value; }, set download(value) { this._download = value; } }) },
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source.replace(/^import.*$/gm, '').replace(/^export /gm, '') + '\nthis.__files = { trustedFileUrl, sanitizeFilename, buildFilename, validateFileResponse, createNativeFilesClient, NativeFileError };', sandbox);
const files = sandbox.__files;
assert.equal(files.trustedFileUrl('/file/17'), 'https://app.sidjil.org/file/17');
assert.equal(files.trustedFileUrl('https://app.sidjil.org/file/17?download=1'), 'https://app.sidjil.org/file/17');
assert.equal(files.trustedFileUrl('https://evil.example/file/17'), '');
assert.equal(files.trustedFileUrl('javascript:alert(1)'), '');
assert.equal(files.trustedFileUrl('data:application/pdf;base64,xxx'), '');
assert.equal(files.sanitizeFilename('../تاريخ/وداي:*?.pdf'), 'تاريخ-وداي-.pdf');
assert.match(files.buildFilename({ id: 17, filename: 'book.pdf', mime: 'application/pdf' }, { title: 'تاريخ وداي', variant: 'original' }), /^تاريخ وداي-original\.pdf$/);
assert.match(files.buildFilename({ translationFileId: 18, filename: 'livre.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', targetLang: 'fr' }, { title: 'كتاب', variant: 'translation' }), /^كتاب-fr-translation\.docx$/);
const headers = value => ({ get: key => key.toLowerCase() === 'content-type' ? value : null });
assert.equal(files.validateFileResponse({ status: 200, ok: true, headers: headers('application/pdf') }), true);
assert.throws(() => files.validateFileResponse({ status: 200, ok: true, headers: headers('image/jpeg') }, { mime: 'application/pdf' }), error => error.code === 'MIME_MISMATCH');
assert.throws(() => files.validateFileResponse({ status: 200, ok: true, headers: headers('text/html') }), error => error.code === 'INVALID_CONTENT');
assert.throws(() => files.validateFileResponse({ status: 401, ok: false, headers: headers('application/json') }), error => error.code === 'AUTH_REQUIRED');
assert.throws(() => files.validateFileResponse({ status: 403, ok: false, headers: headers('application/json') }), error => error.code === 'FORBIDDEN');
assert.throws(() => files.validateFileResponse({ status: 404, ok: false, headers: headers('application/json') }), error => error.code === 'NOT_FOUND');
assert.throws(() => files.validateFileResponse({ status: 503, ok: false, headers: headers('application/json') }), error => error.code === 'SERVER_ERROR');
const web = files.createNativeFilesClient();
const webResult = await web.downloadFile({ id: 17, url: '/file/17', filename: 'a.pdf', mime: 'application/pdf' }, { title: 'كتاب' });
assert.equal(webResult.native, false);
assert.ok(source.includes("credentials: 'include'"));
assert.ok(source.includes('.part'));
assert.ok(source.includes('DIRECTORY_DATA'));
assert.ok(source.includes('DIRECTORY_CACHE'));
assert.ok(source.includes('running = new Map'));
assert.ok(source.includes('Share'));
assert.match(source, /فتح باستخدام تطبيق مناسب/);
assert.ok(!source.includes('MANAGE_EXTERNAL_STORAGE'));
assert.ok(!source.includes('READ_EXTERNAL_STORAGE'));
assert.ok(!source.includes('WRITE_EXTERNAL_STORAGE'));
assert.ok(!source.includes('file://'));
assert.match(materialSource, /translationFileId/);
assert.match(shellSource, /createNativeFilesClient/);
assert.match(shellSource, /downloadFile/);
assert.match(shellSource, /shareFile/);
assert.match(shellSource, /openFile/);
assert.match(readerSource, /fileActions/);
const sharedReaderSource = await readFile(join(root, 'public', 'js', 'researcher-pdf-core.js'), 'utf8');
assert.match(sharedReaderSource, /downloadFile/);
assert.match(sharedReaderSource, /تحميل الأصل/);
assert.match(buildSource, /native-files\.js/);
assert.match(manifest, /android\.permission\.INTERNET/);
assert.doesNotMatch(manifest, /MANAGE_EXTERNAL_STORAGE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
assert.match(filePaths, /files-path/);
assert.match(filePaths, /cache-path/);
assert.doesNotMatch(filePaths, /external-path/);
console.log('Phase 6 native file checks passed.');
