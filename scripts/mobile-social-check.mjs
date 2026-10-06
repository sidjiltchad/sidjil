import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const shell = await readFile(join(root, 'public', 'mobile', 'mobile-shell.js'), 'utf8');
const html = await readFile(join(root, 'public', 'mobile', 'index.html'), 'utf8');
const css = await readFile(join(root, 'public', 'mobile', 'mobile-shell.css'), 'utf8');
const social = await readFile(join(root, 'src', 'mobile', 'social.js'), 'utf8');
const discussions = await readFile(join(root, 'src', 'mobile', 'discussions.js'), 'utf8');
const navigation = await readFile(join(root, 'src', 'mobile', 'navigation.js'), 'utf8');
const index = await readFile(join(root, 'src', 'index.js'), 'utf8');

for (const route of ['notifications', 'settings', 'discussions']) assert.match(navigation, new RegExp(`['"]${route}['"]`));
for (const marker of ['data-view="notifications"', 'data-view="settings"', 'data-view="discussions"', 'data-notification-badge', 'data-theme-choice']) assert.match(html, new RegExp(marker));
for (const marker of ['getNotifications', 'toggleReaction', 'toggleBookmark', 'createDiscussion']) assert.match(social, new RegExp(`export (?:async )?function ${marker}`));
for (const marker of ['getDiscussions', 'createReply']) assert.match(discussions, new RegExp(`export (?:async )?function ${marker}`));
for (const marker of ['data-social-action', 'loadNotifications', 'applyTheme', 'mobile-inline-composer']) assert.match(shell, new RegExp(marker));
assert.match(css, /mobile-notification/);
assert.match(css, /data-sidjil-theme="light"/);
assert.match(index, /pathname\.startsWith\('\/api\/v1\/social\/'\)/);
console.log('Mobile social/settings/notifications checks passed.');
