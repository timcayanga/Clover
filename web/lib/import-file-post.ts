"use client";

export const postFileWithProgress = (
  url: string,
  file: File,
  fields: Record<string, string | undefined> = {},
  onProgress?: (progress: number) => void,
  options?: { signal?: AbortSignal | null; timeoutMs?: number; onUploadComplete?: () => void }
) =>
  new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    const abortSignal = options?.signal ?? null;
    let settled = false;

    formData.append("file", file);
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === "string" && value.length > 0) {
        formData.append(key, value);
      }
    }

    xhr.open("POST", url, true);
    xhr.timeout = options?.timeoutMs ?? 90_000;

    const abortUpload = () => {
      if (settled) {
        return;
      }
      xhr.abort();
    };

    if (abortSignal?.aborted) {
      reject(new Error("File upload was canceled."));
      return;
    }
    abortSignal?.addEventListener("abort", abortUpload, { once: true });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) {
        return;
      }

      onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.upload.onload = () => {
      onProgress?.(100);
      options?.onUploadComplete?.();
    };

    xhr.onload = () => {
      settled = true;
      abortSignal?.removeEventListener("abort", abortUpload);
      const response = new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: new Headers({
          "Content-Type": xhr.getResponseHeader("Content-Type") || "application/json",
        }),
      });
      resolve(response);
    };

    xhr.onerror = () => {
      settled = true;
      abortSignal?.removeEventListener("abort", abortUpload);
      reject(new Error("Unable to upload the file."));
    };
    xhr.ontimeout = () => {
      settled = true;
      abortSignal?.removeEventListener("abort", abortUpload);
      reject(new Error("Timed out while uploading the file."));
    };
    xhr.onabort = () => {
      settled = true;
      abortSignal?.removeEventListener("abort", abortUpload);
      reject(new Error("File upload was canceled."));
    };
    xhr.send(formData);
  });
