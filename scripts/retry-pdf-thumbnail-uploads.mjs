#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const manifest = JSON.parse(await fs.readFile('docs/pdf-thumbnail-manifest.json', 'utf8'));
const failures = JSON.parse(await fs.readFile('docs/pdf-thumbnail-upload-failures.json', 'utf8'));
const failedArks = new Set(failures.map((item) => item.ark));
const items = manifest.filter((item) => failedArks.has(item.ark));
const results = [];

function run(item) {
  return new Promise((resolve) => {
    const args = ['r2', 'object', 'put', `sidjil-assets/${item.r2Key}`, '--file', item.filePath, '--content-type', item.mime];
    const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { cwd: process.cwd(), windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (data) => { out += data.toString(); });
    child.stderr.on('data', (data) => { err += data.toString(); });
    child.on('close', (code) => resolve({ item, code, error: err || out }));
    child.on('error', (error) => resolve({ item, code: -1, error: String(error) }));
  });
}

for (let i = 0; i < items.length; i += 1) {
  const result = await run(items[i]);
  results.push(result);
  process.stdout.write(`retry ${i + 1}/${items.length} ${result.code === 0 ? 'ok ' : 'FAIL '}${result.item.ark}\n`);
}
const remaining = results.filter((result) => result.code !== 0).map((result) => ({ ark: result.item.ark, error: result.error }));
await fs.writeFile('docs/pdf-thumbnail-upload-failures.json', JSON.stringify(remaining, null, 2), 'utf8');
console.log(JSON.stringify({ retried: items.length, recovered: items.length - remaining.length, remaining: remaining.length }, null, 2));
if (remaining.length) process.exitCode = 1;
