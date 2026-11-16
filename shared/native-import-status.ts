/** Native and web use the same server-approved recovery checkpoint. */
export function needsNativeImportResume(status: {
  visibleImportComplete?: boolean;
  canResume?: boolean;
  importFile: { status: string; processingPhase?: string };
  statementSelfHeal?: { reason?: string };
}) {
  if (status.visibleImportComplete || status.importFile.status === "done") return false;
  return status.statementSelfHeal?.reason === "stale_statement_image_queue" ||
    (status.canResume === true && status.importFile.processingPhase === "queued_retry");
}

/** Completion requires saved rows/accounts, not merely a finished parser job. */
export function nativeImportIsComplete(status: {
  visibleImportComplete?: boolean;
  settledImportComplete?: boolean;
}) {
  return status.settledImportComplete ?? (status.visibleImportComplete === true);
}
