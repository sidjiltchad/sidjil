import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = join(root, 'public', 'sidjil-logo.png');
const navy = { r: 11, g: 18, b: 32, alpha: 1 };
const density = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [bucket, size] of Object.entries(density)) {
  const dir = join(root, 'android', 'app', 'src', 'main', 'res', `mipmap-${bucket}`);
  await mkdir(dir, { recursive: true });
  const legacy = await sharp(source).resize(size - 8, size - 8, { fit: 'contain', background: { ...navy, alpha: 0 } })
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: navy }).png().toBuffer();
  await writeFile(join(dir, 'ic_launcher.png'), legacy);
  await writeFile(join(dir, 'ic_launcher_round.png'), legacy);

  const foregroundSize = Math.round(size * 108 / 48);
  const foreground = await sharp(source).resize(Math.round(foregroundSize * 0.68), Math.round(foregroundSize * 0.68), { fit: 'contain', background: { ...navy, alpha: 0 } })
    .extend({ top: Math.round(foregroundSize * 0.16), bottom: Math.round(foregroundSize * 0.16), left: Math.round(foregroundSize * 0.16), right: Math.round(foregroundSize * 0.16), background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await writeFile(join(dir, 'ic_launcher_foreground.png'), foreground);
}

console.log('Generated Sidjil Android launcher icons for all densities.');
