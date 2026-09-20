import {
  NATIVE_UPLOAD_PART_SIZE,
  nativeUploadPartBytes,
} from "../../../shared/native-upload";
import type { QueuedFile, UploadControl } from "./file-queue";
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
export async function uploadInParts(
  request: Request,
  file: QueuedFile,
  base64: string,
  control: UploadControl,
) {
  const path = `uploads/${file.id}`;
  const query = `?workspaceId=${encodeURIComponent(file.workspaceId)}`;
  const state = await request<{ parts: number[]; state: string }>(
    `${path}/start${query}`,
    {
      method: "POST",
      signal: control.signal,
      body: JSON.stringify({
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      }),
    },
  );
  const completed = new Set(state.parts);
  let sent = state.parts.reduce(
    (sum, i) => sum + nativeUploadPartBytes(file.size, i),
    0,
  );
  await control.progress(sent, false);
  for (
    let index = 0;
    index < Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE);
    index++
  ) {
    if (control.signal.aborted) throw new Error("Upload paused.");
    if (completed.has(index)) continue;
    const part = base64.slice(
      ((index * NATIVE_UPLOAD_PART_SIZE) / 3) * 4,
      (((index + 1) * NATIVE_UPLOAD_PART_SIZE) / 3) * 4,
    );
    await request(`${path}/part${query}`, {
      method: "POST",
      signal: control.signal,
      body: JSON.stringify({ index, base64: part }),
    });
    sent += nativeUploadPartBytes(file.size, index);
    await control.progress(sent, false);
  }
  if (control.signal.aborted) throw new Error("Upload paused.");
  await control.progress(file.size, true);
  // Finalization must be reconciled with server status if its response is lost;
  // it is intentionally not abortable by a transport pause button.
  const response = await request<{ canonicalImportFileId?: string }>(
    `${path}/complete${query}`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(file.password ? { password: file.password } : {}),
      }),
    },
  );
  return { canonicalId: response.canonicalImportFileId };
}
