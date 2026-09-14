import * as FileSystem from "expo-file-system/legacy";
import { CloverLocalAI } from "../../modules/clover-local-ai";
import type { QueuedFile } from "./file-queue";
import { withUploadCopy } from "./file-storage";
import { delimitedPreview } from "./table-preview";
export async function previewFile(file: QueuedFile, bytes: string) {
  return withUploadCopy(file, bytes, async (uri) => {
    if (/\.(csv|tsv)$/i.test(file.name))
      return delimitedPreview(await FileSystem.readAsStringAsync(uri));
    if (!/\.(pdf|png|jpe?g|webp|hei[cf])$/i.test(file.name))
      throw new Error(
        "This format will be parsed when connected. Its original file stays encrypted on this device.",
      );
    if (!CloverLocalAI)
      throw new Error(
        "Local text extraction requires the updated native build. The file can still be queued for online parsing.",
      );
    const extracted = await CloverLocalAI.extractText(uri);
    return `Local text preview · Needs review\nRead ${extracted.pagesRead} of ${extracted.totalPages} pages. ${extracted.complete ? "" : "Partial preview. "}OCR may contain errors; no financial rows are confirmed.\n\n${extracted.text || "No readable text found. Connect for full processing."}`;
  });
}
