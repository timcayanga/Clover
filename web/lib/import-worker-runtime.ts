import { isLocalDevHost } from "@/lib/auth";

let startupPromise: Promise<void> | null = null;

export const ensureImportProcessingWorker = async () => {
  if (!(await isLocalDevHost())) {
    return;
  }

  if (!startupPromise) {
    startupPromise = import("@/workers/imports-worker")
      .then(() => undefined)
      .catch((error) => {
        startupPromise = null;
        throw error;
      });
  }

  await startupPromise;
};
