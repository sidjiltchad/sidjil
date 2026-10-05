import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const translation = read('src/manual-translations.js');
const adminApi = read('src/admin-api.js');
const migration = read('migrations/0047_manual_file_translations.sql');
const workflow = read('.github/workflows/ci.yml');

assert.match(translation, /translationUpload/);
assert.match(translation, /file_translations/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS file_translations/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS translation_requests/);
assert.match(adminApi, /content-repair\/triage/);
assert.match(adminApi, /translations\/overview/);
assert.match(workflow, /npm ci/);
assert.match(workflow, /wrangler deploy --dry-run/);

console.log('CI contract checks passed');
