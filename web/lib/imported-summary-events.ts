"use client";

import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

export const importedSummaryEventName = "clover:imported-summary";
const importRefreshChannelName = "clover:import-refresh:v1";
const importRefreshStorageKey = "clover.import-refresh.v1";
let refreshChannel: BroadcastChannel | null | undefined;
const getRefreshChannel = () => {
  if (refreshChannel !== undefined) return refreshChannel;
  try {
    refreshChannel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(importRefreshChannelName);
  } catch {
    refreshChannel = null;
  }
  return refreshChannel;
};

export const publishExternalImportRefresh = (workspaceId: string) => {
  if (typeof window === "undefined" || !workspaceId) return;
  const notice = { workspaceId, revision: `${Date.now()}-${Math.random()}` };
  const channel = getRefreshChannel();
  if (channel) channel.postMessage(notice);
  else {
    try {
      window.localStorage.setItem(importRefreshStorageKey, JSON.stringify(notice));
    } catch {
      // The current tab still receives the ordinary completion event.
    }
  }
};

// Storage caches are hints, not an atomic cross-tab database. Notify other
// views to read the committed rows instead of trusting a racing cache writer.
export const subscribeExternalImportRefresh = (listener: (workspaceId: string) => void) => {
  if (typeof window === "undefined") return () => undefined;
  const receive = (data: unknown) => {
    if (data && typeof data === "object" && "workspaceId" in data && typeof data.workspaceId === "string") {
      listener(data.workspaceId);
    }
  };
  const channel = getRefreshChannel();
  if (channel) {
    const handle = (event: MessageEvent) => receive(event.data);
    channel.addEventListener("message", handle);
    return () => channel.removeEventListener("message", handle);
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== importRefreshStorageKey || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* Ignore malformed notices. */ }
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
};

export type ImportedSummaryEventDetail = {
  workspaceId: string;
  summary: UploadInsightsSummary;
};

export const publishImportedSummary = (workspaceId: string, summary: UploadInsightsSummary) => {
  if (typeof window === "undefined" || !workspaceId) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ImportedSummaryEventDetail>(importedSummaryEventName, {
      detail: {
        workspaceId,
        summary,
      },
    })
  );
  publishExternalImportRefresh(workspaceId);
};

export const subscribeImportedSummary = (
  listener: (detail: ImportedSummaryEventDetail) => void
) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<ImportedSummaryEventDetail>;
    const detail = customEvent.detail;
    if (!detail || typeof detail.workspaceId !== "string" || !detail.summary) {
      return;
    }

    listener(detail);
  };

  window.addEventListener(importedSummaryEventName, handleEvent as EventListener);

  return () => {
    window.removeEventListener(importedSummaryEventName, handleEvent as EventListener);
  };
};
