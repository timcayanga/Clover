"use client";

import { useEffect, useRef, type CSSProperties } from "react";
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

const IMPORT_STAGE_LABELS = [
  "Received file",
  "Reading statement",
  "Identifying transactions",
  "Matching account",
  "Enriching transactions",
  "Saving transactions",
] as const;

const describeImportStageRank = (label: string, progress: number) => {
  const normalizedLabel = label.trim().toLowerCase();
  const progressRank = progress >= 95 ? 5 : progress >= 75 ? 4 : progress >= 70 ? 3 : progress >= 50 ? 2 : progress >= 25 ? 1 : 0;
  const withProgressFloor = (stage: { label: string; rank: number }) =>
    stage.rank >= progressRank
      ? stage
      : { label: IMPORT_STAGE_LABELS[progressRank], rank: progressRank };

  if (/password/.test(normalizedLabel)) {
    return { label: "Password needed", rank: -1 };
  }
  if (/categor|enrich|normal|duplicate|finaliz|apply/.test(normalizedLabel)) {
    return withProgressFloor({ label: IMPORT_STAGE_LABELS[4], rank: 4 });
  }
  if (/identif|transaction|parsing/.test(normalizedLabel)) {
    return withProgressFloor({ label: IMPORT_STAGE_LABELS[2], rank: 2 });
  }
  if (/account|matching|saving visible|visible in clover/.test(normalizedLabel)) {
    return withProgressFloor({ label: IMPORT_STAGE_LABELS[3], rank: 3 });
  }
  if (/read|scan|statement|document|details|layout/.test(normalizedLabel)) {
    return withProgressFloor({ label: IMPORT_STAGE_LABELS[1], rank: 1 });
  }
  if (/queue|wait|start/.test(normalizedLabel)) {
    return withProgressFloor({ label: "Queued for import", rank: 0 });
  }
  if (/upload|receiv|prepar|ready/.test(normalizedLabel)) {
    return withProgressFloor({ label: IMPORT_STAGE_LABELS[0], rank: 0 });
  }

  return { label: IMPORT_STAGE_LABELS[progressRank], rank: progressRank };
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
  const displayedStageRef = useRef<{ importKey: string; rank: number; label: string } | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    delete document.body.dataset.cloverImportModalLocks;
    delete document.body.dataset.cloverImportModalOpen;
    delete document.body.dataset.cloverImportModalVisible;
    delete document.body.dataset.cloverImportModalVisibleCount;
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
      ? isComplete
        ? `File ${safeFileIndex} of ${safeFileTotal} imported`
        : tone === "error"
          ? `${safeCompletedFiles} of ${safeFileTotal} files checked`
          : null
      : null;
  const displayFileName = fileName ? truncateMiddle(fileName) : null;
  const stageCandidate = describeImportStageRank(detail || phaseLabel || "", value);
  const importKey = `${fileName ?? ""}:${safeFileIndex}:${safeFileTotal}`;
  if (!displayedStageRef.current || displayedStageRef.current.importKey !== importKey) {
    displayedStageRef.current = { importKey, ...stageCandidate };
  } else if (stageCandidate.rank > displayedStageRef.current.rank || stageCandidate.rank < 0) {
    displayedStageRef.current = { importKey, ...stageCandidate };
  }
  const progressLabel = isComplete
    ? `${safeCompletedFiles} of ${safeFileTotal}`
    : displayedStageRef.current.label;
  const progressCaption =
    safeFileTotal > 0
      ? isComplete
        ? tone === "error" ? "files checked" : "files ready"
        : `file ${safeFileIndex} of ${safeFileTotal}`
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
      : isComplete && tone === "success"
        ? resultHeadline || "Your import is now visible in Clover."
        : resultHeadline || (activeMilestone ? `✓ ${activeMilestone}` : detail);
  const canUsePrimaryAction = isComplete || tone === "error" ? Boolean(onClose) : canControl && Boolean(onCancel);
  const primaryActionLabel = isComplete || tone === "error" ? "Close import progress" : "Cancel upload";
  const handlePrimaryAction = isComplete || tone === "error" ? onClose : onCancel;

  return (
    <div className={`import-upload-dock import-upload-dock--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <div className="import-upload-dock__inner glass">
        <div
          className="import-upload-dock__mobile-progress"
          role="progressbar"
          aria-label={isComplete ? "Import complete" : "Import progress"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
        >
          <div className="import-upload-dock__mobile-progress-copy">
            <span>{isComplete ? "Import complete" : progressLabel}</span>
            <strong>{Math.round(value)}%</strong>
          </div>
          <div className="import-upload-dock__mobile-progress-track">
            <span style={{ width: `${value}%` }} />
          </div>
        </div>
        <div className="import-upload-dock__header">
          <div className="import-upload-dock__copy">
            <p className="eyebrow">Import progress</p>
            {tone === "error" && errorTitle ? (
              <strong>{errorTitle}</strong>
            ) : isComplete && tone === "success" ? (
              <strong>Import complete</strong>
            ) : fileLabel ? (
              <strong>{fileLabel}</strong>
            ) : null}
            {displayFileName ? <p className="import-upload-dock__file-name" title={fileName ?? undefined}>{displayFileName}</p> : null}
            <p className="import-upload-dock__message">{statusDetail}</p>
            {tone === "error" && timingSummary ? <p className="import-upload-dock__phase">{timingSummary}</p> : null}
            {tone === "error" && errorCode ? <p className="import-upload-dock__phase">Import code {errorCode}</p> : null}
          </div>
          <div className="import-upload-dock__header-actions">
            {canUsePrimaryAction ? (
              <button
                className="import-upload-dock__close import-upload-dock__close--dismiss"
                type="button"
                onClick={handlePrimaryAction}
                aria-label={primaryActionLabel}
              >
                &times;
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
