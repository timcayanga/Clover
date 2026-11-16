import { processImportFileText } from "@/workers/import-processor";
import { getConfiguredPdfJsBaseUrl, isPdfPasswordError } from "./import-file-text.server";
import { reserveDelayedImportDispatch } from "./import-dispatch";
import { recoverFailedImportResume } from "./import-resume-recovery";
import { summarizeErrorForLog } from "./security-logging";

export async function reserveImportDispatchRecovery(importId: string, workspaceId: string, source: "status_recovery" | "scheduled_recovery") {
  const entry = await reserveDelayedImportDispatch(importId, workspaceId);
  if (!entry) return null;
  return async () => {
    console.info("[import-dispatch]", { importId, dispatchId: entry.id, source, outcome: "redelivered" });
    try {
      const result = await processImportFileText(importId, {
        dispatch: { id: entry.id, source }, importMode: entry.importMode,
        confirmStagedReceipt: entry.importMode === "receipt",
        autoRerunAttempt: entry.visualAttempt, allowDuplicateStatement: entry.allowDuplicateStatement, qaSource: "import_processing",
        statementMetadataOverride: entry.bankName ? { institution: entry.bankName } : null,
        pdfJsBaseUrl: getConfiguredPdfJsBaseUrl(),
      });
      return Number(result.confirmedTransactionsCount ?? result.imported ?? 0);
    } catch (error) {
      // The dispatch descriptor contains no password. An encrypted saved file
      // returns to the unlock flow instead of retrying with a missing secret.
      await recoverFailedImportResume(importId, undefined, {
        claimedDispatchId: entry.id, passwordRequired: isPdfPasswordError(error),
      });
      console.warn("[import-dispatch] recovery incomplete", { importId, dispatchId: entry.id, error: summarizeErrorForLog(error) });
      return 0;
    }
  };
}
