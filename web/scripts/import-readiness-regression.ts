import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getImportStageLabel } from "../lib/import-progress";
import { resolveImportModalStatusDecision } from "../lib/import-modal-status";
import { waitForImportSettledVisibility } from "../lib/import-settled-visibility";
import { getImportActivityDismissKey, isFirstCompletedImportActivity, type ImportActivitySnapshot } from "../lib/import-activity";

async function main() {
  const active: ImportActivitySnapshot = {
    workspaceId: "fixture", surface: "background", status: "active",
    importFileId: "attempt-1", fileName: "statement.pdf", fileIndex: 1,
    fileTotal: 1, completedFiles: 0, progress: 90, detail: "Saving transactions",
    summary: null, errorCode: null, errorMessage: null, errorTitle: null,
    errorNextSteps: null, timing: null, updatedAt: 1000,
  };
  const done: ImportActivitySnapshot = {
    ...active, status: "done", completedFiles: 1, progress: 100, detail: "Import complete",
  };
  assert.equal(isFirstCompletedImportActivity(active, done), true, "Retiring the filename must not suppress the first full success snapshot.");
  assert.equal(isFirstCompletedImportActivity(null, done), true);
  assert.equal(isFirstCompletedImportActivity(done, done), false, "Late duplicate completion should remain suppressed.");
  assert.equal(isFirstCompletedImportActivity(active, { ...done, fileTotal: 2 }), false, "One file must not finish a multi-file batch.");
  assert.equal(isFirstCompletedImportActivity(active, { ...done, status: "error" }), false);
  assert.equal(isFirstCompletedImportActivity(active, { ...done, progress: 99 }), false);
  assert.notEqual(getImportActivityDismissKey(done), getImportActivityDismissKey({ ...done, importFileId: "attempt-2" }), "Retrying a dismissed filename needs its own confirmation.");
  assert.equal(getImportActivityDismissKey(done), getImportActivityDismissKey({ ...done, updatedAt: 2000 }), "A later update to the same attempt must stay dismissed.");
  assert.notEqual(getImportActivityDismissKey({ ...done, importFileId: null }), getImportActivityDismissKey({ ...done, importFileId: null, updatedAt: 2000 }));
  const accountsPage = readFileSync("app/accounts/page.tsx", "utf8");
  assert.doesNotMatch(accountsPage, /clearImportActivity\(/, "Accounts data refresh must not delete active progress before terminal success.");
  const modal = readFileSync("components/import-files-modal.tsx", "utf8");
  assert.match(modal, /retiredImportActivityFileNamesRef\.current\.has\(nextSnapshot\.fileName\) &&\s*!isFirstCompletedImportActivity\(previousSnapshot, nextSnapshot\)/, "Terminal publishing must bypass filename retirement for first success.");
  const globalActivity = readFileSync("components/global-import-activity.tsx", "utf8");
  assert.match(globalActivity, /if \(!shouldShowOnCurrentPath \|\| pageModalActive \|\| importModalVisible\) return;\s*const timeout/);
  assert.doesNotMatch(globalActivity, /completedImportDismissDelayMs -/, "Time hidden behind a modal must not consume success display time.");
  for (const progress of [75, 90, 95, 99]) {
    assert.equal(getImportStageLabel("Saving transactions", progress), "Saving transactions");
    assert.equal(getImportStageLabel("Reading file details", progress), "Reading file");
    assert.equal(getImportStageLabel("Clover parsed the rows and is retrying the final save (2/5).", progress), "Retrying save");
  }
  for (const importMode of ["statement", "receipt", "notes", "portfolio", "account_detail"] as const) {
    assert.equal(resolveImportModalStatusDecision({ importMode, processingPhase: "reconciling", progressFloor: 90 }).kind, "waiting");
    assert.equal(resolveImportModalStatusDecision({ importMode, status: "done", confirmedTransactionsCount: 11, processingPhase: "finalizing_enrichment" }).progress, 100);
  }
  const starter = readFileSync("lib/starter-data.ts", "utf8");
  const ensureCash = starter.slice(starter.indexOf("export const ensureWorkspaceCashAccount"), starter.indexOf("const starterCashAccountRelations"));
  assert.ok(ensureCash.indexOf("existingCashAccount.name") < ensureCash.indexOf("prisma.$transaction"));
  assert.match(starter, /set_config\('lock_timeout', '1500ms', true\)/);
  assert.match(starter, /tx\.category\.createMany/);
  const workspaces = readFileSync("app/api/workspaces/route.ts", "utf8");
  assert.doesNotMatch(workspaces, /void Promise\.all\(orderedWorkspaces/);
  assert.match(workspaces, /after\(async \(\) => \{[\s\S]*seedWorkspaceDefaults/);
  assert.doesNotMatch(readFileSync("components/import-files-modal.tsx", "utf8"), /finalizingTimer/);

  const savedFetch = globalThis.fetch;
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const savedEventSource = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
  let silent = false;
  let accountReads = 0;
  let statusReads = 0;
  let closed = 0;
  class FakeEventSource {
    onerror: (() => void) | null = null;
    addEventListener(name: string, handler: (event: { data: string }) => void) {
      // Some transports deliver a complete snapshot without a separate visible
      // event. This must complete immediately, not after the 1.5s interval.
      if (!silent && name === "complete") queueMicrotask(() => handler({ data: JSON.stringify({ confirmedTransactionsCount: 11, settledImportComplete: true }) }));
    }
    close() { closed++; }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms === 5000 ? 10 : ms),
    clearTimeout, setInterval, clearInterval,
  } });
  Object.defineProperty(globalThis, "EventSource", { configurable: true, value: FakeEventSource });
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/status")) {
      statusReads++;
      return Response.json({ confirmedTransactionsCount: 11, settledImportComplete: true });
    }
    accountReads++;
    return Response.json({ account: { id: "account", balance: "100" } });
  };
  try {
    let started = performance.now();
    assert.equal(await waitForImportSettledVisibility({ importFileId: "fixture", accountId: "account", importedRows: 11, expectedBalance: null, timeoutMs: 30000 }), true);
    assert.ok(performance.now() - started < 1000);
    assert.equal(accountReads, 1);
    assert.equal(statusReads, 0);
    silent = true;
    started = performance.now();
    assert.equal(await waitForImportSettledVisibility({ importFileId: "fixture", accountId: "account", importedRows: 11, expectedBalance: null, timeoutMs: 30000 }), true);
    assert.equal(statusReads, 1, "Silent streams must fall back before exhausting the deadline");
    assert.equal(closed, 2);
    assert.ok(performance.now() - started < 1000);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow); else Reflect.deleteProperty(globalThis, "window");
    if (savedEventSource) Object.defineProperty(globalThis, "EventSource", savedEventSource); else Reflect.deleteProperty(globalThis, "EventSource");
  }
  console.log("[PASS] Upload phases, bounded setup, immediate settled events, and silent-stream recovery.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
