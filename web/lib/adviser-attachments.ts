import { uploadSizeProblem } from "../../shared/native-upload";
import { importMediaType, isDelimitedImport, SPREADSHEET_IMPORT_CONTENT_TYPES } from "./import-format-policies";
import { z } from "zod";
export const MAX_ADVISER_FILE_BYTES = 3_500_000;
export const MAX_ADVISER_ATTACHMENT_TEXT = 24_000;
export const adviserAttachmentIds = z
  .array(z.string().regex(/^adviser_file_[a-f0-9-]{36}$/))
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length);
export type AdviserAttachment = { id: string; name: string; size: number };
export const adviserFileAccept =
  ".pdf,.csv,.tsv,.txt,.md,.xlsx,.xls,.xlsm,.xlsb,.ods,.png,.jpg,.jpeg,.webp,.heic,.heif";
type AttachmentFile = { name: string; size?: number; type?: string };
const hasExtension = (name: string) => /\.[a-z0-9]+$/i.test(name);
export const isAdviserPhoto = (file: AttachmentFile) =>
  /\.(png|jpe?g|webp|hei[cf])$/i.test(file.name) || (!hasExtension(file.name) &&
    /^image\/(?:png|jpe?g|webp|hei[cf](?:-sequence)?)$/.test(importMediaType(file.type)));
export const isAdviserText = (file: AttachmentFile) => /\.(txt|md)$/i.test(file.name) ||
  (!hasExtension(file.name) && ["text/plain", "text/markdown"].includes(importMediaType(file.type)));
export function adviserFileProblem(file: AttachmentFile) {
  if (!file.size || file.size < 0) return "Choose a non-empty file.";
  if (isAdviserPhoto(file)) {
    return uploadSizeProblem(file.name, file.type, file.size);
  }
  if (isAdviserText(file)) return file.size > MAX_ADVISER_FILE_BYTES ? "Choose a text file up to 3.5 MB." : null;
  const media = importMediaType(file.type);
  if (/\.(pdf|csv|tsv|xlsx?|xlsm|xlsb|ods)$/i.test(file.name) ||
      (!hasExtension(file.name) && (media === "application/pdf" || isDelimitedImport(file.name, media) ||
        SPREADSHEET_IMPORT_CONTENT_TYPES.has(media)))) return uploadSizeProblem(file.name, file.type, file.size);
  return "Choose a PDF, spreadsheet, text file or image.";
}
