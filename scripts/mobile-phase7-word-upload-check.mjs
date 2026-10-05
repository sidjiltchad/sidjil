import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = file => readFile(join(root, file), 'utf8');
const docx = await read('src/mobile/docx-reader.js');
const upload = await read('src/mobile/native-upload.js');
const material = await read('src/mobile/material.js');
const shell = await read('public/mobile/mobile-shell.js');
const navigation = await read('src/mobile/navigation.js');
const build = await read('scripts/build-mobile.mjs');
const r2 = await read('src/lib/r2files.js');
const adminApi = await read('src/admin-api.js');
const index = await read('public/mobile/index.html');
const css = await read('public/mobile/mobile-shell.css');

assert.match(docx, /docx-preview\.min\.js/);
assert.match(docx, /jszip\.min\.js/);
assert.match(docx, /credentials: 'include'/);
assert.match(docx, /arrayBuffer\(\)/);
assert.match(docx, /renderAsync/);
assert.match(docx, /INVALID_DOCX/);
assert.doesNotMatch(docx, /https?:\/\/[^'"` ]+cdn/i);
assert.match(docx, /onSourceChange/);
assert.match(upload, /new XMLHttpRequest/);
assert.match(upload, /withCredentials = true/);
assert.match(upload, /X-CSRF-Token/);
assert.match(upload, /xhr\.upload/);
assert.match(upload, /abort/);
assert.match(upload, /FormData/);
assert.match(upload, /state: 'validating'/);
assert.match(upload, /state: 'uploading'/);
assert.match(upload, /finish\(resolve, parseResponse\(xhr\), 'success'\)/);
assert.match(upload, /finish\(reject, new UploadError\('أُلغي رفع الملف\.', \{ code: 'CANCELLED' \}\), 'cancelled'\)/);
assert.match(upload, /MAX_UPLOAD_BYTES = 100 \* 1024 \* 1024/);
assert.match(upload, /TOO_LARGE|413/);
assert.match(upload, /AUTH_REQUIRED|401/);
assert.match(upload, /UNSUPPORTED_MEDIA/);
assert.doesNotMatch(upload, /btoa|readAsDataURL/);
assert.match(material, /isDocxFile/);
assert.match(material, /readableOriginal/);
assert.match(shell, /createNativeUploadClient/);
assert.match(shell, /mountWordReader/);
assert.match(shell, /data-new-material-form/);
assert.match(shell, /validateUploadFile/);
assert.match(navigation, /'new'/);
assert.match(build, /docx-reader\.js/);
assert.match(build, /native-upload\.js/);
assert.match(build, /vendor.*docx-preview/);
assert.match(build, /vendor.*jszip/);
assert.match(index, /type="file"/);
assert.match(index, /\.docx/);
assert.match(css, /mobile-word-stage/);
assert.match(css, /mobile-upload-progress/);
assert.match(r2, /validateFileBytes/);
assert.match(r2, /DOCX غير صالح/);
assert.match(adminApi, /isWordFile/);

const sandbox = {
  FormData,
  setTimeout,
  clearTimeout,
  XMLHttpRequest: class {},
  resolveAppUrl: value => `https://app.sidjil.org${value}`,
  getCsrfToken: () => 'csrf-test',
  isNativeApp: () => true,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(upload.replace(/^import.*$/gm, '').replace(/^export /gm, '') + '\nthis.__upload = { validateUploadFile, createNativeUploadClient, UploadError, MAX_UPLOAD_BYTES };', sandbox);
const api = sandbox.__upload;
assert.equal(api.validateUploadFile({ name: 'تاريخ.pdf', size: 20, type: 'application/pdf' }, { kind: 'content-file' }).kind, 'content-file');
assert.equal(api.validateUploadFile({ name: 'document.docx', size: 20, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, { kind: 'content-file' }).mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
assert.equal(api.validateUploadFile({ name: 'document.zip.docx', size: 20, type: 'application/zip' }, { kind: 'content-file' }).kind, 'content-file');
assert.equal(api.validateUploadFile({ name: 'photo.jpg', size: 20, type: 'image/jpeg' }, { kind: 'content-image' }).kind, 'content-image');
assert.throws(() => api.validateUploadFile({ name: 'bad.exe', size: 20, type: 'application/octet-stream' }), e => e.code === 'UNSUPPORTED_MEDIA');
assert.throws(() => api.validateUploadFile({ name: 'empty.pdf', size: 0, type: 'application/pdf' }), e => e.code === 'EMPTY_FILE');
assert.throws(() => api.validateUploadFile({ name: 'big.pdf', size: api.MAX_UPLOAD_BYTES + 1, type: 'application/pdf' }), e => e.code === 'TOO_LARGE');
assert.throws(() => api.validateUploadFile({ name: 'fake.docx', size: 20, type: 'text/html' }), e => e.code === 'MIME_MISMATCH');
assert.throws(() => api.validateUploadFile({ name: 'cover.pdf', size: 20, type: 'application/pdf' }, { kind: 'cover' }), e => e.code === 'VALIDATION_ERROR');

class FakeUploadXhr {
  static instances = [];
  constructor() { this.upload = { addEventListener: (name, fn) => { this.upload[name] = fn; } }; this.listeners = {}; this.headers = {}; this.status = 0; FakeUploadXhr.instances.push(this); }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  send(body) { this.body = body; this.upload.progress?.({ lengthComputable: true, loaded: 5, total: 10 }); queueMicrotask(() => { this.status = 201; this.responseText = JSON.stringify({ id: 22, filename: 'document.docx' }); this.listeners.load?.(); }); }
  abort() { this.status = 0; this.listeners.abort?.(); }
}
const uploadClient = api.createNativeUploadClient({ xhrFactory: () => new FakeUploadXhr(), native: true });
const progress = [];
const uploadFile = new File([new Uint8Array(10)], 'document.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
const uploadResult = await uploadClient.uploadFile(22, uploadFile, { kind: 'content-file', onProgress: value => progress.push(value) });
assert.equal(uploadResult.id, 22);
assert.equal(uploadClient.getState(22, uploadFile, { kind: 'content-file' }).state, 'success');
const xhr = FakeUploadXhr.instances[0];
assert.equal(xhr.method, 'POST');
assert.match(xhr.url, /\/api\/v1\/admin\/materials\/22\/files$/);
assert.equal(xhr.headers['X-CSRF-Token'], 'csrf-test');
assert.ok(xhr.body instanceof FormData);
assert.ok(progress.some(value => value === .5));
assert.equal(uploadClient.running.size, 0);

for (const file of [
  'dist-capacitor/assets/docx-reader.js',
  'dist-capacitor/assets/native-upload.js',
  'dist-capacitor/assets/vendor/docx-preview/docx-preview.min.js',
  'dist-capacitor/assets/vendor/jszip/jszip.min.js',
]) await stat(join(root, file));

console.log('Phase 7 Word reader/upload checks passed.');
