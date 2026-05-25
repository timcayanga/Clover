"use client";

import type { CSSProperties } from "react";
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
  phaseLabel?: string | null;
  summary?: UploadInsightsSummary | null;
  tone?: "default" | "error" | "success";
  onClose?: () => void;
};

const clampProgress = (value: number) => Math.max(0, Math.min(100, value));

export function ImportUploadDock({
  open,
  fileName = null,
  fileIndex,
  fileTotal,
  completedFiles,
  progress,
  detail,
  phaseLabel = null,
  summary = null,
  tone = "default",
  onClose,
}: ImportUploadDockProps) {
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
        ? `File ${safeFileIndex} of ${safeFileTotal}`
        : `${safeCompletedFiles} of ${safeFileTotal} files ready`
      : "Clover is getting things ready";
  const progressLabel =
    safeFileTotal > 0
      ? isComplete
        ? `${safeCompletedFiles} of ${safeFileTotal}`
        : fileName
          ? `Processing ${safeFileIndex} of ${safeFileTotal}`
          : `${safeCompletedFiles} of ${safeFileTotal}`
      : "Preparing";
  const progressCaption =
    safeFileTotal > 0
      ? isComplete
        ? "files ready"
        : fileName
          ? "current file"
          : "files ready"
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
  const statusDetail = resultHeadline || (activeMilestone ? `✓ ${activeMilestone}` : detail);

  return (
    <div className={`import-upload-dock import-upload-dock--${tone}`} role="status" aria-live="polite">
      <div className="import-upload-dock__inner glass">
        <div className="import-upload-dock__header">
          <div>
            <p className="eyebrow">Import progress</p>
            <strong>{fileLabel}</strong>
            {phaseLabel ? <p className="import-upload-dock__phase">{phaseLabel}</p> : null}
            <p>{statusDetail}</p>
          </div>
          <div className="import-upload-dock__header-actions">
            {onClose ? (
              <button className="import-upload-dock__close" type="button" onClick={onClose} aria-label="Close import progress">
                ×
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
      </div>
    </div>
  );
}
