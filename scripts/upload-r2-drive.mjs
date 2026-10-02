#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const manifest = JSON.parse(await fs.readFile('docs/tchad-upload-manifest.json', 'utf8'));
const bucket = 'sidjil-assets';
const concurrency = 3;

function run(item) {
  return new Promise((resolve) => {
    const args = ['r2', 'object', 'put', bucket + '/' + item.r2Key, '--file', item.filePath, '--content-type', item.mime];
    const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { cwd: process.cwd(), windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
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
    if (index >= manifest.items.length) return;
    const result = await run(manifest.items[index]);
    done++;
    if (result.code !== 0) failures.push({ drive_id: result.item.drive_id, ark: result.item.ark, error: result.err || result.out });
    process.stdout.write('r2 ' + done + '/' + manifest.items.length + (result.code === 0 ? ' ok ' : ' FAIL ') + result.item.ark + '\n');
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await fs.writeFile('docs/tchad-r2-failures.json', JSON.stringify(failures, null, 2), 'utf8');
console.log(JSON.stringify({ uploaded: manifest.items.length - failures.length, failed: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
