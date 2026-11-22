import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies, Decoder = TextDecoder) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, TextDecoder: Decoder, require: name => {
    assert(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const limits = load('../../shared/native-upload.ts', {});
assert(limits.isUploadPdf("Document", " Application/PDF ; version=1.7"));
assert(limits.isUploadPhoto("Photo", " Image/PNG; charset=binary"));
assert(!limits.isUploadPdf("Document", "application/pdfx"));
let diskSize = 0;
const { resolveSelectedFile, fileProblem } = load('../src/upload.ts', {
  '../../shared/native-upload': limits,
  '../../shared/import-format-policies': load('../../shared/import-format-policies.ts', {}),
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
await withUploadCopy({ ...large, name: "Document", mimeType: "application/pdf; version=1.7" }, selectedUploadPartReader(large), async uri => {
  assert.match(uri, /\.pdf$/);
  assert.deepEqual(Buffer.concat(writes), sourceBytes);
});
assert.deepEqual(reads, [
  [0, limits.NATIVE_UPLOAD_PART_SIZE],
  [limits.NATIVE_UPLOAD_PART_SIZE, limits.NATIVE_UPLOAD_PART_SIZE],
  [limits.NATIVE_UPLOAD_PART_SIZE * 2, 5],
]);

// Document providers can supply a MIME type without a filename extension.
const previewReads = [];
const table = "Bank report\nDate\tDescription\tAmount\n2026-11-19\tCafé\t-2.50";
let tableBytes = Buffer.from(table);
class MobileUtf8Decoder extends TextDecoder {
  constructor(encoding, options) {
    if (encoding !== 'utf-8') throw new RangeError('Unsupported encoding');
    super(encoding, options);
  }
}
const { previewFile } = load('../src/offline/file-preview.ts', {
  '../../../shared/import-format-policies': load('../../shared/import-format-policies.ts', {}),
  '../../../shared/native-upload': limits,
  './table-preview': load('../src/offline/table-preview.ts', {}),
  './file-storage': { withUploadCopy: async (_file, _bytes, run) => { previewReads.push('copy'); return run('local-copy'); } },
  './local-ocr-slot': { tryRunLocalOcr: run => run() },
  '../../../shared/unicode-table': load('../../shared/unicode-table.ts', {}, MobileUtf8Decoder),
  'expo-file-system': { File: class { async bytes() { return tableBytes; } } },
  '../../modules/clover-local-ai': { CloverLocalAI: { extractText: async () => ({ text: 'Total 2.50', pagesRead: 1, totalPages: 1, complete: true }) } },
});
for (const mimeType of ['application/pdf; version=1.7', 'image/jpeg']) {
  assert.match(await previewFile({ ...large, name: 'Document', mimeType }, null), /Total 2.50/);
}
assert.match(await previewFile({ ...large, name: 'Document', mimeType: 'text/tab-separated-values; charset=utf-8', size: 130 }, null), /Amount: -2.50/);
for (const be of [false, true]) {
  for (const bom of [false, true]) {
    tableBytes = Buffer.from((bom ? '\ufeff' : '') + table, 'utf16le');
    if (be) tableBytes.swap16();
    assert.match(await previewFile({ ...large, name: 'bank.tsv', size: tableBytes.length }, null), /Café/);
  }
}
tableBytes = Buffer.from([255, 254, 65]);
await assert.rejects(previewFile({ ...large, name: 'bank.csv', size: 3 }, null), /Incomplete UTF-16/);
const copies = previewReads.length;
await assert.rejects(previewFile({ ...large, name: 'large.csv' }, null), /too large/);
assert.equal(previewReads.length, copies, 'Oversized table previews must skip the temporary copy');

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

for (const mimeType of ['application/pdf', 'image/jpeg', 'text/csv', 'application/x-ofx']) {
  assert.equal(fileProblem({ name: 'download', mimeType, size: 200 }), null);
}
assert.match(fileProblem({ name: 'download', mimeType: 'application/octet-stream', size: 200 }), /supported/);

const fullRead = {text: "Example Cafe\nOfficial Receipt\n2026-11-19\nTotal PHP 180.00", complete:true, pagesRead:1, totalPages:1};
for (const [os, initial, expectedReads] of [
  ["android", fullRead, 1],
  ["android", {...fullRead, complete:false}, 2],
  ["android", {...fullRead, text:""}, 2],
  ["ios", {...fullRead, complete:false}, 2],
]) {
  let calls = 0;
  let fullReadUri;
  const reader = load('../src/offline/device-text.ts', {
    'expo-device': {totalMemory: 4 * 1024 ** 3},
    'react-native': {Platform:{OS:os}, AppState:{currentState:'active'}},
    '../../../shared/device-text-evidence': load('../../shared/device-text-evidence.ts', {}),
    '../../../shared/native-upload': limits,
    '../../modules/clover-local-ai': {CloverLocalAI:{
      extractPhotoTextFast: async () => { calls++; return initial; },
      extractText: async uri => { calls++; fullReadUri = uri; return fullRead; },
    }},
    './file-storage': {},
    './local-ocr-slot': {tryRunLocalOcr: work => work()},
  });
  const result = await reader.prepareSelectedPhoto({name:"receipt.jpg", mimeType:"image/jpeg", size:40000}, "file:///qa.jpg").full;
  assert.equal(result?.complete, true);
  assert.equal(calls, expectedReads);
  calls = 0;
  const selectedStatement = reader.prepareSelectedPhoto({name:"bank.png", mimeType:"image/png", size:40000}, "file:///bank.png", false);
  assert.equal(selectedStatement.partial, undefined);
  assert.equal((await selectedStatement.full)?.text, fullRead.text);
  assert.equal(calls, 1);
  assert.equal(fullReadUri, "file:///bank.png", "The full read uses the selected URI");
}
console.log("PASS selected photo reuses complete Android OCR and retries partial or unreadable readings");
