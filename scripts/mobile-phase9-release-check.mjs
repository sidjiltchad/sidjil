import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFile(join(root, path), 'utf8');
const failures = [];
const warnings = [];
const must = (condition, message) => condition ? null : failures.push(message);
const warn = (condition, message) => condition ? null : warnings.push(message);
const textFiles = [
  'package.json', 'capacitor.config.ts', 'wrangler.toml',
  'src/mobile/api-base.js', 'src/mobile/environment.js',
  'android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/res/xml/network_security_config.xml',
];
const contents = new Map();
for (const path of textFiles) contents.set(path, await read(path));
const packageJson = JSON.parse(contents.get('package.json'));
const cap = contents.get('capacitor.config.ts');
const manifest = contents.get('android/app/src/main/AndroidManifest.xml');
const buildGradle = contents.get('android/app/build.gradle');

must(packageJson.dependencies?.['@capacitor/android'], 'Capacitor Android dependency is missing.');
must(packageJson.scripts?.['test:mobile:release'], 'Release readiness npm script is missing.');
must(cap.includes("appId: 'org.sidjil.researcher'"), 'Capacitor appId is not org.sidjil.researcher.');
must(cap.includes("appName: 'SIDJIL — مساحة الباحث'"), 'Capacitor appName is not stable.');
must(contents.get('src/mobile/api-base.js').includes("RESEARCHER_APP_ORIGIN = 'https://app.sidjil.org'"), 'Native API origin is not production app.sidjil.org.');
must(!contents.get('src/mobile/api-base.js').match(/https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.|10\.)/i), 'Development or LAN API URL found in mobile API resolver.');
must(manifest.includes('android:usesCleartextTraffic="false"'), 'Android cleartext traffic is not disabled.');
must(manifest.includes('@xml/network_security_config'), 'Network security config is not attached to the application.');
must(!manifest.match(/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/), 'Broad external storage permission found.');
must(buildGradle.includes('versionCode 1') && buildGradle.includes('versionName "1.0.0"'), 'Release versioning is not 1.0.0 (versionCode 1).');
must(buildGradle.includes('minifyEnabled false'), 'Release minification setting is not explicit.');
must(existsSync(join(root, 'dist-capacitor/assets/pdfjs/pdf.min.mjs')), 'PDF.js runtime is missing from the release web bundle.');
must(existsSync(join(root, 'dist-capacitor/assets/pdfjs/pdf.worker.min.mjs')), 'PDF.js worker is missing from the release web bundle.');
must(existsSync(join(root, 'dist-capacitor/assets/pdfjs/standard_fonts')), 'PDF.js standard_fonts are missing from the release web bundle.');
must(existsSync(join(root, 'dist-capacitor/assets/vendor/docx-preview/docx-preview.min.js')), 'docx-preview is missing from the release web bundle.');
must(existsSync(join(root, 'dist-capacitor/assets/vendor/jszip/jszip.min.js')), 'JSZip is missing from the release web bundle.');
must(existsSync(join(root, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png')), 'Launcher icon assets are missing.');
must(existsSync(join(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml')), 'Adaptive launcher icon is missing.');
must(existsSync(join(root, 'android/app/src/main/res/drawable/splash.png')), 'Splash asset is missing.');

const forbidden = /(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|TELEGRAM_BOT_TOKEN|R2_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY)|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|ADMIN_PASSWORD_HASH\s*=|TRANSLATION_API_KEY\s*=)/i;
for (const [path, value] of contents) must(!forbidden.test(value), `Potential production secret found in ${path}.`);
const distFiles = [];
async function walk(dir) {
  const { readdir } = await import('node:fs/promises');
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path); else distFiles.push(path);
  }
}
if (existsSync(join(root, 'dist-capacitor'))) await walk(join(root, 'dist-capacitor'));
for (const path of distFiles) {
  const value = await readFile(path, 'utf8').catch(() => '');
  must(!forbidden.test(value), `Potential production secret found in ${path.replace(root, '')}.`);
  must(!/sourceMappingURL=.*\.map/i.test(value), `Source map reference found in ${path.replace(root, '')}.`);
}
const releaseArtifacts = [
  join(root, 'android/app/build/outputs/apk/release/app-release-unsigned.apk'),
  join(root, 'android/app/build/outputs/apk/release/app-release.apk'),
  join(root, 'android/app/build/outputs/bundle/release/app-release.aab'),
].filter(existsSync);
warn(releaseArtifacts.length > 0, 'Run assembleRelease and bundleRelease before declaring the RC artifacts complete.');
for (const path of releaseArtifacts) {
  const value = await readFile(path, 'latin1');
  must(!forbidden.test(value), `Potential production secret found in ${path.replace(root, '')}.`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures, warnings }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'passed', warnings }, null, 2));
