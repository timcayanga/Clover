"use client";

import React, { useEffect, useState } from "react";
import { getImportStageLabel } from "@/lib/import-progress";
import { ReceiptDraftDialog } from "@/components/receipt-draft-dialog";
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
  reviewImportId?: string | null;
  onReviewSaved?: () => void;
};


export function ImportUploadDock({ open, fileIndex, fileTotal, completedFiles, progress, detail,
  phaseLabel, tone = "default", errorTitle, paused = false, canControl = false,
  onPauseToggle, onCancel, onClose, reviewImportId, onReviewSaved }: ImportUploadDockProps) {
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => { setReviewOpen(false); }, [reviewImportId, open]);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    delete document.body.dataset.cloverImportModalLocks;
    delete document.body.dataset.cloverImportModalOpen;
    delete document.body.dataset.cloverImportModalVisible;
    delete document.body.dataset.cloverImportModalVisibleCount;
  }, [open]);
  if (!open) return null;
  if (reviewOpen && reviewImportId) return <ReceiptDraftDialog importId={reviewImportId} onClose={() => setReviewOpen(false)} onSaved={() => { setReviewOpen(false); onReviewSaved?.(); }}/>;
  const total = Math.max(0, fileTotal);
  const rawValue = Math.max(0, Math.min(100, Number(progress) || 0));
  const isComplete = tone === "success" && total > 0 && completedFiles >= total && rawValue >= 100;
  const ceiling = total > 0 ? Math.max(1, ((Math.min(Math.max(1, fileIndex), total) - 0.02) / total) * 100) : 99;
  const value = isComplete ? 100 : Math.min(rawValue, ceiling, 99);
  const progressLabel = paused ? "Import paused" : tone === "error" ? errorTitle || "Import needs attention" : getImportStageLabel(phaseLabel || detail || "", value);
  const settled = isComplete || tone === "error";
  return <div className={`import-upload-dock import-upload-dock--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
    <div className="import-upload-dock__inner glass">
      <div className="import-upload-dock__step">
        <span>{isComplete ? "Import complete" : progressLabel}</span>
        <div className="import-upload-dock__controls">
          {!settled && canControl && onPauseToggle ? <button className="import-upload-dock__icon" type="button" onClick={onPauseToggle} aria-label={paused ? "Resume import" : "Pause import"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {paused ? <path d="m8 5 11 7-11 7V5Z"/> : <path d="M8 5v14M16 5v14"/>}
            </svg>
          </button> : null}
          {(settled ? onClose : canControl && onCancel) ? <button className="import-upload-dock__icon" type="button" onClick={settled ? onClose : onCancel} aria-label={settled ? "Dismiss import progress" : "Cancel import"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
          </button> : null}
        </div>
      </div>
      <div className="import-upload-dock__track" role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-valuetext={isComplete ? "Import complete" : progressLabel}>
        <span style={{ width: `${value}%` }}/>
      </div>
      {tone === "error" && reviewImportId ? <button type="button" className="import-upload-dock__review" onClick={() => setReviewOpen(true)}>Review receipt</button> : null}
    </div>
  </div>;
}
