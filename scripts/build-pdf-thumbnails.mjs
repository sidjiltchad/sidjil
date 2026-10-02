#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'docs/tchad-upload-manifest.json'), 'utf8'));
const pdfs = manifest.items.filter((item) => item.mime === 'application/pdf');
const poppler = process.env.POPPLER_PDFTOPPM || 'C:\\Users\\Lenovo\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdftoppm.exe';
const outDir = path.join(root, 'staging/tchad/pdf-thumbnails');
const concurrency = 3;

await fs.mkdir(outDir, { recursive: true });

function render(item) {
  return new Promise((resolve) => {
    const base = path.join(outDir, item.ark);
    const args = ['-f', '1', '-l', '1', '-singlefile', '-jpeg', '-scale-to', '480', item.filePath, base];
    const child = spawn(poppler, args, { windowsHide: true });
    let err = '';
    child.stderr.on('data', (data) => { err += data.toString(); });
    child.on('close', async (code) => {
      const filePath = base + '.jpg';
      if (code !== 0) return resolve({ item, error: err || `pdftoppm exited with ${code}` });
      try {
        const data = await fs.readFile(filePath);
        const sha = crypto.createHash('sha256').update(data).digest('hex');
        resolve({ item, filePath, size: data.length, sha256: sha, r2Key: `thumbnails/${item.ark}/thumb-480.jpg` });
      } catch (error) {
        resolve({ item, error: String(error) });
      }
    });
    child.on('error', (error) => resolve({ item, error: String(error) }));
  });
}

let next = 0;
let done = 0;
const results = [];
async function worker() {
  while (true) {
    const index = next++;
    if (index >= pdfs.length) return;
    const result = await render(pdfs[index]);
    results.push(result);
    done += 1;
    process.stdout.write(`thumbnail ${done}/${pdfs.length} ${result.error ? 'FAIL ' : 'ok '}${result.item.ark}\n`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const failures = results.filter((result) => result.error);
const generated = results.filter((result) => !result.error).map((result) => ({
  ark: result.item.ark,
  drive_id: result.item.drive_id,
  sourcePath: result.item.filePath,
  filePath: result.filePath,
  size: result.size,
  sha256: result.sha256,
  r2Key: result.r2Key,
  mime: 'image/jpeg',
  filename: `${result.item.ark}-cover.jpg`,
}));
await fs.writeFile(path.join(root, 'docs/pdf-thumbnail-manifest.json'), JSON.stringify(generated, null, 2), 'utf8');
await fs.writeFile(path.join(root, 'docs/pdf-thumbnail-failures.json'), JSON.stringify(failures.map((result) => ({ ark: result.item.ark, error: result.error })), null, 2), 'utf8');

const sql = generated.map((item) => {
  const esc = (value) => String(value).replaceAll("'", "''");
  return `INSERT OR IGNORE INTO files (material_id, kind, filename, mime, size, sha256, r2_key) SELECT id, 'thumbnail', '${esc(item.filename)}', 'image/jpeg', ${item.size}, '${item.sha256}', '${esc(item.r2Key)}' FROM materials WHERE ark = '${esc(item.ark)}';`;
}).join('\n');
await fs.writeFile(path.join(root, 'migrations/0025_pdf_thumbnails.sql'), `-- Generated first-page cover thumbnails for imported PDF books and documents.\n${sql}\n`, 'utf8');
console.log(JSON.stringify({ pdfs: pdfs.length, generated: generated.length, failed: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
