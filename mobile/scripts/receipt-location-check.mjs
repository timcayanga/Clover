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
const location = load('../src/receipt-location.ts', {
  '../../shared/receipt-capture-location': hints,
  '@rapideditor/country-coder': { iso1A2Code: () => 'ID' },
  'expo-location': {
    Accuracy: { Balanced: 3 },
    requestForegroundPermissionsAsync: async () => { requests++; return { granted }; },
    getCurrentPositionAsync: async () => {
      reads++; if (unavailable) throw new Error('Location unavailable');
      return { mocked, timestamp: Date.now(), coords: { latitude: -6.2, longitude: 106.82, accuracy: 200 } };
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
console.log('PASS native receipt location: explicit permission, denial, country-only result, mocked fixes and service failure.');
