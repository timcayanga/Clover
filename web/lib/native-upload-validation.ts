import { AsyncLocalStorage } from "node:async_hooks";
// Set only after assembling verified, owner-scoped transport parts. A client
// header or ordinary mobile multipart request cannot raise the parser limit.
const completedUpload = new AsyncLocalStorage<boolean>();
export const withCompletedNativeUpload = <T>(work: () => T) =>
  completedUpload.run(true, work);
export const isCompletedNativeUpload = () =>
  completedUpload.getStore() === true;
