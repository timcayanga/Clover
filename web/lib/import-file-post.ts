"use client";

export const postFileWithProgress = (
  url: string,
  file: File,
  fields: Record<string, string | undefined> = {},
  onProgress?: (progress: number) => void
) =>
  new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === "string" && value.length > 0) {
        formData.append(key, value);
      }
    }

    xhr.open("POST", url, true);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) {
        return;
      }

      onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    };

    xhr.onload = () => {
      const response = new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: new Headers({
          "Content-Type": xhr.getResponseHeader("Content-Type") || "application/json",
        }),
      });
      resolve(response);
    };

    xhr.onerror = () => reject(new Error("Unable to upload the file."));
    xhr.onabort = () => reject(new Error("File upload was canceled."));
    xhr.send(formData);
  });
