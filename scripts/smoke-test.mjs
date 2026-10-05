import assert from 'node:assert/strict';

const base = (process.env.SMOKE_BASE_URL || 'https://sidjil.org').replace(/\/$/, '');
const appBase = (process.env.SMOKE_APP_URL || 'https://app.sidjil.org').replace(/\/$/, '');

async function get(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const body = await response.text();
  return { response, body };
}

const home = await get(`${base}/`);
assert.equal(home.response.status, 200, `homepage returned ${home.response.status}`);
assert.match(home.response.headers.get('content-security-policy') || '', /default-src/);

const archive = await get(`${base}/archive?lang=ar`);
assert.equal(archive.response.status, 200, `archive returned ${archive.response.status}`);

const search = await get(`${base}/api/v1/search?q=تشاد&perPage=5`);
assert.equal(search.response.status, 200, `Arabic search returned ${search.response.status}`);
const searchJson = JSON.parse(search.body);
assert.ok(Array.isArray(searchJson.items), 'search items must be an array');
assert.equal(typeof Number(searchJson.total), 'number');

const level = await get(`${base}/api/v1/search?level=archival_book_original&perPage=5`);
assert.equal(level.response.status, 200, `level search returned ${level.response.status}`);
const levelJson = JSON.parse(level.body);
assert.ok(Array.isArray(levelJson.items), 'level search items must be an array');

const researcher = await get(`${appBase}/researcher`);
assert.ok([200, 302, 303].includes(researcher.response.status), `researcher route returned ${researcher.response.status}`);
const discussions = await get(`${appBase}/discussions`);
assert.ok([200, 302, 303, 401].includes(discussions.response.status), `discussions route returned ${discussions.response.status}`);

console.log(JSON.stringify({ base, searchTotal: searchJson.total, levelTotal: levelJson.total, researcherStatus: researcher.response.status, discussionsStatus: discussions.response.status }, null, 2));
