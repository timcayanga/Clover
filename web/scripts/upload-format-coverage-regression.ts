import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as XLSX from "xlsx";
import * as importCommitTiming from "../../shared/import-commit-timing";
import * as receiptFirstAttempt from "../../shared/receipt-first-attempt";
import { PUBLIC_IMPORT_ACCEPT, PUBLIC_IMPORT_EXTENSIONS } from "@/lib/import-format-policies";
import { validateImportFile, validateImportFileBytes } from "@/lib/import-file-validation";
import { validateServerImportFile, withCompletedNativeUpload } from "@/lib/native-upload-validation";
import { readImportedFileTextWithCacheInfo, readUploadedFileText } from "@/lib/import-file-text.server";
import { parseImportText } from "@/lib/import-parser";

// Exercise the installed native file validator/queue without requiring device
// storage. All format and size decisions run from the real application source.
function loadNative(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => {
    assert(name in dependencies, `Unexpected native dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}

export async function runUploadFormatCoverageRegression() {
  const pickers = ["components/upload-source-buttons.tsx", "components/onboarding-form.tsx", "components/import-files-modal.tsx", "components/clover-shell.tsx", "app/transactions/page.tsx"];
  for (const picker of pickers) {
    assert.match(readFileSync(picker, "utf8"), /accept=\{PUBLIC_IMPORT_ACCEPT\}/, `${picker}: general file selection must include every supported import extension`);
  }
  const limits = loadNative("../shared/native-upload.ts", {});
  const native = loadNative("../mobile/src/upload.ts", {
    "../../shared/native-upload": limits,
    "../../shared/import-format-policies": loadNative("../shared/import-format-policies.ts", {}),
    "react-native": { Platform: { OS: "android" } },
    "expo-file-system": {},
  });
  const { FileQueue } = loadNative("../mobile/src/offline/file-queue.ts", {
    "../../../shared/native-upload": limits,
    "../../../shared/import-commit-timing": importCommitTiming,
    "../../../shared/receipt-first-attempt": receiptFirstAttempt,
    "../../../shared/analytics": { telemetry() {} },
  });
  for (const extension of PUBLIC_IMPORT_EXTENSIONS) {
    assert(PUBLIC_IMPORT_ACCEPT.split(",").includes(extension), `browser picker: ${extension}`);
    assert.equal(native.fileProblem({ name: `history${extension.toUpperCase()}`, size: 100, mimeType: "application/octet-stream" }), null, `native selection: ${extension}`);
    assert.equal(validateImportFile({ fileName: `history${extension}`, fileSize: 100, contentType: "" }), null);
  }
  for (const extension of [".zip", ".qdf", ".qxf", ".exe"]) {
    assert(native.fileProblem({ name: `backup${extension}`, size: 100 }));
    assert(validateImportFile({ fileName: `backup${extension}`, fileSize: 100 }));
  }

  assert(validateImportFileBytes({ fileName: "receipt", contentType: "IMAGE/JPG", bytes: Buffer.from("unreadable image") }));
  const providerFile = { name: "Activity", mimeType: "text/csv; charset=utf-8", size: 42 };
  assert.equal(native.fileProblem(providerFile), null);
  assert.equal(validateImportFile({ fileName: providerFile.name, fileSize: providerFile.size, contentType: providerFile.mimeType }), null);
  const csv = "Migration Source,Date,Description,Amount,Currency,Account,Type,Category\nspreadsheet,2026-09-13,Upload test,12.50,PHP,Upload Checking,Expense,Food";
  const ofx = "OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>PHP<BANKACCTFROM><ACCTID>1234</BANKACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260913<TRNAMT>-12.50<FITID>upload-1<NAME>Upload test</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>";
  const xmlOfx = ofx.replace("OFXHEADER:100", '<?xml version="1.0"?>\n<?OFX OFXHEADER="200"?>')
    .replace(/<(CURDEF|ACCTID|TRNTYPE|DTPOSTED|TRNAMT|FITID|NAME)>([^<]+)/g, "<$1>$2</$1>");
  const mt940 = ":20:UPLOAD\n:25:1234\n:60F:C260901PHP100,00\n:61:260913D12,50NMSCREF\n:86:Upload test\n:62F:C260913PHP87,50";
  const fixtures: Array<{ extension: string; bytes: Uint8Array; expected?: { amount: number; date: string } }> = [
    { extension: ".csv", bytes: Buffer.from(csv) },
    { extension: ".tsv", bytes: Buffer.from(csv.replaceAll(",", "\t")) },
    { extension: ".ofx", bytes: Buffer.from(ofx) },
    { extension: ".qfx", bytes: Buffer.from(ofx) },
    { extension: ".ofx", bytes: Buffer.from(xmlOfx) },
    { extension: ".ofx", bytes: Buffer.from("\ufeff" + ofx, "utf16le") },
    { extension: ".mt940", bytes: Buffer.from("\ufeff" + mt940, "utf16le").swap16() },
    { extension: ".qif", bytes: Buffer.from("!Account\nNUpload Checking\nTBank\n^\n!Type:Bank\nD2026-09-13\nT-12.50\nPUpload test\nLFood\n^") },
    { extension: ".mt940", bytes: Buffer.from(mt940) },
    { extension: ".sta", bytes: Buffer.from(mt940) },
    { extension: ".xml", bytes: Buffer.from('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>1234</IBAN></Id><Ccy>PHP</Ccy></Acct><Ntry><Amt Ccy="PHP">12.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-09-13</Dt></BookgDt><AddtlNtryInf>Upload test</AddtlNtryInf></Ntry></Stmt></BkToCstmrStmt></Document>') },
    { extension: ".json", bytes: Buffer.from(JSON.stringify({ currency: "PHP", accountName: "Upload Checking", transactions: [{ date: "2026-09-13", amount: -12.50, description: "Upload test" }] })) },
  ];
  for (const [extension, bookType] of [[".xlsx", "xlsx"], [".xls", "biff8"], [".xlsm", "xlsm"], [".xlsb", "xlsb"], [".ods", "ods"]] as const) {
    const workbook = XLSX.read(csv, { type: "string", raw: true });
    fixtures.push({ extension, bytes: XLSX.write(workbook, { type: "buffer", bookType }) });
  }
  fixtures.push({extension:'.docx',bytes:readFileSync('scripts/fixtures/reviewed-parser-corpus/grab-native-word.docx'),expected:{amount:250,date:'2026-08-14T12:00:00.000Z'}});
  const originalFetch = globalThis.fetch;
  const mimeByExtension: Record<string, string> = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".csv": "text/csv", ".tsv": "text/tab-separated-values", ".ofx": "application/x-ofx", ".qfx": "application/vnd.intu.qfx",
    ".qif": "application/qif", ".mt940": "application/x-mt940", ".sta": "text/mt940", ".xml": "application/xml", ".json": "application/json",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xls": "application/vnd.ms-excel",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12", ".xlsb": "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  };
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Structured upload tests must not call network/AI services"); };
  try {
    for (const { extension, bytes, expected } of fixtures) {
      for (const contentType of ["", "application/octet-stream", mimeByExtension[extension]]) {
        const form = new FormData();
        form.set("file", new File([bytes as BlobPart], `History${extension.toUpperCase()}`, { type: contentType }));
        // Browser/mobile-web multipart encoding must preserve the source name
        // and bytes even when the OS has no MIME association for the format.
        const request = new Request("https://clover.invalid/import", { method: "POST", body: form });
        const received = (await request.formData()).get("file") as File;
        assert.equal(validateImportFile({ fileName: received.name, fileSize: received.size, contentType: received.type }), null);
        const receivedBytes = new Uint8Array(await received.arrayBuffer());
        assert.deepEqual(receivedBytes, new Uint8Array(bytes));
        assert.equal(validateImportFileBytes({ fileName: received.name, contentType: received.type, bytes: receivedBytes }), null, extension);
        const text = await readUploadedFileText(received);
        const cachedText = await readUploadedFileText({
          name: received.name, type: received.type,
          arrayBuffer: async () => { throw new Error("Preloaded upload bytes were read twice"); },
        }, undefined, { sourceBytes: receivedBytes });
        assert.equal(cachedText, text, extension);
        if (contentType === mimeByExtension[extension] && [".csv", ".docx"].includes(extension)) {
          const document = new File([bytes as BlobPart], "Document", { type: contentType + "; charset=utf-8" });
          assert.equal(validateImportFileBytes({ fileName: document.name, contentType: document.type, bytes: receivedBytes }), null);
          assert.equal(await readUploadedFileText(document), text);
          const imported = await readImportedFileTextWithCacheInfo({
            storageKey: "local-fixture", fileName: document.name, fileType: document.type, sourceBytes: receivedBytes,
          });
          assert.equal(imported.text, text);
        }
        // A provider can preserve "csv" in the name of a converted workbook.
        const stored = await readImportedFileTextWithCacheInfo({
          storageKey: "local-fixture", fileName: "export-from-csv" + extension, fileType: received.type,
          sourceBytes: receivedBytes,
        });
        assert.equal(stored.text, text, extension);
        const rows = parseImportText(text, received.name, received.type, { currency: "PHP", accountName: "Upload Checking" });
        assert.equal(rows.length, 1, `${extension}: bytes must reach the parser`);
        assert.equal(Number(rows[0].amount), expected?.amount ?? 12.5); assert.equal(rows[0].date, expected?.date ?? "2026-09-13");
        assert.equal(rows[0].currency, "PHP"); assert.equal(rows[0].type, "expense");

        const values = new Map<string, unknown>();
        const store = { keys: async (prefix: string) => [...values.keys()].filter(k => k.startsWith(prefix)), get: async (k: string) => values.get(k), set: async (k: string, v: unknown) => values.set(k, v) };
        const queue = new FileQueue(store, {}, async () => {});
        const selected = { id: "upload", workspaceId: "qa", name: received.name, uri: "file:///cache/history", mimeType: received.type, size: received.size, state: "draft", createdAt: new Date().toISOString() };
        assert.equal(native.fileProblem(selected), null);
        const encoded = Buffer.from(receivedBytes).toString("base64");
        await queue.add(selected, encoded);
        assert.equal(await queue.bytes(selected), encoded, `${extension}: native queue must retain all bytes`);
        assert.equal(withCompletedNativeUpload(() => validateServerImportFile({ fileName: selected.name, fileSize: selected.size, contentType: selected.mimeType })), null);
      }
    }
    for (const extension of [".ofx", ".qfx", ".qif", ".mt940", ".sta", ".xml", ".json"]) {
      assert(validateImportFileBytes({ fileName: `unrelated${extension}`, bytes: Buffer.from("This is an unrelated document, not financial data.") }), `${extension}: selecting a type must not bypass content validation`);
    }
    assert.equal(networkCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
  console.log(`PASS upload format coverage: ${PUBLIC_IMPORT_EXTENSIONS.length} extensions selectable/accepted; ${fixtures.length} structured file fixtures through multipart bytes, validation, extraction, parsing and native queue; no AI/network calls`);
}
