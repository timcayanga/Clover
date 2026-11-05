import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Execute Expo's real plugin pipeline, not just a text match on app.config.ts.
// tools:node=remove is essential: SDK library manifests add permissions too.
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(execFileSync(process.execPath,
  [fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url)), 'config', '--type', 'introspect', '--json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, EXPO_NO_DOTENV: '1' } }));
const android = config._internal.modResults.android;
const manifest = android.manifest.manifest;
const permissions = manifest['uses-permission'];
const forbidden = [
  'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE_LOCATION',
  'READ_CONTACTS', 'WRITE_CONTACTS', 'MANAGE_CONTACTS', 'ACCESS_LOCAL_NETWORK',
  'MANAGE_EXTERNAL_STORAGE', 'READ_EXTERNAL_STORAGE',
  'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO',
  'READ_SMS', 'RECEIVE_SMS', 'SEND_SMS', 'READ_CALL_LOG', 'WRITE_CALL_LOG',
];
for (const name of forbidden) {
  const matching = permissions.filter(item => item.$['android:name'] === `android.permission.${name}`);
  assert(matching.length > 0, `${name} must have an explicit manifest-merge removal`);
  assert(matching.every(item => item.$['tools:node'] === 'remove'), `${name} must never be requested`);
}
assert(permissions.some(item => item.$['android:name'] === 'android.permission.ACCESS_COARSE_LOCATION' && item.$['tools:node'] !== 'remove'),
  'Optional country suggestions must retain approximate location');
assert.deepEqual(permissions.filter(item => item.$['android:name'] === 'android.permission.WRITE_EXTERNAL_STORAGE'),
  [{ $: { 'android:name': 'android.permission.WRITE_EXTERNAL_STORAGE', 'android:maxSdkVersion': '28', 'tools:replace': 'android:maxSdkVersion' } }],
  'Legacy external camera permission is unavailable on API 29+');
for (const key of ['android.enableR8.fullMode', 'android.r8.optimizedResourceShrinking',
  'android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds']) {
  assert(android.gradleProperties.some(item => item.key === key && item.value === 'true'), `${key} must survive prebuild`);
}
console.log('PASS actual Expo prebuild: coarse-only location, restricted permission removals, full R8 and optimized resource shrinking.');
