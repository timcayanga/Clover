import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { NATIVE_UPLOAD_PART_SIZE } from "../../shared/native-upload";
import { formatTransactionRecordAmount, formatTransactionRecordDate } from "../../shared/transaction-record-display";

const target = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(target.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
process.env.CLOVER_MOBILE_API_ENABLED = "true";

const require = createRequire(import.meta.url);
require("next/cache").revalidateTag = () => {};
let afterCallbacks: Array<() => Promise<unknown>> | undefined;
require("next/server").after = (callback: () => Promise<unknown>) => { afterCallbacks?.push(callback); };
globalThis.fetch = async () => { throw new Error("Display QA prohibits provider traffic"); };

type Row = {
  id: string; date: string; type: string; amount: string; currency: string;
  accountName?: string; accountLabel?: string; account?: { name: string }; accountId?: string;
};

function statementPdf(lines: string[], paddingBytes = 0, nextPages: string[][] = []) {
  const pages = [lines, ...nextPages];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((page, index) => {
      const content = " ".repeat(index === 0 ? paddingBytes : 0) +
        `BT /F1 11 Tf 50 750 Td 18 TL ${page.map(line => `(${line}) Tj T*`).join("\n")} ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      ];
    }),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  return new TextEncoder().encode(pdf + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${pdf.length}\n%%EOF\n`);
}

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  await db.cloverDeploymentEnvironment.upsert({ where: { id: "primary" }, create: { environment: "staging" }, update: {} });
  const user = await db.user.create({ data: {
    clerkUserId: `user_${randomUUID()}`, email: `${randomUUID()}@example.invalid`,
    environment: "staging", planTier: "pro", planTierLocked: true,
  } });
  const stored = new Map<string, Uint8Array>();
  const storageReads: string[] = [];
  const partsDirectory = await mkdtemp(join(tmpdir(), "clover-labeled-pdf-"));
  const mock = (name: string, exports: object) => {
    const filename = require.resolve(name);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as NodeModule;
  };
  const authorize = async (_id: string, workspaceId: string) => {
    assert(await db.workspace.findFirst({ where: { id: workspaceId, userId: user.id } }));
  };
  mock("../lib/user-environment", { ...require("../lib/user-environment"), getCurrentUserEnvironment: () => "staging" });
  mock("../lib/auth", { isLocalDevHost: async () => false, requireAuth: async () => ({ userId: user.clerkUserId }) });
  mock("../lib/workspace-access", { assertWorkspaceAccess: authorize });
  mock("../lib/s3", {
    getLocalImportObjectPath: (key: string) => join(partsDirectory, key.replaceAll("/", "_")),
    uploadObject: async (key: string, bytes: Uint8Array) => {
      if (key.startsWith("native-upload-parts/")) await writeFile(join(partsDirectory, key.replaceAll("/", "_")), bytes);
      else stored.set(key, bytes.slice());
    },
    getObject: async (key: string) => stored.get(key),
  });
  mock("../lib/import-storage.server", {
    downloadImportObject: async (key: string) => {
      storageReads.push(key);
      const bytes = stored.get(key);
      if (!bytes) throw new Error("Fixture file is unavailable");
      return bytes;
    },
  });
  mock("@clerk/nextjs/server", { verifyToken: async () => ({ sub: user.clerkUserId, sid: "sess_qa" }) });

  const info = console.info;
  const pageBatches: Array<{ stage: string; pages: number; failedPages: number; outcome: string; slowestPageMs: number; modelTokens: number }> = [];
  const readerTimings: Array<{ stage: string; durationMs: number; outcome: string }> = [];
  const { shutdownImportOcrWorkers } = await import("../lib/import-file-text.server");
  const rasterizations: unknown[][] = [];
  console.info = (...args) => {
    if (args[0] === "[import-performance] PDF rasterization requested") rasterizations.push(args);
    if (args[0] === "[pdf-page-batch]") pageBatches.push(JSON.parse(String(args[1])));
    if (args[0] === "[import-reader-timing]") readerTimings.push(JSON.parse(String(args[1])));
    info(...args);
  };
  try {
    const { readImportedPdfPageImages, readUploadedFileText, hasVerifiedPdfNativeLedger } = await import("../lib/import-file-text.server");
    const shortTextPdf = statementPdf([
      "Statement of Account", "Date Description Amount",
      "2026-10-01 Payroll +25.50", "2026-10-03 Groceries -15.25",
      "Page 1 of 1",
    ]);
    for (const name of ["short-statement.pdf", "aub-template.pdf"]) {
      const text = await readUploadedFileText(new File([Buffer.from(shortTextPdf)], name, { type: "application/pdf" }), undefined,
        { importMode: "statement", sourceBytes: shortTextPdf });
      assert(hasVerifiedPdfNativeLedger(shortTextPdf, text), name);
      assert.match(text, /2026-10-03 Groceries -15\.25/);
    }
    assert.equal(rasterizations.length, 0, "A good text ledger bypasses rasterization even on an OCR-prone template");
    const concurrentTexts = await Promise.all(Array.from({ length: 6 }, () => readUploadedFileText(
      new File([Buffer.from(shortTextPdf)], "short-statement.pdf", { type: "application/pdf" }),
      undefined, { importMode: "statement", sourceBytes: shortTextPdf.slice() },
    )));
    assert(concurrentTexts.every(text => text === concurrentTexts[0] && text.includes("Groceries")));
    assert.equal(readerTimings.filter(event => event.stage === "pdf_text_worker_cold_start").length, 1);
    assert(readerTimings.some(event => event.stage === "pdf_text_slot_wait" && event.durationMs >= 1));
    assert(readerTimings.some(event => event.stage === "pdf_text_worker_reuse"));
    const incompletePdf = statementPdf(["Statement of Account", "Date Description Amount", "Page 1 of 1"]);
    await readUploadedFileText(new File([Buffer.from(incompletePdf)], "aub-template.pdf", { type: "application/pdf" }),
      undefined, { importMode: "statement", sourceBytes: incompletePdf });
    assert(rasterizations.length > 0, "A sparse PDF still reaches rendered OCR");
    const { readImportedFileTextWithCacheInfo, recoverPdfStatementTextPages, makeImportFileBytesFingerprint,
      readPdfStatementEvidencePages, verifyPdfStatementPageCoverage } = await import("../lib/import-file-text.server");
    const { pdfPageOcrCacheVersion, pdfTextCacheVersion } = await import("../lib/pdf-extraction-cache.server");
    const { resolveImportFileExtractionCacheVersion } = await import("../lib/data-engine");
    const { hasPdfEncryptionMarker } = await import("../lib/import-pdf-encryption");
    assert(hasPdfEncryptionMarker(new TextEncoder().encode("%PDF-1.7\ntrailer << /Encr#79pt 12 0 R >>")));
    const cacheWorkspace = await db.workspace.create({ data: { userId: user.id, name: "Exact PDF cache QA" } });
    const params = {
      storageKey: "not-stored", fileName: "short-statement.pdf", fileType: "application/pdf",
      workspaceId: cacheWorkspace.id, importMode: "statement", sourceBytes: shortTextPdf,
    };
    const familyVersion = resolveImportFileExtractionCacheVersion(params.fileName);
    const fileFingerprint = makeImportFileBytesFingerprint(shortTextPdf);
    const currentVersion = pdfTextCacheVersion(params.fileName, familyVersion);
    const cacheIdentity = { workspaceId: params.workspaceId, fileType: params.fileType, importMode: params.importMode, fileFingerprint };
    await db.importFileExtractionCache.create({ data: {
      ...cacheIdentity, cacheVersion: familyVersion, extractedText: "STALE PDF TEXT",
      parsedRows: [{ amount: 99999 }],
    } });
    const fresh = await readImportedFileTextWithCacheInfo(params, undefined, undefined, { awaitFreshCacheWrite: true });
    assert.equal(fresh.cacheHit, false);
    assert.match(fresh.text, /Payroll/);
    const hit = await readImportedFileTextWithCacheInfo({ ...params, sourceBytes: shortTextPdf.slice() });
    assert.equal(hit.cacheHit, true);
    assert.equal(hit.text, fresh.text);
    const persisted = await db.importFileExtractionCache.findFirstOrThrow({ where: { ...cacheIdentity, cacheVersion: currentVersion } });
    assert.equal(persisted.extractedText, fresh.text);
    assert.equal(persisted.parsedRows, null);
    assert.notEqual(currentVersion, pdfTextCacheVersion(params.fileName, "updated-family"));
    const changed = new TextEncoder().encode(new TextDecoder().decode(shortTextPdf).replace("Payroll", "Deposit"));
    assert.equal(changed.length, shortTextPdf.length);
    const skipMiss = { skipFreshExtractionOnCacheMiss: true };
    assert.equal((await readImportedFileTextWithCacheInfo({ ...params, sourceBytes: changed }, undefined, undefined, skipMiss)).cacheHit, false);
    assert.equal((await readImportedFileTextWithCacheInfo({ ...params, fileName: "aub-template.pdf" }, undefined, undefined, skipMiss)).cacheHit, false);
    assert.equal((await readImportedFileTextWithCacheInfo({ ...params, workspaceId: undefined }, undefined, undefined, skipMiss)).cacheHit, false);
    const mixed = statementPdf([
      "Statement of Account", "Date Description Amount", "2026-10-01 Payroll +25.50",
      "2026-10-03 Groceries -15.25", "Page 1 of 2",
    ], 0, [["Page 2 of 2"]]);
    const repairWorkspace = await db.workspace.create({ data: { userId: user.id, name: "Hybrid PDF QA" } });
    assert.equal((await readImportedFileTextWithCacheInfo({ ...params, workspaceId: repairWorkspace.id },
      undefined, undefined, skipMiss)).cacheHit, false, "Exact PDF bytes cannot cross workspace boundaries");
    await db.importFileExtractionCache.create({ data: {
      ...cacheIdentity, workspaceId: repairWorkspace.id, cacheVersion: currentVersion, extractedText: persisted.extractedText,
    } });
    const durableHit = await readImportedFileTextWithCacheInfo({ ...params, workspaceId: repairWorkspace.id },
      undefined, undefined, skipMiss);
    assert.equal(durableHit.cacheHit, true, "Current-version text can be loaded from durable storage before the memory cache is warm");
    assert.equal(durableHit.text, fresh.text);
    await db.importFileExtractionCache.create({ data: {
      workspaceId: repairWorkspace.id, fileType: "application/pdf", importMode: "pdf_statement_page",
      fileFingerprint: makeImportFileBytesFingerprint(mixed), cacheVersion: "pdf-ledger-page-lossless-ocr-v1:page:2",
      extractedText: "2026-10-04 Stale -99.00\nPage 2 of 2", metadata: { imageDigest: "a".repeat(64) },
    } });
    const beforeHybrid = rasterizations.length;
    const preflight = await readImportedFileTextWithCacheInfo({
      storageKey: "not-stored", fileName: "hybrid.pdf", fileType: "application/pdf",
      workspaceId: repairWorkspace.id, importMode: "statement", sourceBytes: mixed,
    });
    assert.equal(rasterizations.length, beforeHybrid, "Mixed PDF preflight must hand off before whole-document OCR");
    const unresolvedHybrid = await recoverPdfStatementTextPages(mixed, preflight.text, undefined, undefined, undefined, repairWorkspace.id);
    assert.deepEqual(unresolvedHybrid.unresolved.map(page => page.page), [2]);
    assert.deepEqual(rasterizations.slice(beforeHybrid).map(([, args]) => (args as { targetPage: number }).targetPage), [2]);

    // Seed verified OCR evidence in the durable store as if a previous worker
    // saved it. A new source buffer exercises the same lookup used on resume.
    const repairedPage = "2026-10-04 Coffee -5.00\nPage 2 of 2";
    await db.importFileExtractionCache.create({ data: {
      workspaceId: repairWorkspace.id, fileType: "application/pdf", importMode: "pdf_statement_page",
      fileFingerprint: makeImportFileBytesFingerprint(mixed), cacheVersion: pdfPageOcrCacheVersion(2),
      extractedText: repairedPage, metadata: { imageDigest: "a".repeat(64) },
    } });
    const resumedBytes = mixed.slice();
    const beforeResume = rasterizations.length;
    const resumed = await recoverPdfStatementTextPages(resumedBytes, preflight.text, undefined, undefined, undefined, repairWorkspace.id);
    assert.deepEqual(resumed.unresolved, []);
    assert.deepEqual(resumed.recoveredPages, [2]);
    assert.equal(rasterizations.length, beforeResume, "A verified page should not rerender on resume");
    assert((await verifyPdfStatementPageCoverage(resumedBytes, resumed.text)).complete);
    assert.equal(readPdfStatementEvidencePages(resumedBytes, resumed.text).pages[1], repairedPage);
    const anotherWorkspace = await db.workspace.create({ data: { userId: user.id, name: "Independent hybrid PDF QA" } });
    const separate = await recoverPdfStatementTextPages(mixed.slice(), preflight.text, undefined, undefined, undefined, anotherWorkspace.id);
    assert.deepEqual(separate.unresolved.map(page => page.page), [2], "Page evidence is workspace scoped");
    const renderParams = { storageKey: "not-stored", fileType: params.fileType, fileName: params.fileName, sourceBytes: shortTextPdf };
    const beforeRenderCache = rasterizations.length;
    await readImportedPdfPageImages({ ...renderParams, workspaceId: cacheWorkspace.id });
    await readImportedPdfPageImages({ ...renderParams, workspaceId: cacheWorkspace.id, sourceBytes: shortTextPdf.slice() });
    assert.equal(rasterizations.length, beforeRenderCache + 1);
    await readImportedPdfPageImages({ ...renderParams, workspaceId: repairWorkspace.id });
    assert.equal(rasterizations.length, beforeRenderCache + 2);
    if (process.env.CLOVER_QA_REQUIRE_OCR === "1") {
      const recognize = () => readUploadedFileText(
        new File([Buffer.from(incompletePdf)], "aub-template.pdf", { type: "application/pdf" }),
        undefined, { importMode: "statement", sourceBytes: incompletePdf.slice() },
      );
      await Promise.all(Array.from({ length: 4 }, recognize));
      const multi = statementPdf(["Statement of Account", "Date Description Amount"], 0, [["Page 2 of 2"]]);
      await readUploadedFileText(new File([Buffer.from(multi)], "aub-template.pdf", { type: "application/pdf" }),
        undefined, { importMode: "statement", sourceBytes: multi });
      assert(pageBatches.some(batch => batch.stage === "rendered_page_ocr" && batch.pages === 2));
      const recognition = readerTimings.filter(event => event.stage === "ocr_recognition" && event.outcome === "completed");
      assert(recognition.length >= 5, "The real engine must process every fallback");
      assert(readerTimings.some(event => event.stage === "ocr_worker_reuse"), "Concurrent OCR must reuse warm workers");
      assert(readerTimings.some(event => event.stage === "ocr_slot_wait" && event.durationMs >= 1));
    }
    const { runPdfPageBatch } = await import("../lib/pdf-page-work");
    let activePages = 0;
    let peakPages = 0;
    const orderedPages = await runPdfPageBatch("synthetic_partial", [1, 2, 3, 4], async page => {
      peakPages = Math.max(peakPages, ++activePages);
      try {
        await new Promise(resolve => setTimeout(resolve, page === 1 ? 35 : 5));
        if (page === 2) throw new Error("Synthetic unreadable page");
        return page;
      } finally { activePages--; }
    });
    assert.equal(peakPages, 2);
    assert.deepEqual(orderedPages, [1, null, 3, 4]);
    const partial = pageBatches.find(batch => batch.stage === "synthetic_partial")!;
    assert.equal(partial.outcome, "partial");
    assert.equal(partial.failedPages, 1);
    assert.equal(partial.modelTokens, 0);
    assert(partial.slowestPageMs >= 30);
    const { createImportReaderCapacity } = await import("../lib/import-reader-capacity");
    const runLimited = createImportReaderCapacity(2);
    let active = 0;
    let peak = 0;
    const completed = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => runLimited(async () => {
      peak = Math.max(peak, ++active);
      try {
        await new Promise(resolve => setTimeout(resolve, 6));
        if (!index) throw new Error("Synthetic reading failure");
      } finally { active--; }
    })));
    assert.equal(peak, 2);
    assert.equal(completed.filter(result => result.status === "fulfilled").length, 11);
    const { POST: upload } = await import("../app/api/imports/[importId]/process/route");
    const { nativeUploadRequest } = await import("../lib/native-upload-store");
    const { GET: status } = await import("../app/api/imports/[importId]/status/route");
    const { IMPORT_ATTEMPT_ACTION } = await import("../lib/import-attempts");
    const { GET: preview } = await import("../app/api/imports/[importId]/preview/route");
    const { POST: keep } = await import("../app/api/transactions/review/route");
    const React = require("react") as typeof import("react");
    Object.assign(globalThis, { React });
    const { createElement } = React;
    const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
    const { ReviewWorkbench } = await import("../components/review-workbench");
    const { GET: details } = await import("../app/api/transactions/[transactionId]/route");
    const { GET: mobile } = await import("../app/api/mobile/v1/[...path]/route");

    const origin = "https://staging.clover.ph";
    const rendered: string[] = [];
    const cases = ["multipart", "resumable"].flatMap(path => [
      { currency: "PHP", accountNumber: "7000012345", path },
      { currency: "USD", accountNumber: "7000098765", path },
    ]);
    const padding = Number(process.env.CLOVER_QA_DISPLAY_PADDING_BYTES ?? "0");
    assert(Number.isInteger(padding) && padding >= 0 && padding <= 4 * 1024 * 1024);
    const runs = Number(process.env.CLOVER_QA_DISPLAY_REPEATS ?? "1");
    assert(Number.isInteger(runs) && runs >= 1 && runs <= 50);
    const repeatedCases = Array.from({ length: runs }, (_, run) => cases.map(fixture => ({ ...fixture, run }))).flat();
    for (const { currency, accountNumber, path, run } of repeatedCases) {
      const workspace = await db.workspace.create({ data: { userId: user.id, name: "Labeled display QA" } });
      const mobileGet = (path: string[], query = "") => mobile(new Request(
        `${origin}/api/mobile/v1/${path.join("/")}?workspaceId=${workspace.id}${query}`,
        { headers: { Authorization: "Bearer synthetic", Origin: origin } },
      ), { params: Promise.resolve({ path }) });
      const name = `Example Bank ${accountNumber.slice(-4)}`;
      const account = await db.account.create({ data: {
        workspaceId: workspace.id, name, institution: "Example Bank", accountNumber, type: "bank", currency, balance: 1000,
      } });
      const fileName = `example-${currency}-statement.pdf`;
      const pdf = statementPdf([
        "Example Bank", "Statement of Account", `Account Number: ${accountNumber}`, `Currency: ${currency}`,
        "Statement Period: 2026-10-01 to 2026-10-31", "Opening Balance 1000.00",
        "Date Description Amount Balance",
        `2026-10-02 Payroll ${currency} +25.50 CR 1025.50`,
        `2026-10-03 Blue Cafe ${currency} -15.25 DR 1010.25`,
        `2026-10-03 Blue Cafe ${currency} -15.25 DR 995.00`, "Closing Balance 995.00", "Page 1 of 1",
      ], padding);
      const uploadStartedAt = performance.now();
      const id = randomUUID();
      const submitNative = (action: string, json: object, headers?: Record<string, string>) => nativeUploadRequest(
        new Request(`${origin}/api/mobile/v1/uploads/${id}/${action}`, {
          method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(json),
        }), id, user.clerkUserId, workspace.id, action, async request => {
          const form = await request.formData();
          form.set("forceInlineProcessing", "true");
          return upload(new Request(request.url, { method: "POST", headers: { Origin: origin }, body: form }), { params: Promise.resolve({ importId: id }) });
        },
      );
      if (path === "resumable") {
        assert.equal((await submitNative("start", { name: fileName, mimeType: "application/pdf", size: pdf.length })).status, 200);
        for (let offset = 0, index = 0; offset < pdf.byteLength; offset += NATIVE_UPLOAD_PART_SIZE, index++) {
          const base64 = Buffer.from(pdf.subarray(offset, offset + NATIVE_UPLOAD_PART_SIZE)).toString("base64");
          const part = { index, base64 };
          const retried = index > 0 ? { "x-clover-upload-attempt": "2", "x-clover-upload-resend": "0" } : undefined;
          assert.equal((await submitNative("part", part, retried)).status, 200);
          if (index === 0 && pdf.byteLength > NATIVE_UPLOAD_PART_SIZE) {
            const restart = await submitNative("start", { name: fileName, mimeType: "application/pdf", size: pdf.length });
            assert.deepEqual((await restart.json()).parts, [0], "Durable part survives a fresh handshake");
            // Exercise backward-compatible duplicate delivery independently of
            // the client test that skips this known part after reconnection.
            assert.equal((await submitNative("part", part, {
              "x-clover-upload-attempt": "2", "x-clover-upload-resend": "1",
            })).status, 200);
          }
        }
      }
      const file = await db.importFile.create({ data: {
        id, workspaceId: workspace.id, accountId: account.id, fileName, fileType: "application/pdf", storageKey: `qa/${id}/${fileName}`,
      } });
      const form = new FormData();
      form.set("file", new File([pdf], fileName, { type: "application/pdf" }));
      form.set("workspaceId", workspace.id);
      form.set("importMode", "statement");
      form.set("forceInlineProcessing", "true");
      const renderCountBeforeUpload = rasterizations.length;
      const response = path === "resumable" ? await submitNative("complete", { importMode: "statement" })
        : await upload(new Request(`${origin}/api/imports/${file.id}/process`, {
          method: "POST", headers: { Origin: origin }, body: form,
        }), { params: Promise.resolve({ importId: file.id }) });
      assert.equal(rasterizations.length, renderCountBeforeUpload, "Clean statement upload should complete without rasterization");
      const uploadResult = await response.json();
      if (path === "resumable" && response.ok) {
        const restart = await submitNative("start", { name: fileName, mimeType: "application/pdf", size: pdf.length });
        const ready = await restart.json();
        assert.equal(ready.state, "done");
        assert.equal(ready.canonicalImportFileId, file.id);
      }
      assert(response.ok, JSON.stringify([uploadResult, await db.documentImport.findUnique({ where: { importFileId: file.id }, select: { sourceMetadata: true, rawPayload: true } })]));
      assert([...stored.values()].some(bytes => Buffer.from(bytes).equals(Buffer.from(pdf))), "Upload retained the exact labeled PDF");

      assert.equal(storageReads.length, 0, "Live multipart and native uploads must reuse their validated request bytes");
      const expected = [
        ["2026-10-02", "income", 25.5, currency],
        ["2026-10-03", "expense", 15.25, currency],
        ["2026-10-03", "expense", 15.25, currency],
      ];
      const tuples = (rows: Row[]) => rows.map(row => [row.date.slice(0, 10), row.type, Math.abs(Number(row.amount)), row.currency]).sort();
      const saved = await db.transaction.findMany({ where: { importFileId: file.id, deletedAt: null } });
      assert.equal(saved.length, 3, JSON.stringify(uploadResult));
      const checkpoint = await db.accountStatementCheckpoint.findUniqueOrThrow({ where: { importFileId: file.id } });
      const confirmedImport = await db.importFile.findUniqueOrThrow({ where: { id: file.id } });
      const confirmedAccount = await db.account.findUniqueOrThrow({ where: { id: account.id } });
      assert.equal(confirmedImport.status, "done");
      assert(confirmedImport.confirmedAt);
      assert.equal(confirmedImport.confirmedTransactionsCount, 3);
      assert.equal(checkpoint.rowCount, 3);
      assert.equal(Number(checkpoint.openingBalance), 1000);
      assert.equal(Number(checkpoint.endingBalance), 995);
      assert.equal(Number(confirmedAccount.balance), 995);
      assert(saved.every(row => row.accountId === account.id));
      assert.deepEqual(tuples(saved.map(row => ({ ...row, date: row.date.toISOString(), amount: String(row.amount) }))), expected.slice().sort());
      assert.equal(saved.filter(row => /^Blue Cafe\b/.test(row.merchantRaw ?? "")).length, 2);
      assert.equal(saved.filter(row => /^Payroll\b/.test(row.merchantRaw ?? "")).length, 1);
      console.log("PDF_QA_MILESTONE", JSON.stringify({
        id: file.id, fixture: "example-bank-one-page", run, pages: 1, pdfClass: "text_layer", pdfType: "text_layer",
        platform: "local_server", network: "in_process", transport: path, processing: "not_applicable",
        boundary: "upload_start_to_verified_statement", outcome: "reached", ms: performance.now() - uploadStartedAt,
        evidence: { pagesVerified: 1, rowsVerified: saved.length, balancesVerified: true },
      }));
      const pagesFromRequest = await readImportedPdfPageImages({
        storageKey: "not-stored", fileType: "application/pdf", fileName, sourceBytes: pdf,
      });
      assert.equal(pagesFromRequest.length, 1);
      assert.equal(storageReads.length, 0, "PDF fallback rendering must not download a source already in memory");
      const pagesFromStorage = await readImportedPdfPageImages({
        storageKey: file.storageKey!, fileType: "application/pdf", fileName,
      });
      assert.deepEqual(pagesFromStorage, pagesFromRequest, "A later attempt can render the exact stored document");
      assert.deepEqual(storageReads.splice(0), [file.storageKey]);
      const previewResult = await preview(new Request(`${origin}/api/imports/${file.id}/preview`), {
        params: Promise.resolve({ importId: file.id }),
      });
      const { parsedRows } = await previewResult.json();
      assert.deepEqual(tuples(parsedRows), expected.slice().sort(), "Web preview matches the labels");

      const review = await mobileGet(["imports", file.id, "review"]);
      const reviewPayload = await review.json();
      assert.equal(review.status, 200, JSON.stringify(reviewPayload));
      const items: Row[] = reviewPayload.items;
      assert.deepEqual(tuples(items), expected.slice().sort(), "iOS and Android preview payload matches the labels");
      assert(items.every(item => item.accountLabel?.includes(accountNumber.slice(-4))));
      assert(items.every(item => !JSON.stringify(item).includes(accountNumber)), "The native review label masks the account number");

      // Exercise an explicit review decision on the fixture and assert that
      // the labeled financial fields survive the transition to Confirmed.
      const traceRecord = await db.auditLog.findFirstOrThrow({ where: {
        workspaceId: workspace.id, entityId: file.id, action: IMPORT_ATTEMPT_ACTION,
      } });
      const trace = traceRecord.metadata as Record<string, unknown>;
      const webStatus = await status(new Request(`${origin}/api/imports/${file.id}/status?visibilityOnly=1`), {
        params: Promise.resolve({ importId: file.id }),
      });
      const webTarget = (await webStatus.json()).pdfVisibilityTarget;
      const nativeStatus = await mobileGet(["imports", file.id, "status"], "&pdfTiming=1");
      const nativeTarget = (await nativeStatus.json()).pdfVisibilityTarget;
      assert.equal(webStatus.status, 200);
      assert.equal(nativeStatus.status, 200);
      assert.deepEqual(webTarget, { attemptId: trace.attemptId, transactionId: trace.firstTransactionId });
      assert.deepEqual(nativeTarget, webTarget, "Both client routes correlate to the same committed attempt");
      assert(saved.some(row => row.id === webTarget.transactionId));
      assert.equal(trace.pdfFinalizationPath, path);
      assert.equal(trace.pdfQueueWaitMs, 0, "Forced inline does not wait in BullMQ");
      assert.equal(trace.pdfWorkerTextPath, "preflight_reused");
      assert.equal(trace.pdfWorkerTextExtractionMs, null);
      assert.equal(trace.pdfRepeatedTextRead, false);
      for (const stage of [
        "pdfFinalizationMs", "pdfByteAssemblyMs", "pdfPreflightExtractionMs",
        "pdfClaimPoolWaitMs", "pdfWorkerClaimMs", "pdfClaimRowLockMs", "pdfTransactionSaveMs",
      ]) {
        const duration = trace[stage];
        assert(typeof duration === "number" && Number.isFinite(duration) && duration >= 0, `Missing ${stage}: ${JSON.stringify(trace)}`);
      }
      assert(Number(trace.pdfByteAssemblyMs) <= Number(trace.pdfFinalizationMs));
      assert(Number(trace.pdfClaimRowLockMs) <= Number(trace.pdfWorkerClaimMs));
      console.log("PDF_TRACE", JSON.stringify({ run, currency, importId: file.id, ...trace }));
      const reviewRow = saved[0];
      await db.transaction.update({ where: { id: reviewRow.id }, data: {
        reviewStatus: "pending_review", parserConfidence: 18, reviewReasons: ["parser_low_confidence"],
      } });
      const kept = await keep(new Request(`${origin}/api/transactions/review`, {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, transactionIds: [reviewRow.id] }),
      }));
      const keptPayload = await kept.json();
      assert.equal(kept.status, 200, JSON.stringify(keptPayload));
      assert.deepEqual(keptPayload.keptIds, [reviewRow.id]);
      const afterKeep = await db.transaction.findUniqueOrThrow({ where: { id: reviewRow.id } });
      for (const field of ["date", "amount", "type", "currency", "accountId"] as const) {
        assert.deepEqual(afterKeep[field], reviewRow[field], `Keep preserves ${field}`);
      }
      for (const row of saved) {
        const mobileDetails = await mobileGet(["transactions", row.id]);
        const mobilePayload = await mobileDetails.json();
        assert.equal(mobileDetails.status, 200, JSON.stringify(mobilePayload));
        const webDetails = await details(new Request(`${origin}/api/transactions/${row.id}`), { params: Promise.resolve({ transactionId: row.id }) });
        const webPayload = await webDetails.json();
        const web: Row = webPayload.transaction;
        const native: Row = mobilePayload.transaction ?? mobilePayload;
        const markup = renderToStaticMarkup(createElement(ReviewWorkbench, {
          workspaceId: workspace.id, workspaceName: workspace.name,
          accounts: [{ id: account.id, name, currency }], categories: [],
          transactions: [{ ...row, accountName: name, amount: String(row.amount), date: row.date.toISOString(),
            categoryName: null, reviewStatus: "pending_review", rawPayload: null }],
        })).replace(/\s+/g, " ");
        rendered.push(markup);
        assert(markup.includes(`<strong>${name}</strong>`), "Web review renders the account in its facts");
        assert(markup.includes(row.type === "income" ? `+${currency} 25.50` : `−${currency} 15.25`), "Web review renders the signed amount and code");
        assert(markup.includes(formatTransactionRecordDate(row.date.toISOString(), "en-PH")), "Web review renders the labeled day");
        for (const presentation of [web, native]) {
          assert.equal(presentation.accountId, account.id);
          assert.equal(presentation.accountName ?? presentation.account?.name, name);
          assert.deepEqual(tuples([presentation]), tuples([{ ...presentation, date: row.date.toISOString(), amount: String(row.amount), type: row.type, currency: row.currency }]));
          const display = formatTransactionRecordAmount(presentation, "en-US").replace(/\s+/g, " ");
          assert.equal(display, row.type === "income" ? `+${currency} 25.50` : `−${currency} 15.25`);
          assert.equal(formatTransactionRecordDate(presentation.date, "en-US"), row.type === "income" ? "Oct 2, 2026" : "Oct 3, 2026");
        }
      }
    }
    const { prepareImportDispatch, readImportDispatch } = await import("../lib/import-dispatch");
    const { processImportFileText } = await import("../workers/import-processor");
    const dispatchWorkspace = await db.workspace.create({ data: { userId: user.id, name: "Lost dispatch QA" } });
    const dispatchAccount = await db.account.create({ data: {
      workspaceId: dispatchWorkspace.id, name: "Example Bank 2345", institution: "Example Bank",
      accountNumber: "7000012345", type: "bank", currency: "PHP", balance: 1000,
    } });
    const savedPdf = [...stored.values()].find(bytes => Buffer.from(bytes).includes(Buffer.from("7000012345")))!;
    assert(savedPdf);
    const dispatchFile = await db.importFile.create({ data: {
      workspaceId: dispatchWorkspace.id, accountId: dispatchAccount.id, fileName: "example-PHP-statement.pdf",
      fileType: "application/pdf", storageKey: "qa/lost-dispatch",
    } });
    stored.set("qa/lost-dispatch", savedPdf);
    const dispatchId = await prepareImportDispatch({
      importId: dispatchFile.id, workspaceId: dispatchWorkspace.id, actorUserId: user.clerkUserId,
      message: "Queued", importMode: "statement", allowDuplicateStatement: false,
    });
    assert(dispatchId);
    const dispatch = (await readImportDispatch(db, dispatchFile.id, dispatchWorkspace.id))!;
    const stale = new Date(Date.now() - 45_000);
    await db.auditLog.update({ where: { id: dispatch.row.id }, data: {
      metadata: { ...dispatch.data, queuedAt: stale.toISOString() },
    } });
    await db.importFile.update({ where: { id: dispatchFile.id }, data: { updatedAt: stale } });
    afterCallbacks = [];
    const poll = () => status(new Request(`${origin}/api/imports/${dispatchFile.id}/status`), {
      params: Promise.resolve({ importId: dispatchFile.id }),
    });
    assert((await Promise.all([poll(), poll()])).every(response => response.status === 200));
    const wakes = afterCallbacks;
    afterCallbacks = undefined;
    assert.equal(wakes.length, 1, "Repeated progress polls enqueue a single delayed dispatch wakeup");
    await wakes[0]();
    const trace = await db.auditLog.findMany({ where: { entityId: dispatchFile.id, action: IMPORT_ATTEMPT_ACTION } });
    assert.equal(trace.length, 1);
    assert.equal((trace[0].metadata as { dispatchSource: string }).dispatchSource, "status_recovery");
    assert.equal(await db.transaction.count({ where: { importFileId: dispatchFile.id } }), 3);
    await processImportFileText(dispatchFile.id, { dispatch: { id: dispatchId, source: "post_response" } });
    assert.equal(await db.auditLog.count({ where: { entityId: dispatchFile.id, action: IMPORT_ATTEMPT_ACTION } }), 1);
    assert.equal(await db.transaction.count({ where: { importFileId: dispatchFile.id } }), 3);
    if (process.env.CLOVER_QA_RENDERED_REVIEW) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(process.env.CLOVER_QA_RENDERED_REVIEW, rendered.join("\n"));
    }
    console.log("PASS labeled PDF upload, Keep, native review and details payloads, and rendered web review for PHP and USD.");
  } finally {
    console.info = info;
    await shutdownImportOcrWorkers();
    await rm(partsDirectory, { recursive: true, force: true });
    await db.nativeUploadSession.deleteMany({ where: { userId: user.clerkUserId } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
