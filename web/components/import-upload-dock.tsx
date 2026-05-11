"use client";

import type { CSSProperties } from "react";

type ImportUploadDockProps = {
  open: boolean;
  fileName?: string | null;
  fileIndex: number;
  fileTotal: number;
  completedFiles: number;
  progress: number;
  detail: string;
  phaseLabel?: string | null;
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
  tone = "default",
  onClose,
}: ImportUploadDockProps) {
  if (!open) {
    return null;
  }

  const value = clampProgress(progress);
  const donutStyle = { ["--progress" as any]: `${value}%` } as CSSProperties;
  const safeFileTotal = Math.max(0, fileTotal);
  const safeFileIndex =
    safeFileTotal > 0 ? Math.min(Math.max(1, fileIndex || 1), safeFileTotal) : Math.max(0, fileIndex || 0);
  const safeCompletedFiles = safeFileTotal > 0 ? Math.min(Math.max(0, completedFiles), safeFileTotal) : Math.max(0, completedFiles);
  const isComplete = safeFileTotal > 0 && safeCompletedFiles >= safeFileTotal && value >= 100;
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

  return (
    <div className={`import-upload-dock import-upload-dock--${tone}`} role="status" aria-live="polite">
      <div className="import-upload-dock__inner glass">
        <div className="import-upload-dock__header">
          <div>
            <p className="eyebrow">Import progress</p>
            <strong>{fileLabel}</strong>
            {phaseLabel ? <p className="import-upload-dock__phase">{phaseLabel}</p> : null}
            <p>{detail}</p>
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
      </div>
    </div>
  );
}
