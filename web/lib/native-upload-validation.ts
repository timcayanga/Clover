import { validateImportFile } from "./import-file-validation";
import { NATIVE_UPLOAD_MAX_SIZE, uploadSizeProblem } from "../../shared/native-upload";
import { AsyncLocalStorage } from "node:async_hooks";
// Set only after assembling verified, owner-scoped transport parts. A client
// header or ordinary mobile multipart request cannot raise the parser limit.
type CompletedUpload = {
  pdfFinalizationMs?: number;
  pdfByteAssemblyMs?: number;
  source?: { id: string; name: string; type: string; bytes: Uint8Array };
};
const completedUpload = new AsyncLocalStorage<CompletedUpload>();
export const withCompletedNativeUpload = <T>(work: () => T, upload: CompletedUpload = {}) =>
  completedUpload.run(upload, work);
export function getVerifiedNativeSource(importId: string) {
  const source = completedUpload.getStore()?.source;
  return source?.id === importId ? source : undefined;
}
export const getNativePdfUploadTiming = () => completedUpload.getStore();
export const isCompletedNativeUpload = () =>
  completedUpload.getStore() !== undefined;

export const validateServerImportFile = (params:Parameters<typeof validateImportFile>[0]) =>
  uploadSizeProblem(params.fileName, params.contentType, params.fileSize) ??
  validateImportFile(params, isCompletedNativeUpload() ? {maximumBytes:NATIVE_UPLOAD_MAX_SIZE,maximumLabel:"25 MB"} : undefined);
