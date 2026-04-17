"use client";

import type { CSSProperties } from "react";

type ImportProgressModalProps = {
  open: boolean;
  title: string;
  fileName: string;
  progress: number;
  detail: string;
  statusLabel?: string;
};

const clampProgress = (value: number) => Math.max(0, Math.min(100, value));

export function ImportProgressModal({
  open,
  title,
  fileName,
  progress,
  detail,
  statusLabel = "Working",
}: ImportProgressModalProps) {
  if (!open) {
    return null;
  }

  const value = clampProgress(progress);
  const donutStyle = { ["--progress" as any]: `${value}%` } as CSSProperties;

  return (
    <div className="modal-backdrop import-progress-backdrop" role="presentation">
      <section className="modal-card import-progress-modal glass" role="dialog" aria-modal="true" aria-labelledby="import-progress-title">
        <div className="import-progress-header">
          <div>
            <p className="eyebrow">Import progress</p>
            <h4 id="import-progress-title">{title}</h4>
            <p className="modal-copy">{fileName}</p>
          </div>
          <span className="import-progress-status">{statusLabel}</span>
        </div>

        <div className="import-progress-body">
          <div className="import-progress-donut" style={donutStyle}>
            <div className="import-progress-donut__inner">
              <strong>{Math.round(value)}%</strong>
              <span>{statusLabel}</span>
            </div>
          </div>

          <div className="import-progress-copy">
            <p>{detail}</p>
            <div className="import-progress-bar" aria-hidden="true">
              <span style={{ width: `${value}%` }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
