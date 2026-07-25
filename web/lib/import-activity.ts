"use client";

import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

export type ImportActivityStatus = "active" | "done" | "error";
export type ImportActivitySurface = "modal" | "background";
export type ImportActivityLocation = ImportActivitySurface;

export type ImportActivityTiming = {
  startedAt: number;
  firstVisibleAt: number | null;
  completedAt: number | null;
  visibilityLatencyMs: number | null;
  totalLatencyMs: number | null;
};

export type ImportActivitySnapshot = {
  workspaceId: string;
  surface: ImportActivitySurface;
  status: ImportActivityStatus;
  importFileId: string | null;
  fileName: string | null;
  fileIndex: number;
  fileTotal: number;
  completedFiles: number;
  progress: number;
  detail: string;
  summary: UploadInsightsSummary | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorTitle: string | null;
  errorNextSteps: string[] | null;
  timing: ImportActivityTiming | null;
  updatedAt: number;
};

export type ImportActivityState = ImportActivitySnapshot;

export const importActivityStorageKey = "clover.import.activity.v2";
export const importActivityEventName = "clover:import-activity-changed";
const maxPersistedPreviewTransactions = 25;
const maxPersistedAccountSummaries = 100;
const maxPersistedTextLength = 1_000;

let inMemoryImportActivity: ImportActivitySnapshot | null = null;

const truncatePersistedText = (value: string | null, maxLength = maxPersistedTextLength) => {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
};

const compactSnapshotForStorage = (
  snapshot: ImportActivitySnapshot,
  options: { minimal?: boolean } = {}
): ImportActivitySnapshot => {
  const summary = snapshot.summary
    ? {
        ...snapshot.summary,
        fileName: truncatePersistedText(snapshot.summary.fileName, 300) ?? "",
        accountName: truncatePersistedText(snapshot.summary.accountName, 300),
        institution: truncatePersistedText(snapshot.summary.institution, 300),
        accountNumber: truncatePersistedText(snapshot.summary.accountNumber ?? null, 120),
        accountSummaries: options.minimal
          ? undefined
          : snapshot.summary.accountSummaries?.slice(0, maxPersistedAccountSummaries).map((account) => ({
              ...account,
              accountName: truncatePersistedText(account.accountName, 300),
              institution: truncatePersistedText(account.institution, 300),
              accountNumber: truncatePersistedText(account.accountNumber, 120),
            })),
        previewTransactions: options.minimal
          ? undefined
          : snapshot.summary.previewTransactions?.slice(0, maxPersistedPreviewTransactions).map((transaction) => ({
              ...transaction,
              accountName: truncatePersistedText(transaction.accountName, 300) ?? "",
              categoryName: truncatePersistedText(transaction.categoryName, 300),
              merchantRaw: truncatePersistedText(transaction.merchantRaw, 500) ?? "",
              merchantClean: truncatePersistedText(transaction.merchantClean, 500),
              description: truncatePersistedText(transaction.description, 500),
            })),
      }
    : null;

  return {
    ...snapshot,
    fileName: truncatePersistedText(snapshot.fileName, 300),
    detail: truncatePersistedText(snapshot.detail) ?? "",
    summary,
    errorMessage: truncatePersistedText(snapshot.errorMessage),
    errorTitle: truncatePersistedText(snapshot.errorTitle, 300),
    errorNextSteps: snapshot.errorNextSteps?.slice(0, 8).map((step) => truncatePersistedText(step, 500) ?? "") ?? null,
  };
};

const getLocalStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getSessionStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const readSnapshotFromStorage = (storage: Storage | null): ImportActivitySnapshot | null => {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(importActivityStorageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ImportActivitySnapshot>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const workspaceId = typeof parsed.workspaceId === "string" ? parsed.workspaceId : "";
    const status = parsed.status === "active" || parsed.status === "done" || parsed.status === "error" ? parsed.status : null;
    const surface = parsed.surface === "modal" || parsed.surface === "background" ? parsed.surface : null;
    const parsedTiming =
      parsed.timing && typeof parsed.timing === "object" && !Array.isArray(parsed.timing)
        ? (parsed.timing as Partial<ImportActivityTiming>)
        : null;
    if (!workspaceId || !status || !surface) {
      return null;
    }

    return {
      workspaceId,
      surface,
      status,
      importFileId: typeof parsed.importFileId === "string" ? parsed.importFileId : null,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : null,
      fileIndex: Number.isFinite(Number(parsed.fileIndex)) ? Number(parsed.fileIndex) : 0,
      fileTotal: Number.isFinite(Number(parsed.fileTotal)) ? Number(parsed.fileTotal) : 0,
      completedFiles: Number.isFinite(Number(parsed.completedFiles)) ? Number(parsed.completedFiles) : 0,
      progress: Number.isFinite(Number(parsed.progress)) ? Number(parsed.progress) : 0,
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
      summary:
        parsed.summary && typeof parsed.summary === "object"
          ? (parsed.summary as UploadInsightsSummary)
          : null,
      errorCode: typeof parsed.errorCode === "string" ? parsed.errorCode : null,
      errorMessage: typeof parsed.errorMessage === "string" ? parsed.errorMessage : null,
      errorTitle: typeof parsed.errorTitle === "string" ? parsed.errorTitle : null,
      errorNextSteps: Array.isArray(parsed.errorNextSteps)
        ? parsed.errorNextSteps.filter((step): step is string => typeof step === "string" && step.trim().length > 0)
        : null,
      timing:
        parsedTiming && Number.isFinite(Number(parsedTiming.startedAt))
          ? {
              startedAt: Number(parsedTiming.startedAt),
              firstVisibleAt: Number.isFinite(Number(parsedTiming.firstVisibleAt))
                ? Number(parsedTiming.firstVisibleAt)
                : null,
              completedAt: Number.isFinite(Number(parsedTiming.completedAt))
                ? Number(parsedTiming.completedAt)
                : null,
              visibilityLatencyMs: Number.isFinite(Number(parsedTiming.visibilityLatencyMs))
                ? Number(parsedTiming.visibilityLatencyMs)
                : null,
              totalLatencyMs: Number.isFinite(Number(parsedTiming.totalLatencyMs))
                ? Number(parsedTiming.totalLatencyMs)
                : null,
            }
          : null,
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : Date.now(),
    };
  } catch {
    return null;
  }
};

export const readImportActivity = (): ImportActivitySnapshot | null => {
  return inMemoryImportActivity ?? readSnapshotFromStorage(getLocalStorage()) ?? readSnapshotFromStorage(getSessionStorage());
};

export const importActivityHasCompletedRows = (activity: ImportActivitySnapshot | null) => {
  if (!activity?.summary || activity.status === "error") {
    return false;
  }

  const rowsImported = Number(activity.summary.rowsImported ?? 0);
  const hasImportedAccount =
    Boolean(activity.summary.accountId) ||
    Boolean(
      activity.summary.accountSummaries?.some(
        (account) => Boolean(account.accountId)
      )
    );
  if ((!Number.isFinite(rowsImported) || rowsImported <= 0) && !hasImportedAccount) {
    return false;
  }

  const completedFiles = Number(activity.completedFiles ?? 0);
  const fileTotal = Number(activity.fileTotal ?? 0);
  const progress = Number(activity.progress ?? 0);
  const fileBatchComplete = fileTotal > 0 && completedFiles >= fileTotal;

  return activity.status === "done" || fileBatchComplete || progress >= 100;
};

export const importActivityIsComplete = (activity: ImportActivitySnapshot | null) => {
  if (!activity || activity.status === "error") {
    return false;
  }

  const completedFiles = Number(activity.completedFiles ?? 0);
  const fileTotal = Number(activity.fileTotal ?? 0);
  const progress = Number(activity.progress ?? 0);
  const fileBatchComplete = fileTotal > 0 && completedFiles >= fileTotal;

  return activity.status === "done" || fileBatchComplete || progress >= 100;
};

export const getCompletedImportActivitySummary = (activity: ImportActivitySnapshot | null): UploadInsightsSummary | null => {
  return importActivityHasCompletedRows(activity) ? activity?.summary ?? null : null;
};

const formatImportActivityDuration = (durationMs: number) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }

  if (durationMs < 10_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  if (durationMs < 60_000) {
    return `${Math.round(durationMs / 1000)}s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`;
};

export const getImportActivityTimingSummary = (activity: ImportActivitySnapshot | null) => {
  if (!activity?.timing) {
    return null;
  }

  const visibilityDuration = formatImportActivityDuration(activity.timing.visibilityLatencyMs ?? Number.NaN);
  const totalDuration = formatImportActivityDuration(activity.timing.totalLatencyMs ?? Number.NaN);

  if (activity.status === "done") {
    if (visibilityDuration && totalDuration && visibilityDuration !== totalDuration) {
      return `Visible in ${visibilityDuration} · Complete in ${totalDuration}`;
    }

    if (totalDuration) {
      return `Complete in ${totalDuration}`;
    }

    if (visibilityDuration) {
      return `Visible in ${visibilityDuration}`;
    }

    return null;
  }

  if (activity.status === "error") {
    if (totalDuration) {
      return `Stopped after ${totalDuration}`;
    }

    const elapsedDuration = formatImportActivityDuration(Math.max(0, activity.updatedAt - activity.timing.startedAt));
    return elapsedDuration ? `Stopped after ${elapsedDuration}` : null;
  }

  if (visibilityDuration) {
    return `Visible in ${visibilityDuration}`;
  }

  const elapsedDuration = formatImportActivityDuration(Math.max(0, activity.updatedAt - activity.timing.startedAt));
  return elapsedDuration ? `Running for ${elapsedDuration}` : null;
};

const writeSnapshotToStorage = (snapshot: ImportActivitySnapshot) => {
  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();
  const compactSnapshot = compactSnapshotForStorage(snapshot);
  const serialized = JSON.stringify(compactSnapshot);
  const minimalSerialized = JSON.stringify(compactSnapshotForStorage(snapshot, { minimal: true }));

  for (const storage of [localStorageRef, sessionStorageRef]) {
    if (!storage) {
      continue;
    }

    try {
      storage.setItem(importActivityStorageKey, serialized);
    } catch {
      // A previous import may have filled this origin's storage. Remove only
      // Clover's activity payload and retry with the summary-only snapshot.
      try {
        storage.removeItem(importActivityStorageKey);
        storage.setItem(importActivityStorageKey, minimalSerialized);
      } catch {
        // Import activity persistence is best-effort. The in-memory snapshot
        // still keeps the current page responsive and fully up to date.
      }
    }
  }
};

const broadcastImportActivityChange = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(importActivityEventName));
};

export const setImportActivity = (
  snapshot:
    | (Omit<ImportActivitySnapshot, "updatedAt" | "errorCode" | "errorTitle" | "errorNextSteps" | "timing"> & {
        errorCode?: string | null;
        errorTitle?: string | null;
        errorNextSteps?: string[] | null;
        timing?: ImportActivityTiming | null;
      })
    | ImportActivitySnapshot
) => {
  if (typeof window === "undefined") {
    return;
  }

  const nextSnapshot: ImportActivitySnapshot = {
    ...snapshot,
    errorCode: snapshot.errorCode ?? null,
    errorTitle: snapshot.errorTitle ?? null,
    errorNextSteps: snapshot.errorNextSteps ?? null,
    timing: snapshot.timing ?? null,
    updatedAt: "updatedAt" in snapshot && Number.isFinite(Number(snapshot.updatedAt)) ? Number(snapshot.updatedAt) : Date.now(),
  };
  inMemoryImportActivity = nextSnapshot;
  writeSnapshotToStorage(nextSnapshot);
  broadcastImportActivityChange();
};

export const clearImportActivity = () => {
  if (typeof window === "undefined") {
    return;
  }

  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();
  inMemoryImportActivity = null;
  for (const storage of [localStorageRef, sessionStorageRef]) {
    try {
      storage?.removeItem(importActivityStorageKey);
    } catch {
      // Storage may be unavailable or full in restricted browser contexts.
    }
  }
  broadcastImportActivityChange();
};

export const subscribeImportActivity = (listener: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage && event.storageArea !== window.sessionStorage) {
      return;
    }

    if (event.key !== importActivityStorageKey) {
      return;
    }

    inMemoryImportActivity = readSnapshotFromStorage(event.storageArea);
    listener();
  };

  const handleCustomEvent = () => {
    listener();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(importActivityEventName, handleCustomEvent as EventListener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(importActivityEventName, handleCustomEvent as EventListener);
  };
};
