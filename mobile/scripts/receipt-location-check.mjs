import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, setTimeout, clearTimeout, require: name => {
    assert(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const hints = load('../../shared/receipt-capture-location.ts', {});
let granted = false, mocked = false, unavailable = false, requests = 0, reads = 0;
let timestamp = () => Date.now();
const appState = { currentState: 'active' };
const platform = { OS: 'android' };
let iosRequests = 0;
const permissionNames = [];
const location = load('../src/receipt-location.ts', {
  '../../shared/receipt-capture-location': hints,
  '@rapideditor/country-coder': { iso1A2Code: () => 'ID' },
  'react-native': {
    AppState: appState, Platform: platform,
    PermissionsAndroid: {
      PERMISSIONS: { ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION' },
      RESULTS: { GRANTED: 'granted' },
      request: async permission => { permissionNames.push(permission); requests++; return granted ? 'granted' : 'denied'; },
    },
  },
  'expo-location': {
    Accuracy: { Balanced: 3 },
    requestForegroundPermissionsAsync: async () => { iosRequests++; return { granted }; },
    getCurrentPositionAsync: async () => {
      reads++; if (unavailable) throw new Error('Location unavailable');
      return { mocked, timestamp: timestamp(), coords: { latitude: -6.2, longitude: 106.82, accuracy: 200 } };
    },
  },
});
assert.equal(requests, 0, 'Importing the scanner must never request location');
assert.equal(await location.requestReceiptLocation(), null);
assert.equal(reads, 0, 'Denied permission never reads GPS');
granted = true;
const fix = await location.requestReceiptLocation();
assert.equal(fix.countryCode, 'ID');
assert.equal(Object.keys(fix).sort().join(','), 'accuracyMeters,countryCode,locatedAt', 'Coordinates never leave the helper');
mocked = true;
assert.equal(await location.requestReceiptLocation(), null, 'Mocked Android locations are not used');
mocked = false; unavailable = true;
assert.equal(await location.requestReceiptLocation(), null, 'Disabled location services do not throw or block scanning');
unavailable = false;
assert.equal(iosRequests, 0, 'Android never invokes Expo’s broad fine+coarse request');
assert(permissionNames.every(name => name === 'android.permission.ACCESS_COARSE_LOCATION'));
appState.currentState = 'background';
const before = reads, beforeRequests = requests;
assert.equal(await location.requestReceiptLocation(), null);
assert.equal(reads, before);
assert.equal(requests, beforeRequests, 'No permission prompt from the background');
appState.currentState = 'active';
for (const value of [Date.now() - 120_000, Date.now() + 120_000, NaN]) {
  timestamp = () => value;
  assert.equal(await location.requestReceiptLocation(), null, 'Invalid or stale fixes never suggest currency');
}
timestamp = () => Date.now();
platform.OS = 'ios';
granted = false;
assert.equal(await location.requestReceiptLocation(), null);
granted = true;
assert.equal((await location.requestReceiptLocation()).countryCode, 'ID');
assert.equal(iosRequests, 2, 'iOS retains its foreground permission flow');
console.log('PASS native receipt location: coarse-only Android request, iOS permission, foreground-only, denial, country-only result, stale/mocked fixes and service failure.');
