"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("Drop a receipt file here or browse from your computer.");
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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
    setDragActive(false);
    setIsUploading(false);
    setMessage("Drop a receipt file here or browse from your computer.");
  }, [open]);

  const closeModal = () => {
    if (isUploading) {
      return;
    }

    onClose();
  };

  const openFilePicker = () => {
    if (!fileInputRef.current) {
      return;
    }

    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const saveReceiptBill = async (preview: ReceiptPreviewResult, fileToSave: File) => {
    const draft = splitBillDraftFromReceiptPreview(preview);
    const participants =
      draft.participants
        .filter((participant) => participant.name.trim())
        .map((participant) => ({
          id: participant.id ?? createId(),
          name: participant.name.trim(),
        })) || [];

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

    const selectedFile = file as File;
    setIsUploading(true);
    setError(null);
    setMessage("Reading your receipt...");

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);

      const response = await fetch("/api/split-bill-receipts/preview", {
        method: "POST",
        body: formData,
      });
      const payload = await readJsonResponse<{ preview: ReceiptPreviewResult }>(response);

      setMessage("Saving your split bill...");
      const savedBill = await saveReceiptBill(payload.preview, selectedFile);
      onSaved?.(savedBill);
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to read that receipt.");
      setMessage("Drop a receipt file here or browse from your computer.");
    } finally {
      setIsUploading(false);
    }
  };

  if (!open) {
    return null;
  }

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop modal-backdrop--import-fullscreen" role="presentation" onClick={closeModal}>
      <section
        className="modal-card modal-card--wide accounts-import-modal glass split-bill-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Import receipt"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="accounts-import-modal__toolbar">
          <button className="accounts-import-close" type="button" onClick={closeModal} aria-label="Close import files" disabled={isUploading}>
            ×
          </button>
        </div>

        <div
          className={`accounts-import-dropzone accounts-import-dropzone--hero ${dragActive ? "is-active" : ""}`}
          role="presentation"
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const nextFile = event.dataTransfer.files[0] ?? null;
            setFile(nextFile);
            setError(validateFile(nextFile));
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              openFilePicker();
            }
          }}
        >
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              setFile(nextFile);
              setError(validateFile(nextFile));
            }}
          />
          <strong>Drop a receipt here</strong>
          <span>or browse for a file from your computer.</span>
          <button className="button button-secondary button-small" type="button" onClick={openFilePicker}>
            Choose file
          </button>
        </div>

        {isUploading ? (
          <ImportUploadDock
            open
            fileName={file?.name ?? null}
            fileIndex={1}
            fileTotal={1}
            completedFiles={0}
            progress={55}
            detail={message}
            phaseLabel="Receipt preview"
          />
        ) : null}

        <div className="accounts-import-footer-copy">
          {error ? <p className="accounts-import-footer-copy__warning">{error}</p> : null}
          {message ? <p className="accounts-import-footer-copy__status">{message}</p> : null}
          <p>
            Accepted files: PDF, JPG, JPEG, PNG, and WEBP.
            <br />
            This stays inside Split Bills and saves a bill after Clover previews it.
          </p>
        </div>

        <div className="accounts-import-files">
          {file ? (
            <article className="accounts-import-file accounts-import-file--pending">
              <div className="accounts-import-file__head">
                <div className="accounts-import-file__meta">
                  <strong>{file.name}</strong>
                  <span>
                    {file.type.startsWith("image/") ? "Image" : "PDF"} · {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                </div>
                <div className="accounts-import-file__badges">
                  <span className="accounts-import-badge is-pending">queued</span>
                </div>
              </div>
              <div className="accounts-import-file__foot">
                <span>{isUploading ? "Reading receipt..." : "Ready to preview"}</span>
                <div className="accounts-import-file__actions">
                  <button className="button button-secondary button-small" type="button" onClick={() => setFile(null)} disabled={isUploading}>
                    Remove
                  </button>
                  <button className="button button-primary button-small" type="button" onClick={() => void handleUpload()} disabled={isUploading || !file}>
                    {isUploading ? "Uploading..." : "Preview receipt"}
                  </button>
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </div>,
    portalTarget
  );
}
