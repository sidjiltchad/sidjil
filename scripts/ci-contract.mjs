import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const translation = read('src/translation.js');
const adminApi = read('src/admin-api.js');
const migration = read('migrations/0045_resumable_translation.sql');
const workflow = read('.github/workflows/ci.yml');

assert.match(translation, /heartbeat_at/);
assert.match(translation, /STALE_HEARTBEAT/);
assert.match(translation, /retry.*cancel/);
assert.match(adminApi, /content-repair\/triage/);
assert.match(adminApi, /admTranslationJobRetry/);
assert.match(migration, /ALTER TABLE translation_documents ADD COLUMN attempts/);
assert.match(workflow, /npm ci/);
assert.match(workflow, /wrangler deploy --dry-run/);

console.log('CI contract checks passed');
