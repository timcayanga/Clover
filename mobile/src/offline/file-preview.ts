import { isDelimitedImport } from "../../../shared/import-format-policies";
import { isUploadPhoto, isUploadPdf } from "../../../shared/native-upload";
import * as FileSystem from "expo-file-system/legacy";
import { CloverLocalAI } from "../../modules/clover-local-ai";
import type { QueuedFile, UploadSource } from "./file-queue";
import { withUploadCopy } from "./file-storage";
import { tryRunLocalOcr } from "./local-ocr-slot";
import { delimitedPreview } from "./table-preview";
export async function previewFile(file: QueuedFile, bytes: UploadSource) {
  if (file.deviceText) return `Local text preview · Needs review\nOCR may contain errors; no financial rows are confirmed.\n\n${file.deviceText.text}`;
  if (isDelimitedImport(file.name, file.mimeType)) {
    // Even the densest UTF-8 encoding cannot fit this many bytes in the local preview.
    if (file.size > 200_000 * 4 + 3)
      throw new Error("This table is too large for local preview. Queue the original for online parsing.");
    return withUploadCopy(file, bytes, async uri => delimitedPreview(await FileSystem.readAsStringAsync(uri)));
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
  return `Local text preview · Needs review\nRead ${extracted.pagesRead} of ${extracted.totalPages} pages. ${extracted.complete ? "" : "Partial preview. "}OCR may contain errors; no financial rows are confirmed.\n\n${extracted.text || "No readable text found. Connect for full processing."}`;
}
