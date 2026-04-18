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
  statusLabel?: string;
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
  statusLabel = "Uploading",
}: ImportUploadDockProps) {
  if (!open) {
    return null;
  }

  const value = clampProgress(progress);
  const donutStyle = { ["--progress" as any]: `${value}%` } as CSSProperties;
  const fileLabel =
    fileTotal > 0
      ? fileName
        ? `File ${fileIndex} of ${fileTotal}`
        : `Uploaded ${completedFiles} of ${fileTotal}`
      : "Preparing upload";

  return (
    <div className="import-upload-dock" role="status" aria-live="polite">
      <div className="import-upload-dock__inner glass">
        <div className="import-upload-dock__header">
          <div>
            <p className="eyebrow">Import progress</p>
            <strong>{fileLabel}</strong>
            <p>{detail}</p>
          </div>
          <span className="import-upload-dock__status">{statusLabel}</span>
        </div>

        <div className="import-upload-dock__body">
          <div className="import-progress-donut import-upload-dock__donut" style={donutStyle}>
            <div className="import-progress-donut__inner">
              <strong>{Math.round(value)}%</strong>
            </div>
          </div>

          <div className="import-upload-dock__meta">
            <strong>
              {completedFiles} of {fileTotal}
            </strong>
            <span>files uploaded</span>
          </div>
        </div>
      </div>
    </div>
  );
}
