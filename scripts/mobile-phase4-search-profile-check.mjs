import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const searchSource = await readFile(join(root, 'src', 'mobile', 'researcher-search.js'), 'utf8');
const profileSource = await readFile(join(root, 'src', 'mobile', 'researcher-profile.js'), 'utf8');
const navigationSource = await readFile(join(root, 'src', 'mobile', 'navigation.js'), 'utf8');
const shellSource = await readFile(join(root, 'public', 'mobile', 'mobile-shell.js'), 'utf8');
const htmlSource = await readFile(join(root, 'public', 'mobile', 'index.html'), 'utf8');
const indexSource = await readFile(join(root, 'src', 'index.js'), 'utf8');
const viewsSource = await readFile(join(root, 'src', 'admin-views.js'), 'utf8');

const requests = [];
const searchSandbox = { URLSearchParams, AbortController, apiFetch: async () => ({}) };
searchSandbox.globalThis = searchSandbox;
vm.runInNewContext(searchSource.replace(/^import.*$/gm, '').replace(/^export /gm, '') + '\nthis.__search = { createResearcherSearchClient, normalizeSearchResponse };', searchSandbox);
const searchClient = searchSandbox.__search.createResearcherSearchClient({
  limit: 2,
  request: async (path, options) => {
    requests.push({ path, options });
    return { q: path.includes('%D9%81') ? 'فر' : 'الع', items: [{ kind: 'researcher', id: path.includes('%D9%81') ? 2 : 1, name: 'باحث' }], nextCursor: 'next', hasMore: true };
  },
});
let state = await searchClient.search('العربية');
assert.equal(requests[0].path, '/researcher/search?q=%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9&limit=2&format=json');
assert.equal(state.items[0].id, 1);
state = await searchClient.loadMore();
assert.equal(requests[1].path, '/researcher/search?q=%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9&limit=2&format=json&cursor=next');
assert.equal(searchSandbox.__search.normalizeSearchResponse({ html: '<b>x</b>' }).items.length, 0);
assert.equal((await searchClient.search('ف')).items.length, 0);
let firstAborted = false;
const raceClient = searchSandbox.__search.createResearcherSearchClient({ request: async (path, options) => {
  if (path.includes('%D8%A7')) return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => { firstAborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }));
  return { items: [{ kind: 'researcher', id: 9, name: 'فرنسي' }], nextCursor: '', hasMore: false };
} });
const firstSearch = raceClient.search('العربية');
const secondSearch = raceClient.search('français');
await assert.rejects(firstSearch, error => error?.name === 'AbortError');
assert.equal((await secondSearch).items[0].id, 9);
assert.equal(firstAborted, true);

const profileSandbox = { apiFetch: async (path) => { assert.equal(path, '/researcher/profile/7?format=json'); return { profile: { id: 7, name: 'باحث' }, stats: { materials: 1 } }; } };
profileSandbox.globalThis = profileSandbox;
vm.runInNewContext(profileSource.replace(/^import.*$/gm, '').replace(/^export /gm, '') + '\nthis.__profile = { normalizeResearcherId, normalizeProfileResponse, getResearcherProfile };', profileSandbox);
assert.equal(profileSandbox.__profile.normalizeResearcherId('x7'), '');
assert.equal((await profileSandbox.__profile.getResearcherProfile('7')).profile.id, 7);
await assert.rejects(() => profileSandbox.__profile.getResearcherProfile('x'), error => error?.name === 'TypeError');

const navSandbox = { URL, history: { pushState(_s, _t, hash) { navSandbox.location.hash = hash; } }, location: { hash: '#feed' }, window: { addEventListener() {}, removeEventListener() {} } };
navSandbox.globalThis = navSandbox;
vm.runInNewContext(navigationSource.replace(/^export /gm, '') + '\nthis.__nav = { parseRoute, createNavigation, navigateToResearcherProfile, classifyNavigationUrl };', navSandbox);
assert.equal(navSandbox.__nav.parseRoute('#search').name, 'search');
assert.equal(navSandbox.__nav.parseRoute('#profile/12').id, '12');
const nav = navSandbox.__nav.createNavigation({ locationLike: navSandbox.location, historyLike: navSandbox.history, windowLike: navSandbox.window });
assert.equal(nav.navigate('search').name, 'search');
assert.equal(nav.navigate({ name: 'profile', id: '12' }).id, '12');
assert.equal(navSandbox.__nav.classifyNavigationUrl('javascript:alert(1)'), 'invalid');

assert.match(shellSource, /createResearcherSearchClient/);
assert.match(shellSource, /getResearcherProfile/);
assert.ok(shellSource.includes('ABORTED'));
assert.ok(shellSource.includes('setTimeout(() => runSearch'));
assert.ok(!/fetch\s*\(/.test(shellSource));
assert.ok(!shellSource.includes('innerHTML'));
assert.match(htmlSource, /data-search-form/);
assert.match(htmlSource, /data-view="search"/);
assert.ok(indexSource.includes("pathname === '/researcher/search'"));
assert.ok(indexSource.includes("pathname.startsWith('/researcher/profile/')"));
assert.ok(indexSource.includes("pathname.startsWith('/researcher/avatar'"));
assert.ok(viewsSource.includes("searchParams.get('format') === 'json'"));
assert.ok(viewsSource.includes('function researcherProfileApi'));
console.log('Phase 4 search/profile checks passed.');

