import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = file => readFile(join(root, file), 'utf8');
const packageJson = JSON.parse(await read('package.json'));
const config = await read('capacitor.config.ts');
const manifest = await read('android/app/src/main/AndroidManifest.xml');
const styles = await read('android/app/src/main/res/values/styles.xml');
const colors = await read('android/app/src/main/res/values/colors.xml');
const activity = await read('android/app/src/main/java/org/sidjil/researcher/MainActivity.java');
const navigation = await read('src/mobile/navigation.js');
const ux = await read('src/mobile/native-ux.js');
const shell = await read('public/mobile/mobile-shell.js');
const css = await read('public/mobile/mobile-shell.css');
const build = await read('scripts/build-mobile.mjs');
const gitignore = await read('.gitignore');

for (const dep of ['@capacitor/app', '@capacitor/keyboard', '@capacitor/status-bar', '@capacitor/splash-screen']) {
  assert.ok(packageJson.dependencies?.[dep], `${dep} must be a runtime dependency`);
}
assert.match(config, /disableBackButtonHandler:\s*true/);
assert.match(config, /resizeOnFullScreen:\s*true/);
assert.match(config, /overlaysWebView:\s*false/);
assert.match(config, /launchAutoHide:\s*true/);
assert.match(config, /launchShowDuration:\s*500/);
assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
assert.match(manifest, /android\.permission\.INTERNET/);
assert.doesNotMatch(manifest, /MANAGE_EXTERNAL_STORAGE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
assert.doesNotMatch(manifest, /usesCleartextTraffic\s*=\s*"true"/);
assert.match(styles, /android:statusBarColor/);
assert.match(styles, /android:navigationBarColor/);
assert.match(styles, /postSplashScreenTheme/);
assert.match(colors, /sidjil_navy/);
assert.match(activity, /installSplashScreen\(this\)/);
assert.match(activity, /setKeepOnScreenCondition\(\(\) -> false\)/);
assert.match(navigation, /function canGoBack\(\)/);
assert.match(navigation, /stackDepth/);
assert.match(ux, /backButton/);
assert.match(ux, /appStateChange/);
assert.match(ux, /keyboardWillShow/);
assert.match(ux, /visualViewport/);
assert.match(ux, /setOverlaysWebView/);
assert.match(ux, /hideNativeSplash/);
assert.match(ux, /installInternalNavigationGuard/);
assert.match(shell, /nativeBack/);
assert.match(shell, /navigation\.canGoBack/);
assert.match(shell, /hideNativeSplash/);
assert.match(shell, /navigationGuardCleanup/);
assert.match(css, /env\(--?safe-area-inset|env\(safe-area-inset/);
assert.match(css, /--sidjil-viewport-height/);
assert.match(build, /native-ux\.js/);
assert.match(gitignore, /android\/local\.properties/);

for (const file of [
  'dist-capacitor/assets/native-ux.js',
  'android/app/src/main/res/values/colors.xml',
]) await stat(join(root, file));

console.log('Phase 8 Android UX contract checks passed. Device validation remains environment-dependent.');
