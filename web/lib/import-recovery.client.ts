"use client";

import { importActivityEventName, type ImportActivitySnapshot } from "@/lib/import-activity";

type RecoveryScope = Pick<ImportActivitySnapshot, "workspaceId" | "importFileId" | "fileName">;

export type ImportRecovery = RecoveryScope & {
  retry: () => Promise<void>;
  dismiss: () => void;
};

// Files and callbacks stay in this tab's memory; never serialize a receipt or
// retain a callback after its uploader unmounts.
const recoveries = new Map<symbol, ImportRecovery>();

const notifyRecoveryChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(importActivityEventName));
};

export const registerImportRecovery = (recovery: ImportRecovery) => {
  const owner = Symbol("import-recovery");
  recoveries.set(owner, recovery);
  notifyRecoveryChanged();
  return () => {
    recoveries.delete(owner);
    notifyRecoveryChanged();
  };
};

export const getImportRecovery = (activity: RecoveryScope | null): ImportRecovery | null => {
  if (!activity) return null;
  for (const recovery of [...recoveries.values()].reverse()) {
    if (recovery.workspaceId !== activity.workspaceId) continue;
    if (recovery.importFileId && activity.importFileId) {
      if (recovery.importFileId === activity.importFileId) return recovery;
    } else if (recovery.fileName && recovery.fileName === activity.fileName) {
      return recovery;
    }
  }
  return null;
};

export const resolveImportRetryAction = async (
  importFileId: string | null,
  fetchStatus: typeof fetch = fetch
): Promise<"upload" | "resume"> => {
  if (!importFileId) return "upload";
  const response = await fetchStatus(`/api/imports/${encodeURIComponent(importFileId)}/progress`, {
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  // A disconnected multipart upload can fail before creating its server record.
  if (response.status === 404) return "upload";
  if (!response.ok) throw new Error("Clover couldn't check this upload. Please try again.");
  // The resume endpoint checks active/completed checkpoints before doing work.
  // Never blindly replay a file that may already have saved transactions.
  return "resume";
};
