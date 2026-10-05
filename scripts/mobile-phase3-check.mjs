import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = await readFile(join(root, 'src', 'mobile', 'researcher-feed.js'), 'utf8');
const navigationSource = await readFile(join(root, 'src', 'mobile', 'navigation.js'), 'utf8');
const shellSource = await readFile(join(root, 'public', 'mobile', 'mobile-shell.js'), 'utf8');
const htmlSource = await readFile(join(root, 'public', 'mobile', 'index.html'), 'utf8');
const indexSource = await readFile(join(root, 'src', 'index.js'), 'utf8');
const viewsSource = await readFile(join(root, 'src', 'admin-views.js'), 'utf8');

const calls = [];
const sandbox = { console, URLSearchParams, apiFetch: async (path, options) => {
  calls.push({ path, options });
  return { items: [{ kind: 'material', id: 1, title: 'أ' }], nextCursor: 'cursor-2', hasMore: true, count: 1 };
} };
sandbox.globalThis = sandbox;
vm.runInNewContext(
  source.replace(/^import.*$/gm, '').replace(/^export /gm, '') +
  '\nthis.__feed = { createResearcherFeedClient, normalizeFeedResponse, mergeFeedItems };',
  sandbox
);
const client = sandbox.__feed.createResearcherFeedClient({ request: sandbox.apiFetch, limit: 18 });
let state = await client.loadInitial({ feed: 'latest' });
assert.equal(calls[0].path, '/researcher/feed?feed=latest&limit=18&format=json');
assert.equal(state.items.length, 1);
assert.equal(state.hasMore, true);
state = await client.loadMore();
assert.equal(calls[1].path, '/researcher/feed?feed=latest&limit=18&format=json&cursor=cursor-2');
assert.equal(state.items.length, 1);
assert.equal(sandbox.__feed.mergeFeedItems([{ id: 1, kind: 'material' }], [{ id: 1, kind: 'material' }, { id: 2, kind: 'material' }]).length, 2);

const navSandbox = { history: { pushState(_state, _title, hash) { navSandbox.location.hash = hash; } }, location: { hash: '' }, window: { addEventListener() {}, removeEventListener() {} } };
navSandbox.globalThis = navSandbox;
vm.runInNewContext(navigationSource.replace(/^export /gm, '') + '\nthis.__nav = { parseRoute, createNavigation };', navSandbox);
assert.equal(navSandbox.__nav.parseRoute('#profile/12').name, 'profile');
assert.equal(navSandbox.__nav.parseRoute('#profile/12').id, '12');
assert.equal(navSandbox.__nav.parseRoute('#unknown').name, 'feed');

assert.match(shellSource, /createResearcherFeedClient/);
assert.match(shellSource, /createNavigation/);
assert.match(htmlSource, /data-feed-list/);
assert.match(htmlSource, /data-feed-filter="discover"/);
assert.match(htmlSource, /data-load-more/);
assert.ok(indexSource.includes("pathname === '/researcher/feed'"));
assert.ok(indexSource.includes('researcherSessionJsonError'));
assert.ok(viewsSource.includes('items: pageRows.map(researcherMaterialFeedItem)'));
assert.ok(viewsSource.includes('items: page.map(x => x.item)'));
assert.ok(viewsSource.includes("if (jsonOnly) delete result.html"));

await access(join(root, 'src', 'mobile', 'navigation.js'));
await access(join(root, 'src', 'mobile', 'researcher-feed.js'));
console.log('Phase 3 feed/navigation checks passed.');

