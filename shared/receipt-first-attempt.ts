import type { ReceiptDraftMissingField } from "./receipt-draft";
import { newTelemetryId, telemetry } from "./analytics";

export const RECEIPT_VISIBLE_TARGET_MS = 10_000;
export type FirstReceiptScan = { id: string; acceptedAt: number };
export type FirstReceiptOutcome = "visible" | "failed" | "review_required" | "canceled" | "not_seen_24h";

export function beginFirstReceiptScan(acceptedAt = Date.now(), boundary?: "web_receipt_selected"): FirstReceiptScan {
  const scan = { id: newTelemetryId(), acceptedAt };
  telemetry("receipt_first_attempt", { operation_id: scan.id, outcome: "accepted", timing_boundary: boundary ?? "native_camera_accepted" });
  return scan;
}

export function receiptReviewReason(phase: string | undefined, needsPassword?: boolean) {
  if (needsPassword || phase === "password_required") return "password_required";
  if (phase === "receipt_review_required") return "receipt_details_needed";
  if (phase === "source_review_required") return "source_review_required";
  if (phase === "payment_account_review_required" || phase === "account_match_needs_confirmation") return "payment_account_needed";
  return undefined;
}

export type ReceiptOutcomeReason = NonNullable<ReturnType<typeof receiptReviewReason>> |
  "file_validation" | "profile_unavailable" | "queue_registration" | "photo_preparation" |
  "queue_rejected" | "processing_failed" | "non_financial_file" | "visual_repair_needed" |
  "upload_rejected" | `I-10${1|2|3|4|5|6|7|8|9}`;

export function reportFirstReceiptOutcome(scan: FirstReceiptScan, outcome: FirstReceiptOutcome, observedAt = Date.now(), reason?: ReceiptOutcomeReason, importFileId?: string) {
  const durationMs = observedAt - scan.acceptedAt;
  telemetry("receipt_first_attempt", {
    operation_id: scan.id, outcome,
    ...(importFileId ? { import_file_id: importFileId } : {}),
    duration_ms: durationMs >= 0 ? durationMs : null,
    ...(reason ? { reason_code: reason } : {}),
    within_target: outcome === "visible" && durationMs >= 0 && durationMs <= RECEIPT_VISIBLE_TARGET_MS,
  });
}


export function reportReceiptReviewPrompt(scan: FirstReceiptScan, fields: readonly ReceiptDraftMissingField[], observedAt = Date.now()) {
  const durationMs = observedAt - scan.acceptedAt;
  telemetry("receipt_review_prompt_shown", {
    operation_id: scan.id, duration_ms: durationMs >= 0 ? durationMs : null,
    reason_code: fields.length ? fields.join("+") : "confirm_saved_details",
  });
}
