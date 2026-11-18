import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    assert(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const limits = load('../../shared/native-upload.ts', {});
let diskSize = 0;
const { resolveSelectedFile, fileProblem } = load('../src/upload.ts', {
  '../../shared/native-upload': limits,
  'react-native': { Platform: { OS: 'android' } },
  'expo-file-system': { File: class { get size() { return diskSize; } } },
});
const queueModule = load('../src/offline/file-queue.ts', {
  '../../../shared/import-commit-timing': load('../../shared/import-commit-timing.ts', {}),
  '../../../shared/native-upload': limits,
  '../../../shared/analytics': { telemetry() {} },
  '../../../shared/receipt-first-attempt': {},
});

const { FileQueue } = queueModule;

// Exercise the selected-file reader and the preview writer with the SDK's
// range and append contract. The native filesystem itself is stubbed here.
const sourceBytes = Buffer.concat([
  Buffer.alloc(limits.NATIVE_UPLOAD_PART_SIZE, 10),
  Buffer.alloc(limits.NATIVE_UPLOAD_PART_SIZE, 20),
  Buffer.from([30, 31, 32, 33, 34]),
]);
const reads = [], writes = [];
const { selectedUploadPartReader, withUploadCopy } = load('../src/offline/file-storage.ts', {
  'react-native': { Platform: { OS: 'android' } },
  '../../../shared/import-commit-timing': load('../../shared/import-commit-timing.ts', {}),
  '../../../shared/native-upload': limits,
  './file-queue': queueModule,
  'expo-file-system/legacy': {
    cacheDirectory: 'file:///cache/',
    EncodingType: { Base64: 'base64' },
    readAsStringAsync: async (uri, options) => {
      assert.equal(uri, 'file:///cache/large.pdf');
      assert.equal(options.encoding, 'base64');
      reads.push([options.position, options.length]);
      return sourceBytes.subarray(options.position, options.position + options.length).toString('base64');
    },
    writeAsStringAsync: async (_uri, part, options) => {
      assert.equal(options.encoding, 'base64');
      assert.equal(options.append, writes.length > 0);
      writes.push(Buffer.from(part, 'base64'));
    },
    deleteAsync: async uri => { assert.match(uri, /clover-offline-/); },
  },
});
const large = {
  id: '00000000-0000-4000-8000-000000000001',
  uri: 'file:///cache/large.pdf', name: 'large.pdf', mimeType: 'application/pdf', size: sourceBytes.length,
};
await withUploadCopy(large, selectedUploadPartReader(large), async () => {
  assert.deepEqual(Buffer.concat(writes), sourceBytes);
});
assert.deepEqual(reads, [
  [0, limits.NATIVE_UPLOAD_PART_SIZE],
  [limits.NATIVE_UPLOAD_PART_SIZE, limits.NATIVE_UPLOAD_PART_SIZE],
  [limits.NATIVE_UPLOAD_PART_SIZE * 2, 5],
]);

// Expo Android may return the original size with a compressed output URI.
// Exercise selection through encrypted-queue retention, including absent and
// over-limit source metadata, without trusting the original photo's metadata.
for (const reportedSize of [undefined, 0, 17 * 1024 * 1024, 3 * 1024 * 1024]) {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  diskSize = bytes.length;
  const selected = resolveSelectedFile({ uri: 'file:///cache/compressed.jpg', name: 'receipt.jpg', mimeType: 'image/jpeg', size: reportedSize });
  assert.equal(selected.size, bytes.length);
  assert.equal(fileProblem(selected), null);
  const values = new Map();
  const store = { keys: async prefix => [...values.keys()].filter(k => k.startsWith(prefix)), get: async k => values.get(k), set: async (k, v) => values.set(k, v) };
  const queue = new FileQueue(store, {}, async () => {});
  const file = { ...selected, id: 'receipt', workspaceId: 'personal', state: 'draft', createdAt: new Date().toISOString() };
  await queue.add(file, bytes.toString('base64'));
  assert.equal((await queue.list())[0].size, bytes.length);
  assert.equal(await queue.bytes(file), bytes.toString('base64'));
  await assert.rejects(queue.add({ ...file, id: 'truncated' }, 'AA=='), /could not be read completely/);
}
for (const [name, mimeType, limit] of [['receipt.jpg', 'image/jpeg', limits.IMPORT_PHOTO_MAX_SIZE], ['statement.pdf', 'application/pdf', limits.NATIVE_UPLOAD_MAX_SIZE]]) {
  const picked = { uri: 'file:///cache/file', name, mimeType, size: 1 };
  diskSize = limit;
  assert.equal(fileProblem(resolveSelectedFile(picked)), null);
  diskSize = limit + 1;
  assert.match(fileProblem(resolveSelectedFile(picked)), /up to (10|25) MB/);
  diskSize = 0;
  assert.match(fileProblem(resolveSelectedFile(picked)), /empty/);
}
console.log('PASS native upload: compressed camera/library bytes, absent/stale metadata, bounded reads and preview appends, queue retention, corruption and actual photo/document limits');
