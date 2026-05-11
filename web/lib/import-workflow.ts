export type ImportWorkflowStage =
  | "queued"
  | "uploading"
  | "reading_account_details"
  | "identifying_transactions"
  | "reconciling"
  | "staged"
  | "complete"
  | "repair_needed"
  | "failed";

const normalizeStage = (value?: string | null): ImportWorkflowStage | null => {
  switch ((value ?? "").trim()) {
    case "queued":
    case "queued_retry":
      return "queued";
    case "uploading":
      return "uploading";
    case "parsing":
    case "reading_statement":
    case "reading_account":
    case "reading_account_details":
      return "reading_account_details";
    case "auto_rerunning":
    case "matching_transactions":
    case "loading_transactions":
    case "identifying_transactions":
      return "identifying_transactions";
    case "reconciling":
    case "confirming":
      return "reconciling";
    case "staged":
    case "ready_for_confirmation":
      return "staged";
    case "complete":
    case "done":
    case "finalizing_enrichment":
      return "complete";
    case "plateaued":
    case "needs_retry":
    case "repairing":
      return "repair_needed";
    case "failed":
      return "failed";
    default:
      return null;
  }
};

export const readCheckpointWorkflowStage = (sourceMetadata: unknown): ImportWorkflowStage | null => {
  if (!sourceMetadata || typeof sourceMetadata !== "object" || Array.isArray(sourceMetadata)) {
    return null;
  }

  const metadata = sourceMetadata as Record<string, unknown>;
  const candidate =
    typeof metadata.workflowStage === "string"
      ? metadata.workflowStage
      : typeof metadata.processingPhase === "string"
        ? metadata.processingPhase
        : typeof metadata.stage === "string"
          ? metadata.stage
          : null;

  return normalizeStage(candidate);
};

export const mergeCheckpointSourceMetadata = (
  sourceMetadata: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> => {
  const base =
    sourceMetadata && typeof sourceMetadata === "object" && !Array.isArray(sourceMetadata)
      ? (sourceMetadata as Record<string, unknown>)
      : {};

  return {
    ...base,
    ...patch,
  };
};

export const normalizeImportWorkflowStage = normalizeStage;
