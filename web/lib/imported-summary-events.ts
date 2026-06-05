"use client";

import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

export const importedSummaryEventName = "clover:imported-summary";

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
