"use client";

import { useEffect, type CSSProperties } from "react";
import { buildImportResultChecklist, formatImportResultHeadline } from "@/lib/import-result-summary";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

type ImportUploadDockProps = {
  open: boolean;
  fileName?: string | null;
  fileIndex: number;
  fileTotal: number;
  completedFiles: number;
  progress: number;
  detail: string;
  timingSummary?: string | null;
  phaseLabel?: string | null;
  summary?: UploadInsightsSummary | null;
  tone?: "default" | "error" | "success";
  errorCode?: string | null;
  errorTitle?: string | null;
  errorNextSteps?: string[] | null;
  paused?: boolean;
  canControl?: boolean;
  onPauseToggle?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
};

const clampProgress = (value: number) => Math.max(0, Math.min(100, value));

const truncateMiddle = (value: string, maxLength = 44) => {
  if (value.length <= maxLength) {
    return value;
  }

  const extensionMatch = value.match(/(\.[a-z0-9]{2,8})$/i);
  const extension = extensionMatch?.[1] ?? "";
  const roomForName = Math.max(8, maxLength - extension.length - 1);
  const leading = Math.max(6, Math.ceil(roomForName * 0.6));
  const trailing = Math.max(4, roomForName - leading);
  return `${value.slice(0, leading)}…${value.slice(-trailing)}${extension}`;
};

export function ImportUploadDock({
  open,
  fileName = null,
  fileIndex,
  fileTotal,
  completedFiles,
  progress,
  detail,
  timingSummary = null,
  phaseLabel = null,
  summary = null,
  tone = "default",
  errorCode = null,
  errorTitle = null,
  errorNextSteps = null,
  paused = false,
  canControl = false,
  onPauseToggle,
  onCancel,
  onClose,
}: ImportUploadDockProps) {
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    delete document.body.dataset.cloverImportModalLocks;
    delete document.body.dataset.cloverImportModalOpen;
  }, [open]);

  if (!open) {
    return null;
  }

  const safeFileTotal = Math.max(0, fileTotal);
  const safeFileIndex =
    safeFileTotal > 0 ? Math.min(Math.max(1, fileIndex || 1), safeFileTotal) : Math.max(0, fileIndex || 0);
  const safeCompletedFiles = safeFileTotal > 0 ? Math.min(Math.max(0, completedFiles), safeFileTotal) : Math.max(0, completedFiles);
  const rawValue = clampProgress(progress);
  const isComplete = safeFileTotal > 0 && safeCompletedFiles >= safeFileTotal && rawValue >= 100;
  const activeFileBatchCeiling =
    safeFileTotal > 0 && safeFileIndex > 0 ? Math.max(1, ((safeFileIndex - 0.02) / safeFileTotal) * 100) : 99;
  const value = safeFileTotal > 0 && !isComplete ? Math.min(rawValue, activeFileBatchCeiling, 99) : rawValue;
  const donutStyle = { ["--progress" as any]: `${value}%` } as CSSProperties;
  const fileLabel =
    safeFileTotal > 0
      ? fileName
        ? isComplete
          ? `File ${safeFileIndex} of ${safeFileTotal} imported`
          : `Processing file ${safeFileIndex} of ${safeFileTotal}`
        : `${safeCompletedFiles} of ${safeFileTotal} ${tone === "error" ? "files checked" : "files ready"}`
      : "Clover is getting things ready";
  const displayFileName = fileName ? truncateMiddle(fileName) : null;
  const progressLabel =
    safeFileTotal > 0
      ? isComplete
        ? `${safeCompletedFiles} of ${safeFileTotal}`
        : fileName
          ? "Processing"
          : `${safeCompletedFiles} of ${safeFileTotal}`
      : "Preparing";
  const progressCaption =
    safeFileTotal > 0
        ? isComplete
          ? tone === "error" ? "files checked" : "files ready"
        : fileName
          ? `file ${safeFileIndex} of ${safeFileTotal}`
          : tone === "error" ? "files checked" : "files ready"
      : "import queue";
  const resultHeadline = isComplete ? formatImportResultHeadline(summary) : "";
  const importMilestones = buildImportResultChecklist(summary);
  const activeMilestone =
    !isComplete && importMilestones.length > 0
      ? importMilestones[
          Math.min(
            importMilestones.length - 1,
            value >= 75 ? 2 : value >= 50 ? 1 : value >= 25 ? 0 : 0
          )
        ]
      : "";
  const resultChecklist = isComplete ? importMilestones : [];
  const statusDetail =
    tone === "error"
      ? detail
      : resultHeadline || (activeMilestone ? `✓ ${activeMilestone}` : detail);

  return (
    <div className={`import-upload-dock import-upload-dock--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <div className="import-upload-dock__inner glass">
        <div className="import-upload-dock__header">
          <div className="import-upload-dock__copy">
            <p className="eyebrow">Import progress</p>
            <strong>{tone === "error" && errorTitle ? errorTitle : fileLabel}</strong>
            {displayFileName ? <p className="import-upload-dock__file-name" title={fileName ?? undefined}>{displayFileName}</p> : null}
            {phaseLabel ? <p className="import-upload-dock__phase">{phaseLabel}</p> : null}
            <p className="import-upload-dock__message">{statusDetail}</p>
            {timingSummary ? <p className="import-upload-dock__phase">{timingSummary}</p> : null}
            {tone === "error" && errorCode ? <p className="import-upload-dock__phase">Import code {errorCode}</p> : null}
          </div>
          <div className="import-upload-dock__header-actions">
            {onClose ? (
              <button className="import-upload-dock__close" type="button" onClick={onClose} aria-label="Close import progress">
                ×
              </button>
            ) : null}
            {canControl && onPauseToggle ? (
              <button
                className="import-upload-dock__close"
                type="button"
                onClick={onPauseToggle}
                aria-label={paused ? "Resume upload" : "Pause upload"}
              >
                {paused ? "▶" : "⏸"}
              </button>
            ) : null}
            {canControl && onCancel ? (
              <button className="import-upload-dock__close" type="button" onClick={onCancel} aria-label="Cancel upload">
                ⏹
              </button>
            ) : null}
          </div>
        </div>

        <div className="import-upload-dock__body">
          <div className="import-progress-donut import-upload-dock__donut" style={donutStyle}>
            <div className="import-progress-donut__inner">
              <strong>{Math.round(value)}%</strong>
            </div>
          </div>

          <div className="import-upload-dock__meta">
            <strong>{progressLabel}</strong>
            <span>{progressCaption}</span>
          </div>
        </div>
        {resultChecklist.length > 0 ? (
          <ul className="import-upload-dock__checklist" aria-label="Import highlights">
            {resultChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {tone === "error" && errorNextSteps?.length ? (
          <ul className="import-upload-dock__checklist" aria-label="What to do next">
            {errorNextSteps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
