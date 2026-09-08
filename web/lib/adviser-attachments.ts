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
export function adviserFileProblem(file: { name: string; size?: number }) {
  if (!file.size || file.size < 0) return "Choose a non-empty file.";
  if (file.size > MAX_ADVISER_FILE_BYTES) return "Choose a file up to 3.5 MB.";
  if (
    !/\.(pdf|csv|tsv|txt|md|xlsx?|xlsm|xlsb|ods|png|jpe?g|webp|heic|heif)$/i.test(
      file.name,
    )
  )
    return "Choose a PDF, spreadsheet, text file or image.";
  return null;
}
