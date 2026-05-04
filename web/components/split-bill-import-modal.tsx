"use client";

import { useState } from "react";
import { splitBillDraftFromReceiptPreview, type ReceiptPreviewResult } from "@/lib/split-bill";

type SplitBillImportModalProps = {
  open: boolean;
  onClose: () => void;
};

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const RECEIPT_PREVIEW_STORAGE_KEY = "split-bill:receipt-preview";

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
    return "Keep the file under 15 MB.";
  }

  return null;
};

export function SplitBillImportModal({ open, onClose }: SplitBillImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!open) {
    return null;
  }

  const closeModal = () => {
    onClose();
  };

  const handleUpload = async () => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file as File);

      const response = await fetch("/api/split-bill-receipts/preview", {
        method: "POST",
        body: formData,
      });
      const payload = await readJsonResponse<{ preview: ReceiptPreviewResult }>(response);
      const previewDraft = splitBillDraftFromReceiptPreview(payload.preview);

      sessionStorage.setItem(
        RECEIPT_PREVIEW_STORAGE_KEY,
        JSON.stringify({
          preview: payload.preview,
          fileName: file?.name ?? "",
          fileType: file?.type ?? "",
          draft: previewDraft,
        })
      );

      window.location.assign("/split-bill/new");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to read that receipt.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="split-bill-modal" role="presentation" onClick={closeModal}>
      <section className="split-bill-modal__card glass split-bill-import-modal" role="dialog" aria-modal="true" aria-label="Import receipt" onClick={(event) => event.stopPropagation()}>
        <div className="split-bill-manual-modal__head">
          <div>
            <p className="eyebrow">Upload Receipts</p>
            <h3>Upload a receipt</h3>
            <p className="split-bill-manual-modal__lead">Choose one receipt file. Clover will preview it before you continue.</p>
          </div>
          <button className="split-bill-icon-button" type="button" onClick={closeModal} aria-label="Close import window">
            ×
          </button>
        </div>

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
          <p>Maximum size: 15 MB.</p>
          <p>If you do not have a file yet, close this window and come back later.</p>
        </div>

        {error ? <p className="split-bill-editor__error">{error}</p> : null}

        <div className="split-bill-manual-modal__actions">
          <button className="button button-primary" type="button" onClick={() => void handleUpload()} disabled={isUploading}>
            {isUploading ? "Uploading..." : "Preview receipt"}
          </button>
        </div>
      </section>
    </div>
  );
}
