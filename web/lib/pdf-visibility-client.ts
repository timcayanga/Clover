import { reportFirstReceiptOutcome, reportReceiptReviewPrompt, type FirstReceiptOutcome, type FirstReceiptScan, type ReceiptOutcomeReason } from "../../shared/receipt-first-attempt";
import type { ReceiptDraftMissingField } from "../../shared/receipt-draft";
import { telemetry } from "../../shared/analytics";
import { importPollTimings, importPresentationTimings } from "../../shared/import-commit-timing";
import { getAffectedWorkspaceDataDomains, publishWorkspaceDataChange } from "./workspace-data-sync";

type VisibilityTiming = {
  receipt?: FirstReceiptScan;
  receiptImportId?: string;
  receiptOutcomeReported?: boolean;
  receiptPromptReported?: boolean;
  startedAt?: number;
  pdf?: boolean;
  firstVisibleAt?: number;
  mountedAt?: number;
  checking?: boolean;
  commitNoticeAt?: number;
  reported?: boolean;
  poll?: ReturnType<typeof importPollTimings>;
  source?: "poll" | "process_response";
};

const uploads = new Map<string, VisibilityTiming>();
const keyFor = (workspaceId: string, importFileId: string) => JSON.stringify([workspaceId, importFileId]);

export function rememberImportUpload(workspaceId: string, importFileId: string, pdf: boolean, receipt?: FirstReceiptScan) {
  const key = keyFor(workspaceId, importFileId);
  if (uploads.has(key)) return;
  if (uploads.size >= 64) uploads.delete(uploads.keys().next().value!);
  uploads.set(key, { startedAt: performance.now(), pdf, receipt, receiptImportId: receipt ? importFileId : undefined });
}

export function finishWebReceiptAttempt(workspaceId: string, importFileId: string, outcome: FirstReceiptOutcome, observedAt?: number, reason?: ReceiptOutcomeReason) {
  const timing = uploads.get(keyFor(workspaceId, importFileId));
  if (!timing?.receipt || timing.receiptOutcomeReported) return;
  timing.receiptOutcomeReported = true;
  reportFirstReceiptOutcome(timing.receipt, outcome, observedAt, reason, importFileId);
}

export function observeWebReceiptReviewPrompt(importFileId: string, fields: readonly ReceiptDraftMissingField[]) {
  if (document.visibilityState !== "visible") return;
  for (const timing of uploads.values()) {
    if (timing.receiptImportId !== importFileId || !timing.receipt || timing.receiptPromptReported) continue;
    timing.receiptPromptReported = true;
    reportReceiptReviewPrompt(timing.receipt, fields);
    return;
  }
}

export function noticeWebImportCommit(workspaceId: string, importFileId: string, source: "poll" | "process_response", commitAgeMs?: number, roundTripMs = 0) {
  const key = keyFor(workspaceId, importFileId);
  const timing = uploads.get(key) ?? {};
  if (timing.commitNoticeAt !== undefined) return;
  if (!uploads.has(key) && uploads.size >= 64) uploads.delete(uploads.keys().next().value!);
  timing.commitNoticeAt = performance.now();
  timing.poll = importPollTimings(commitAgeMs, roundTripMs);
  timing.source = source;
  uploads.set(key, timing);
  telemetry("import_commit_observed", { import_file_id: importFileId, commit_notice_source: source, ...timing.poll });
  publishWorkspaceDataChange({
    workspaceId, source: "transactions", affected: getAffectedWorkspaceDataDomains("transactions"),
    path: `/api/imports/${encodeURIComponent(importFileId)}/committed`, revision: Date.now(),
  });
}

export function observeWebImportRows(
  workspaceId: string,
  rows: readonly { id: string; importFileId?: string | null }[],
  nodes: ReadonlyMap<string, HTMLElement>,
  compact: boolean,
  report: (name: "import_first_row_visible" | "pdf_import_first_row_visible", event: Record<string, string | number | boolean | undefined>) => void,
) {
  if (typeof IntersectionObserver === "undefined") return;
  const candidates = new Map<Element, string>();
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (node && row.importFileId && uploads.has(keyFor(workspaceId, row.importFileId))) {
      candidates.set(node, row.importFileId);
    }
  }
  if (candidates.size === 0) return;
  const observer = new IntersectionObserver(entries => {
    if (document.visibilityState !== "visible") return;
    for (const entry of entries) {
      const id = candidates.get(entry.target);
      if (!id || !entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
      const key = keyFor(workspaceId, id);
      const timing = uploads.get(key);
      if (!timing) continue;
      const header = compact ? null : entry.target.parentElement?.querySelector(".transactions-column-header");
      if (header && entry.intersectionRect.bottom <= header.getBoundingClientRect().bottom) continue;
      timing.firstVisibleAt ??= entry.time;
      if (timing.commitNoticeAt !== undefined) {
        finishWebReceiptAttempt(workspaceId, id, "visible", performance.timeOrigin + entry.time);
      }
      if (!timing.reported && timing.commitNoticeAt !== undefined) {
        timing.reported = true;
        report("import_first_row_visible", {
          import_file_id: id,
          client_surface: compact ? "mobile_web" : "desktop_web",
          commit_notice_source: timing.source,
          ...timing.poll,
          ...importPresentationTimings(timing.firstVisibleAt, timing.commitNoticeAt, timing.mountedAt),
        });
      }
      if (!timing.pdf || timing.checking) continue;
      timing.checking = true;
      void (async () => {
        try {
          for (const wait of [0, 300, 1200]) {
            if (wait) await new Promise(resolve => setTimeout(resolve, wait));
            const response = await fetch(`/api/imports/${encodeURIComponent(id)}/status?visibilityOnly=1`);
            if (!response.ok) return;
            const { pdfVisibilityTarget } = await response.json();
            if (typeof pdfVisibilityTarget?.attemptId !== "string") continue;
            timing.pdf = false;
            report("pdf_import_first_row_visible", {
              attempt_id: pdfVisibilityTarget.attemptId,
              import_file_id: id,
              upload_to_first_visible_row_ms: Math.max(0, timing.firstVisibleAt! - timing.startedAt!),
              ui_delay_ms: Math.max(0, timing.firstVisibleAt! - timing.mountedAt!),
              ui_delay_boundary: "row_mounted_to_visible",
              client_surface: compact ? "mobile_web" : "desktop_web",
            });
            return;
          }
        } finally {
          timing.checking = false;
        }
      })().catch(() => undefined);
    }
  }, { threshold: 0.5 });
  const observe = () => {
    if (document.visibilityState !== "visible") return;
    for (const [node, id] of candidates) {
      const timing = uploads.get(keyFor(workspaceId, id));
      if (!timing) continue;
      const mountedAt = performance.now();
      if (timing.mountedAt === undefined || (timing.commitNoticeAt !== undefined && timing.mountedAt < timing.commitNoticeAt && timing.firstVisibleAt === undefined)) timing.mountedAt = mountedAt;
      observer.unobserve(node);
      observer.observe(node);
    }
  };
  observe();
  document.addEventListener("visibilitychange", observe);
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", observe);
  };
}
