// Explicit staging/isolated-loopback integration test. Never run against production or in prepush.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { prisma } from "../lib/prisma";
import { creditFailedImportUsage, getCloverTokenUsage, mayUseImportCloudAi } from "../lib/clover-token-usage";
import { parseImportTextWithOpenAIFallback } from "../lib/openai-import-parser";
import { reserveLocalAllowance, DEVICE_LOCAL_COMPATIBILITY_TOKENS } from "../lib/mobile-local-allowance";
import { setImportUserControl } from "../lib/import-user-control";
import { loadReceiptDraft, saveReceiptDraft } from "../lib/receipt-draft";
import { normalizeDeviceTextEvidence } from "../../shared/device-text-evidence";
import { AI_CONSENT_VERSION } from "../../shared/ai-consent";

assert.ok(process.argv.includes("--execute"), "Pass --execute for disposable staging fixtures");
const local = process.argv.includes("--local");
if (local) {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.port, "55439");
  assert.equal(database.pathname, "/clover_receipt_qa");
} else {
  assert.equal(process.env.CLOVER_DEPLOYMENT_ENVIRONMENT, "staging");
  assert.equal(process.env.VERCEL_ENV, "preview");
}
assert.equal(process.env.NODE_ENV, "production", "Exercise actual Free cloud limits");
const option = (name: string) => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const output = option("--output");
const imagePath = option("--image");
const deviceTextPath = option("--device-text");
assert.equal(Boolean(imagePath), Boolean(deviceTextPath), "Supply both original image and independently obtained OCR evidence");
const expectedTotal = Number(option("--expected-total") ?? 120);
const expectedDate = option("--expected-date");
let ownerId: string | undefined;
let cloudRequests = 0;
const originalFetch = globalThis.fetch;
// CLI integration has no Next request store; only stub cache invalidation.
const nextCache = createRequire(import.meta.url)("next/cache");
const originalRevalidateTag = nextCache.revalidateTag;
nextCache.revalidateTag = () => {};

async function main() {
  const deployment = await prisma.cloverDeploymentEnvironment.findUnique({ where: { id: "primary" } });
  assert.equal(deployment?.environment, "staging", "Database marker must be staging before any writes");
  const tag = `receipt-quota-qa-${randomUUID()}`;
  const user = await prisma.user.create({ data: {
    clerkUserId: tag, email: `${tag}@example.invalid`, environment: "staging", planTier: "free",
    regionalPreferences: { baseCurrency: "PHP" },
    appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } },
  } });
  ownerId = user.id;
  const workspace = await prisma.workspace.create({ data: { userId: user.id, name: tag } });
  const failed = await prisma.importFile.create({ data: {
    workspaceId: workspace.id, fileName: "prior-failed-qa-receipt.jpg", fileType: "image/jpeg", storageKey: "",
    status: "failed", processingPhase: "receipt_review_required", parsedRowsCount: 3,
  } });
  const originalCall = await prisma.auditLog.create({ data: {
    workspaceId: workspace.id, actorUserId: user.id, action: "import.openai_model_call", entity: "ImportFile", entityId: failed.id,
    metadata: { model: "gpt-5.5", inputTokens: 9424, outputTokens: 1205, totalTokens: 10629 },
  } });
  const first = await getCloverTokenUsage(user);
  assert.equal(first.totalTokens, 0);
  assert.equal(first.monthly.remaining, 100000);
  assert.equal(first.rolling24h.remaining, 30000);
  await Promise.all([creditFailedImportUsage(failed.id), getCloverTokenUsage(user), creditFailedImportUsage(failed.id)]);
  const credits = await prisma.auditLog.findMany({ where: { workspaceId: workspace.id, action: "import.ai_usage_credit" } });
  assert.equal(credits.length, 1, "Concurrent reconcilers create one credit");
  assert.ok(await prisma.auditLog.findUnique({ where: { id: originalCall.id } }), "Original provider usage is preserved");
  let simulatedFailureRequests = 0;
  const usageWrites: Promise<unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("https://api.openai.com/")) return originalFetch(input, init);
    simulatedFailureRequests += 1;
    return Response.json({ output_text: "invalid structured extraction", usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } });
  };
  const invalidResult = await parseImportTextWithOpenAIFallback({
    consentUserId: user.id, text: "Coffee QA\nSALES INVOICE\n2026-10-04\nTOTAL 120.00", fileName: "receipt.jpg", fileType: "image/jpeg",
    importMode: "receipt", detectedMetadata: null, parsedRows: [], preferPrimary: true,
    onUsage: usage => {
      assert.equal(usage.allowanceChargeable, false, "Invalid model output is credited before it reaches the usage meter");
      usageWrites.push(prisma.auditLog.create({ data: { workspaceId: workspace.id, actorUserId: user.id,
        action: "import.openai_model_call", entity: "ImportFile", entityId: failed.id, metadata: usage } }));
    },
  });
  assert.equal(invalidResult?.audit.schemaValidated, false);
  assert.equal(simulatedFailureRequests, 1);
  await Promise.all(usageWrites);
  assert.equal((await getCloverTokenUsage(user)).totalTokens, 0, "Provider-reported failed extraction usage is refunded");
  await prisma.auditLog.create({ data: {
    workspaceId: workspace.id, actorUserId: user.id, action: "adviser.model_call", entity: "User", entityId: user.id,
    metadata: { model: "qa-fixture", totalTokens: 100000 },
  } });
  const exhausted = await getCloverTokenUsage(user);
  assert.ok(exhausted.monthly.exhausted && exhausted.rolling24h.exhausted);
  assert.equal(await mayUseImportCloudAi(user.id), false);
  const deviceGrant = await reserveLocalAllowance(user.id, { deviceId: randomUUID(), unit: "tokens" });
  assert.equal(deviceGrant.scope, "device_only");
  assert.equal(deviceGrant.grant.issued, DEVICE_LOCAL_COMPATIBILITY_TOKENS, "Installed device clients retain local access when cloud is exhausted");
  assert.equal((await getCloverTokenUsage(user)).totalTokens, 100000, "Device compatibility grants add no cloud usage");
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.openai.com/")) {
      cloudRequests += 1;
      throw new Error("QA: exhausted Free plan must never reach OpenAI");
    }
    return originalFetch(input, init);
  };
  // A synthetic image plus independently supplied OCR evidence exercises the
  // same worker handoff as Vision/ML Kit. It does not benchmark camera OCR.
  const realEvidence = deviceTextPath ? normalizeDeviceTextEvidence(JSON.parse(readFileSync(deviceTextPath, "utf8"))) : null;
  if (deviceTextPath) assert.ok(realEvidence, "Invalid device OCR evidence envelope");
  const text = realEvidence?.text ?? [
    "Harbour Coffee QA", "SALES INVOICE", "October 04, 2026 10:05 AM",
    "Espresso 120.00", "SUBTOTAL 120.00", "VATABLE SALES 107.14", "VAT 12.86",
    "TOTAL 120.00", "CARD 120.00", "Thank you!",
  ].join("\n");
  const bytes = imagePath ? readFileSync(imagePath) : await sharp(Buffer.from(`<svg width="700" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="700" height="900" fill="white"/><text x="25" y="50" font-size="22">${text.replaceAll("\n", " ")}</text></svg>`)).png().toBuffer();
  const file = await prisma.importFile.create({ data: {
    workspaceId: workspace.id, fileName: imagePath ? "receipt.jpg" : "receipt.png", fileType: imagePath ? "image/jpeg" : "image/png", storageKey: `qa/${tag}/receipt`, status: "processing",
  } });
  const { processImportFileText } = await import("../workers/import-processor");
  const started = performance.now();
  const result = await processImportFileText(file.id, {
    actorUserId: user.id, importMode: "statement", sourceBytes: bytes,
    deviceText: realEvidence ?? { version: 1, source: "apple_vision", text, pagesRead: 1, totalPages: 1, complete: true, durationMs: 280 },
  });
  const workerMs = Math.round(performance.now() - started);
  const [receipt, transactions, currentFile, usage] = await Promise.all([
    prisma.receiptDocument.findFirst({ where: { workspaceId: workspace.id } }),
    prisma.transaction.findMany({ where: { importFileId: file.id }, select: { amount: true, currency: true, reviewStatus: true, category: { select: { name: true } } } }),
    prisma.importFile.findUnique({ where: { id: file.id } }),
    getCloverTokenUsage(user),
  ]);
  assert.equal(cloudRequests, 0);
  assert.ok(receipt, "Device OCR must produce a saved reviewable receipt");
  assert.equal(transactions.length, 1, "Receipt core creates one reviewable transaction");
  assert.ok(transactions.every(row => row.reviewStatus === "pending_review"), "Default currency is a suggestion, never an automatic confirmation");
  assert.equal(Number(receipt.total), expectedTotal);
  if (expectedDate) assert.equal(receipt.transactionDate?.toISOString().slice(0, 10), expectedDate);
  assert.equal(transactions[0]?.category?.name, "Food & Dining", "Card payment does not replace the coffee merchant category");
  assert.equal(receipt.currency, "PHP", "Use user's default when no currency is printed");
  assert.equal(usage.totalTokens, 100000, "Deterministic receipt work adds no cloud allowance usage");
  const partialFile = await prisma.importFile.create({ data: {
    workspaceId: workspace.id, fileName: "partial-receipt.png", fileType: "image/png", storageKey: `qa/${tag}/partial-receipt`, status: "processing",
  } });
  const partialText = "Harbour Coffee QA\nSALES INVOICE\nOctober 04, 2026\nEspresso\nTOTAL unreadable\nThank you!";
  await processImportFileText(partialFile.id, {
    actorUserId: user.id, importMode: "receipt", sourceBytes: bytes,
    deviceText: { version: 1, source: "apple_vision", text: partialText, pagesRead: 1, totalPages: 1, complete: true, durationMs: 280 },
  });
  const draft = await loadReceiptDraft(partialFile.id, workspace.id);
  assert.equal(draft.canEdit, true, "Unreadable core stays an editable draft after cloud quota is exhausted");
  assert.equal(draft.fields.currency, "PHP");
  assert.equal(draft.fields.amount, "", "Missing amount must remain blank, never inferred from a date or balance");
  assert.equal(draft.fields.merchant, "Harbour Coffee QA");
  assert.equal(draft.fields.date, "2026-10-04");
  const originalPartial = await prisma.receiptDocument.findFirstOrThrow({ where: { documentImport: { importFileId: partialFile.id } } });
  assert.equal(originalPartial.total, null);
  assert.equal(await prisma.transaction.count({ where: { importFileId: partialFile.id } }), 0);
  const account = draft.accounts.find(account => account.currency === "PHP");
  assert.ok(account);
  const corrected = { ...draft.fields, merchant: "Harbour Coffee QA", date: "2026-10-04", amount: "25.00", accountId: account.id };
  await saveReceiptDraft(partialFile.id, workspace.id, user.id, corrected);
  assert.equal(await prisma.transaction.count({ where: { importFileId: partialFile.id } }), 0, "Saving a draft is not confirmation");
  const confirmed = await saveReceiptDraft(partialFile.id, workspace.id, user.id, corrected, true);
  const repeated = await saveReceiptDraft(partialFile.id, workspace.id, user.id, corrected, true);
  assert.equal(confirmed.transactionId, repeated.transactionId);
  assert.equal(repeated.duplicate, true);
  const savedPartial = await prisma.receiptDocument.findUniqueOrThrow({ where: { id: originalPartial.id } });
  assert.equal(savedPartial.total, null, "User confirmation lives separately from raw extraction");
  assert.deepEqual(savedPartial.rawPayload, originalPartial.rawPayload, "Saving or confirming must preserve original OCR/parser evidence");
  assert.equal(await prisma.transaction.count({ where: { importFileId: partialFile.id } }), 1, "Double confirmation cannot duplicate the receipt");
  assert.equal((await getCloverTokenUsage(user)).totalTokens, 100000);
  assert.equal(cloudRequests, 0);
  const cancellationRaces: Array<{ delayMs: number; controlAccepted: boolean; transactions: number }> = [];
  for (const delayMs of [0, 25, 120, 450]) {
    const raceFile = await prisma.importFile.create({ data: {
      workspaceId: workspace.id, fileName: `cancel-race-${delayMs}.png`, fileType: "image/png", storageKey: `qa/${tag}/cancel-race-${delayMs}`, status: "processing",
    } });
    const raceText = "Harbour Coffee QA\nSALES INVOICE\nOctober 04, 2026\nEspresso 35.00\nTOTAL 35.00\nCARD 35.00\nThank you!";
    const outcomes = await Promise.allSettled([
      processImportFileText(raceFile.id, {
        actorUserId: user.id, importMode: "receipt", sourceBytes: bytes,
        deviceText: { version: 1, source: "apple_vision", text: raceText, pagesRead: 1, totalPages: 1, complete: true, durationMs: 280 },
      }),
      (async () => {
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        return setImportUserControl(raceFile.id, user.id, "cancel");
      })(),
    ]);
    const persisted = await prisma.transaction.findMany({ where: { importFileId: raceFile.id }, select: { id: true, amount: true, currency: true } });
    const control = outcomes[1]!;
    if (control.status === "fulfilled") {
      assert.equal(persisted.length, 0, "Acknowledged cancellation cannot commit a transaction");
      const afterCancel = await prisma.importFile.findUniqueOrThrow({ where: { id: raceFile.id } });
      assert.equal(afterCancel.processingPhase, "cancelled");
      assert.equal(afterCancel.confirmedTransactionsCount, 0);
    } else {
      assert.match(String(control.reason), /already saved/);
      assert.equal(persisted.length, 1, "Saved receipt wins the race and cancellation must be rejected");
      assert.equal(Number(persisted[0]?.amount), 35);
      assert.equal(persisted[0]?.currency, "PHP");
    }
    cancellationRaces.push({ delayMs, controlAccepted: control.status === "fulfilled", transactions: persisted.length });
  }
  assert.equal(cloudRequests, 0);
  const summary = {
    passed: true, workerMs, underTenSeconds: workerMs < 10000, cloudRequests, simulatedFailureRequests,
    cancellationRaces, partialDraft: { editableWithoutCloud: draft.canEdit, confirmedOnce: repeated.duplicate }, deviceGrantScope: deviceGrant.scope, failureCredits: credits.length, restored: { monthly: first.monthly.remaining, rolling24h: first.rolling24h.remaining },
    resultStatus: result.status, fileStatus: currentFile?.status, processingPhase: currentFile?.processingPhase,
    receipt: { merchant: receipt.merchantClean || receipt.merchantRaw, date: receipt.transactionDate?.toISOString().slice(0, 10), total: Number(receipt.total), currency: receipt.currency, confidence: receipt.confidence },
    transactions: transactions.map(row => ({ ...row, amount: Number(row.amount) })),
    usageAfter: usage.totalTokens,
    scope: `Current worker against disposable ${local ? "loopback QA" : "staging"} Free user; ${imagePath ? "original photo + independently measured Vision OCR evidence" : "synthetic image/device OCR evidence"}; no provider calls; excludes camera capture/upload latency.`,
  };
  if (output) writeFileSync(output, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(summary));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  // Allow worker diagnostic tasks to settle before removing only these fixtures.
  await new Promise(resolve => setTimeout(resolve, 15000));
  globalThis.fetch = originalFetch;
  nextCache.revalidateTag = originalRevalidateTag;
  if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
});
