import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist-capacitor');
const mobilePublic = join(root, 'public', 'mobile');
const mobileSource = join(root, 'src', 'mobile');

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets'), { recursive: true });
await mkdir(join(output, 'fonts'), { recursive: true });
await mkdir(join(output, 'vendor'), { recursive: true });
await mkdir(join(output, 'assets', 'pdfjs', 'cmaps'), { recursive: true });
await mkdir(join(output, 'assets', 'pdfjs', 'standard_fonts'), { recursive: true });

await cp(join(mobilePublic, 'index.html'), join(output, 'index.html'));
await cp(join(mobilePublic, 'mobile-shell.css'), join(output, 'assets', 'mobile-shell.css'));
await cp(join(mobilePublic, 'mobile-shell.js'), join(output, 'assets', 'mobile-shell.js'));
await cp(join(mobileSource, 'environment.js'), join(output, 'assets', 'environment.js'));
await cp(join(mobileSource, 'api-base.js'), join(output, 'assets', 'api-base.js'));
await cp(join(mobileSource, 'api-client.js'), join(output, 'assets', 'api-client.js'));
await cp(join(mobileSource, 'auth.js'), join(output, 'assets', 'auth.js'));
await cp(join(mobileSource, 'researcher-feed.js'), join(output, 'assets', 'researcher-feed.js'));
await cp(join(mobileSource, 'navigation.js'), join(output, 'assets', 'navigation.js'));
await cp(join(mobileSource, 'researcher-search.js'), join(output, 'assets', 'researcher-search.js'));
await cp(join(mobileSource, 'researcher-profile.js'), join(output, 'assets', 'researcher-profile.js'));
await cp(join(mobileSource, 'material.js'), join(output, 'assets', 'material.js'));
await cp(join(mobileSource, 'pdf-reader.js'), join(output, 'assets', 'pdf-reader.js'));
await cp(join(mobileSource, 'docx-reader.js'), join(output, 'assets', 'docx-reader.js'));
await cp(join(mobileSource, 'native-files.js'), join(output, 'assets', 'native-files.js'));
await cp(join(mobileSource, 'native-upload.js'), join(output, 'assets', 'native-upload.js'));
await cp(join(root, 'public', 'vendor', 'pdfjs', 'pdf.min.mjs'), join(output, 'assets', 'pdfjs', 'pdf.min.mjs'));
await cp(join(root, 'public', 'vendor', 'pdfjs', 'pdf.worker.min.mjs'), join(output, 'assets', 'pdfjs', 'pdf.worker.min.mjs'));
await cp(join(root, 'public', 'vendor', 'pdfjs', 'cmaps'), join(output, 'assets', 'pdfjs', 'cmaps'), { recursive: true });
await cp(join(root, 'public', 'vendor', 'pdfjs', 'standard_fonts'), join(output, 'assets', 'pdfjs', 'standard_fonts'), { recursive: true });
await mkdir(join(output, 'assets', 'vendor', 'docx-preview'), { recursive: true });
await mkdir(join(output, 'assets', 'vendor', 'jszip'), { recursive: true });
const docxVendor = await readFile(join(root, 'public', 'vendor', 'docx-preview', 'docx-preview.min.js'), 'utf8');
await writeFile(join(output, 'assets', 'vendor', 'docx-preview', 'docx-preview.min.js'), docxVendor.replace(/\n\/\/# sourceMappingURL=.*$/s, '\n'), 'utf8');
await cp(join(root, 'public', 'vendor', 'jszip', 'jszip.min.js'), join(output, 'assets', 'vendor', 'jszip', 'jszip.min.js'));
await cp(join(root, 'public', 'sidjil-logo.png'), join(output, 'assets', 'sidjil-logo.png'));
for (const file of ['ibm-plex-sans-arabic-400.woff2', 'ibm-plex-sans-arabic-700.woff2']) {
  await cp(join(root, 'public', 'fonts', file), join(output, 'fonts', file));
}

await writeFile(join(output, 'vendor', '.keep'), 'Capacitor vendor assets will be added only when a later phase needs them.\n', 'utf8');
console.log(`Capacitor shell built at ${output}`);

