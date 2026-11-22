import assert from "node:assert/strict";
import { getImportRecovery, registerImportRecovery, resolveImportRetryAction } from "../lib/import-recovery.client";
import { inferImportModeForFile } from "../lib/import-statement-identity";
import { buildReceiptSummaryFromReceiptTransaction } from "../lib/import-receipt-summary";
import { buildOptimisticUploadSummary } from "../lib/import-optimistic-summary";
import { mergeImportedWorkspaceTransactions } from "../lib/workspace-cache";

const main = async () => {
const scope = { workspaceId: "qa-receipt", importFileId: "attempt-1", fileName: "fictional-receipt.png" };
let retries = 0;
const release = registerImportRecovery({ ...scope, retry: async () => { retries++; }, dismiss: () => undefined });
assert.equal(getImportRecovery({ ...scope, workspaceId: "another-profile" }), null);
assert.equal(getImportRecovery({ ...scope, importFileId: "another-import" }), null);
assert.equal(getImportRecovery({ ...scope, importFileId: null })?.fileName, scope.fileName);
await getImportRecovery(scope)?.retry();
assert.equal(retries, 1);
const releaseNewer = registerImportRecovery({ ...scope, retry: async () => { retries += 10; }, dismiss: () => undefined });
release();
await getImportRecovery(scope)?.retry();
assert.equal(retries, 11, "An older uploader's cleanup must not unregister the current retry");
releaseNewer();
assert.equal(getImportRecovery(scope), null, "Unmounted uploaders must not retain receipt callbacks");

const response = (status: number) => (async () => new Response("{}", { status })) as typeof fetch;
assert.equal(await resolveImportRetryAction(null, (() => { throw Error("unexpected request"); }) as typeof fetch), "upload");
assert.equal(await resolveImportRetryAction("not-uploaded", response(404)), "upload");
assert.equal(await resolveImportRetryAction("saved-or-complete", response(200)), "resume");
for (const status of [401, 403, 429, 503]) {
  await assert.rejects(resolveImportRetryAction("uncertain", response(status)), /couldn't check/,
    "Authentication/rate-limit/server failures must not cause blind file replay");
}
await assert.rejects(resolveImportRetryAction("offline", (async () => { throw new TypeError("offline"); }) as typeof fetch), /offline/);
assert.equal(inferImportModeForFile({ name: "synthetic-qa-cafe-receipt-20261120.png", type: "image/png" }, "statement"), "receipt");
assert.equal(inferImportModeForFile({ name: "resibo-20261120.jpg", type: "image/jpeg" }, "statement"), "receipt");
assert.equal(inferImportModeForFile({ name: "bank statement resibo.png", type: "image/png" }, "statement"), "statement");
assert.equal(inferImportModeForFile({ name: "receipt.csv", type: "text/csv" }, "statement"), "statement");
assert.equal(inferImportModeForFile({ name: "screenshot.png", type: "image/png" }, "statement"), "statement");
const savedReceipt = { id: "saved-receipt-transaction", accountId: "cash", accountName: "Cash", amount: "300", date: "2026-11-20", currency: "PHP", merchantClean: "Cafe", reviewStatus: "confirmed" as const };
const summary = buildReceiptSummaryFromReceiptTransaction({ fileName: scope.fileName!, importFileId: scope.importFileId!, accountType: "cash", receiptTransaction: savedReceipt }, p =>
  buildOptimisticUploadSummary(p.fileName, p.importedRows, p.accountId, p.accountName, p.institution, p.accountType, p.optimisticAccountId ?? null, p.balance ?? null, p.previewTransactions, p.accountNumber ?? null, p.showBalanceEvenIfEmpty));
assert.equal(summary?.previewTransactions?.[0].id, savedReceipt.id, "Persisted receipts must use their real transaction identity");
assert.equal(summary?.previewTransactions?.[0].reviewStatus, "confirmed", "A preview must preserve the server review state");
const merged = mergeImportedWorkspaceTransactions(summary!.previewTransactions!, [{ ...savedReceipt, importFileId: null, source: "upload" }]);
assert.equal(merged.length, 1, "A refreshed receipt must not appear as both an optimistic and a saved expense");
console.log("Import retry regression passed: scoped ownership, cleanup, missing upload, saved import, and failed status checks.");
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
