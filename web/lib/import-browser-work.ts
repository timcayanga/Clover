export type BrowserImportRequest =
  | { kind: "image"; file: File; receipt: boolean; targetBytes: number }
  | { kind: "delimited"; file: File }
  | { kind: "pdf_encryption"; file: File };

type BrowserImportResults = {
  image: Blob;
  delimited: string;
  pdf_encryption: boolean;
};

let busy = false;

// Local preparation is optional. At most one worker holds a decoded file.
export async function runBrowserImportWork<T extends BrowserImportRequest>(
  request: T
): Promise<BrowserImportResults[T["kind"]] | null> {
  if (busy || typeof Worker === "undefined") return null;

  busy = true;
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const activeWorker = new Worker(new URL("./import-browser.worker.ts", import.meta.url), {
      type: "module",
    });
    worker = activeWorker;
    return await new Promise<BrowserImportResults[T["kind"]] | null>((resolve) => {
      timeout = setTimeout(() => resolve(null), request.kind === "image" ? 6_000 : 2_000);
      activeWorker.onmessage = (event: MessageEvent<BrowserImportResults[T["kind"]] | null>) =>
        resolve(event.data);
      activeWorker.onerror = (event) => {
        event.preventDefault();
        resolve(null);
      };
      activeWorker.onmessageerror = () => resolve(null);
      activeWorker.postMessage(request);
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    worker?.terminate();
    busy = false;
  }
}
