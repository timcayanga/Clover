import { isDelimitedImport } from "../../../shared/import-format-policies";
import { isUploadPhoto, isUploadPdf } from "../../../shared/native-upload";
import { File } from "expo-file-system";
import { decodeUnicodeTable } from "../../../shared/unicode-table";
import { CloverLocalAI } from "../../modules/clover-local-ai";
import type { QueuedFile, UploadSource } from "./file-queue";
import { withUploadCopy } from "./file-storage";
import { tryRunLocalOcr } from "./local-ocr-slot";
import { delimitedPreview } from "./table-preview";
import { normalizeDeviceTextEvidence, type DeviceTextEvidence } from "../../../shared/device-text-evidence";

function formatTextPreview(extracted: Pick<DeviceTextEvidence, "text" | "pagesRead" | "totalPages" | "complete">) {
  return `Local text preview · Needs review\nRead ${extracted.pagesRead} of ${extracted.totalPages} pages. ${extracted.complete ? "" : "Partial preview. "}OCR may contain errors; no financial rows are confirmed.\n\n${extracted.text || "No readable text found. Connect for full processing."}`;
}

export async function previewFile(file: QueuedFile, bytes: UploadSource) {
  const cached = normalizeDeviceTextEvidence(file.deviceText);
  if (cached) return formatTextPreview(cached);
  if (isDelimitedImport(file.name, file.mimeType)) {
    // Even the densest UTF-8 encoding cannot fit this many bytes in the local preview.
    if (file.size > 200_000 * 4 + 3)
      throw new Error("This table is too large for local preview. Queue the original for online parsing.");
    return withUploadCopy(file, bytes, async uri => {
      const text = decodeUnicodeTable(await new File(uri).bytes());
      if (text === null) throw new Error("This table encoding needs online processing. The original has been retained.");
      return delimitedPreview(text);
    });
  }
  if (!isUploadPdf(file.name, file.mimeType) && !isUploadPhoto(file.name, file.mimeType)) {
    throw new Error("This format will be parsed when connected. Its original file stays encrypted on this device.");
  }
  const localAI = CloverLocalAI;
  if (!localAI) {
    throw new Error("Local text extraction requires the updated native build. The file can still be queued for online parsing.");
  }
  const extracted = await tryRunLocalOcr(() =>
    withUploadCopy(file, bytes, uri => localAI.extractText(uri)),
  ).catch(() => {
    throw new Error("This file could not be previewed on this device. You can upload the original for Clover to read instead.");
  });
  if (!extracted) throw new Error("Clover is already reading a file. Try previewing again in a moment.");
  return formatTextPreview(extracted);
}
