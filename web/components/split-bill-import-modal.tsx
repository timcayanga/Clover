"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { ImportUploadDock } from "@/components/import-upload-dock";
import {
  mergeSplitBillItemSplitMetadata,
  mergeSplitBillReceiptSummary,
  splitBillDraftFromReceiptPreview,
  type ReceiptPreviewResult,
  type SplitBillSerializedBill,
} from "@/lib/split-bill";

type SplitBillImportModalProps = {
  open: boolean;
  currentUserName: string;
  onClose: () => void;
  onSaved?: (bill: SplitBillSerializedBill) => void;
};

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
}

const validateFile = (file: File | null) => {
  if (!file) {
    return "Choose a receipt file to continue.";
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Use a PDF, PNG, JPG, or WEBP file.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "Keep the file under 10 MB.";
  }

  return null;
};

const createId = () => globalThis.crypto?.randomUUID?.() ?? `receipt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function SplitBillImportModal({ open, currentUserName, onClose, onSaved }: SplitBillImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("Choose a receipt and Clover will read it for you.");

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    document.body.dataset.splitBillModalOpen = "true";

    return () => {
      if (document.body.dataset.splitBillModalOpen === "true") {
        document.body.dataset.splitBillModalOpen = "false";
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFile(null);
    setError(null);
    setIsUploading(false);
    setUploadMessage("Choose a receipt and Clover will read it for you.");
  }, [open]);

  if (!open) {
    return null;
  }

  const closeModal = () => {
    if (isUploading) {
      return;
    }

    onClose();
  };

  const saveReceiptBill = async (preview: ReceiptPreviewResult, fileToSave: File) => {
    const draft = splitBillDraftFromReceiptPreview(preview);
    const participants =
      draft.participants
        .filter((participant) => participant.name.trim())
        .map((participant) => ({
          id: participant.id ?? createId(),
          name: participant.name.trim(),
        })) ||
      [];

    if (participants.length === 0) {
      participants.push({
        id: createId(),
        name: currentUserName.trim() || "You",
      });
    }

    const participantIds = new Set(participants.map((participant) => participant.id));
    const fallbackParticipantId = participants[0]?.id ?? createId();
    const items = draft.items
      .filter((item) => item.description.trim() || item.amount.trim())
      .map((item) => ({
        id: item.id ?? createId(),
        description: item.description.trim(),
        amount: item.amount,
        participantIds: item.participantIds.filter((participantId) => participantIds.has(participantId)),
        splitMethod: item.splitMethod ?? "equal",
        allocations: item.allocations ?? [],
      }));
    const payments = draft.payments
      .filter((payment) => payment.amount.trim())
      .map((payment) => ({
        id: payment.id ?? createId(),
        participantId: participantIds.has(payment.participantId) ? payment.participantId : fallbackParticipantId,
        amount: payment.amount,
        note: payment.note ?? null,
      }));

    const payload = {
      title: draft.title.trim(),
      note: draft.note?.trim() || null,
      billDate: draft.billDate,
      currency: draft.currency,
      sourceType: "receipt" as const,
      groupId: draft.groupId || null,
      merchantName: draft.merchantName?.trim() || null,
      receiptFileName: fileToSave.name,
      receiptMimeType: fileToSave.type,
      receiptText: draft.receiptText?.trim() || null,
      receiptConfidence: draft.receiptConfidence,
      subtotal: draft.subtotal?.trim() || null,
      tax: draft.tax?.trim() || null,
      tip: draft.tip?.trim() || null,
      discount: draft.discount?.trim() || null,
      total: draft.total?.trim() || null,
      rawPayload: mergeSplitBillItemSplitMetadata(
        mergeSplitBillReceiptSummary(draft.rawPayload, {
          subtotal: draft.subtotal?.trim() || null,
          serviceCharge: draft.serviceCharge?.trim() || null,
          tax: draft.tax?.trim() || null,
          tip: draft.tip?.trim() || null,
          rounding: draft.rounding?.trim() || null,
          discount: draft.discount?.trim() || null,
          total: draft.total?.trim() || null,
        }),
        items
      ),
      participants,
      items,
      payments,
    };

    const response = await fetch("/api/split-bills", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await readJsonResponse<{ bill: SplitBillSerializedBill }>(response);
    return result.bill;
  };

  const handleUpload = async () => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadMessage("Reading your receipt...");
    let savedBill: SplitBillSerializedBill | null = null;

    try {
      const formData = new FormData();
      formData.set("file", file as File);

      const response = await fetch("/api/split-bill-receipts/preview", {
        method: "POST",
        body: formData,
      });
      const payload = await readJsonResponse<{ preview: ReceiptPreviewResult }>(response);

      setUploadMessage("Saving your split bill...");
      savedBill = await saveReceiptBill(payload.preview, file as File);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to read that receipt.");
      setUploadMessage("Choose a receipt and Clover will read it for you.");
    } finally {
      setIsUploading(false);
    }

    if (savedBill) {
      onSaved?.(savedBill);
      onClose();
    }
  };

  return (
    <div className="split-bill-modal" role="presentation" onClick={closeModal}>
      <section
        className="split-bill-modal__card glass split-bill-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Import receipt"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="split-bill-manual-modal__head">
          <div>
            <p className="eyebrow">Upload receipts</p>
            <h3>Upload a receipt</h3>
            <p className="split-bill-manual-modal__lead">Choose one receipt file. Clover will preview it before it becomes a bill.</p>
          </div>
          <button className="split-bill-icon-button" type="button" onClick={closeModal} aria-label="Close import window" disabled={isUploading}>
            ×
          </button>
        </div>

        {isUploading ? (
          <ImportUploadDock
            open
            fileName={file?.name ?? null}
            fileIndex={1}
            fileTotal={1}
            completedFiles={0}
            progress={65}
            detail={uploadMessage}
            phaseLabel="Receipt preview"
          />
        ) : (
          <>
            <label className="settings-field">
              <span>Receipt file</span>
              <input
                className="settings-input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setError(nextFile ? validateFile(nextFile) : null);
                }}
              />
            </label>

            <div className="split-bill-import-modal__notes">
              <p>Accepted: PDF, PNG, JPG, or WEBP.</p>
              <p>Maximum size: 10 MB.</p>
              <p>Stays inside Split Bills while Clover reads the file.</p>
            </div>

            {error ? <p className="split-bill-editor__error">{error}</p> : null}

            <div className="split-bill-manual-modal__actions">
              <button className="button button-secondary" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="button button-primary" type="button" onClick={() => void handleUpload()} disabled={!file}>
                Preview receipt
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
