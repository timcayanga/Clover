import { validateImportFile } from "./import-file-validation";
import { NATIVE_UPLOAD_MAX_SIZE } from "../../shared/native-upload";
import { AsyncLocalStorage } from "node:async_hooks";
// Set only after assembling verified, owner-scoped transport parts. A client
// header or ordinary mobile multipart request cannot raise the parser limit.
const completedUpload = new AsyncLocalStorage<boolean>();
export const withCompletedNativeUpload = <T>(work: () => T) =>
  completedUpload.run(true, work);
export const isCompletedNativeUpload = () =>
  completedUpload.getStore() === true;

export const validateServerImportFile = (params:Parameters<typeof validateImportFile>[0]) => validateImportFile(params, isCompletedNativeUpload() ? {maximumBytes:NATIVE_UPLOAD_MAX_SIZE,maximumLabel:"25 MB"} : undefined);
