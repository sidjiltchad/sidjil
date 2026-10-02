#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const items = JSON.parse(await fs.readFile('docs/pdf-thumbnail-manifest.json', 'utf8'));
const bucket = 'sidjil-assets';
const concurrency = 3;

function run(item) {
  return new Promise((resolve) => {
    const args = ['r2', 'object', 'put', `${bucket}/${item.r2Key}`, '--file', item.filePath, '--content-type', item.mime];
    const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { cwd: process.cwd(), windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (data) => { out += data.toString(); });
    child.stderr.on('data', (data) => { err += data.toString(); });
    child.on('close', (code) => resolve({ item, code, out, err }));
    child.on('error', (error) => resolve({ item, code: -1, out, err: String(error) }));
  });
}

let next = 0;
let done = 0;
const failures = [];
async function worker() {
  while (true) {
    const index = next++;
    if (index >= items.length) return;
    const result = await run(items[index]);
    done += 1;
    if (result.code !== 0) failures.push({ ark: result.item.ark, error: result.err || result.out });
    process.stdout.write(`r2 thumbnail ${done}/${items.length} ${result.code === 0 ? 'ok ' : 'FAIL '}${result.item.ark}\n`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await fs.writeFile('docs/pdf-thumbnail-upload-failures.json', JSON.stringify(failures, null, 2), 'utf8');
console.log(JSON.stringify({ uploaded: items.length - failures.length, failed: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
