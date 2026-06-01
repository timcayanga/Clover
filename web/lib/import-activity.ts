"use client";

import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

export type ImportActivityStatus = "active" | "done" | "error";
export type ImportActivitySurface = "modal" | "background";
export type ImportActivityLocation = ImportActivitySurface;

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
  updatedAt: number;
};

export type ImportActivityState = ImportActivitySnapshot;

export const importActivityStorageKey = "clover.import.activity.v2";
export const importActivityEventName = "clover:import-activity-changed";

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

  const raw = storage.getItem(importActivityStorageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ImportActivitySnapshot>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const workspaceId = typeof parsed.workspaceId === "string" ? parsed.workspaceId : "";
    const status = parsed.status === "active" || parsed.status === "done" || parsed.status === "error" ? parsed.status : null;
    const surface = parsed.surface === "modal" || parsed.surface === "background" ? parsed.surface : null;
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
      updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : Date.now(),
    };
  } catch {
    return null;
  }
};

export const readImportActivity = (): ImportActivitySnapshot | null => {
  return readSnapshotFromStorage(getLocalStorage()) ?? readSnapshotFromStorage(getSessionStorage());
};

export const importActivityHasCompletedRows = (activity: ImportActivitySnapshot | null) => {
  if (!activity?.summary || activity.status === "error") {
    return false;
  }

  const rowsImported = Number(activity.summary.rowsImported ?? 0);
  if (!Number.isFinite(rowsImported) || rowsImported <= 0) {
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

const writeSnapshotToStorage = (snapshot: ImportActivitySnapshot) => {
  const serialized = JSON.stringify(snapshot);
  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();

  localStorageRef?.setItem(importActivityStorageKey, serialized);
  sessionStorageRef?.setItem(importActivityStorageKey, serialized);
};

const broadcastImportActivityChange = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(importActivityEventName));
};

export const setImportActivity = (
  snapshot:
    | (Omit<ImportActivitySnapshot, "updatedAt" | "errorCode" | "errorTitle" | "errorNextSteps"> & {
        errorCode?: string | null;
        errorTitle?: string | null;
        errorNextSteps?: string[] | null;
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
    updatedAt: "updatedAt" in snapshot && Number.isFinite(Number(snapshot.updatedAt)) ? Number(snapshot.updatedAt) : Date.now(),
  };
  writeSnapshotToStorage(nextSnapshot);
  broadcastImportActivityChange();
};

export const clearImportActivity = () => {
  if (typeof window === "undefined") {
    return;
  }

  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();
  localStorageRef?.removeItem(importActivityStorageKey);
  sessionStorageRef?.removeItem(importActivityStorageKey);
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
