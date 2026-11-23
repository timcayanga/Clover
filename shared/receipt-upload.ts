import { NATIVE_UPLOAD_MAX_SIZE, NATIVE_UPLOAD_PART_SIZE, nativeUploadPartBytes } from "./native-upload";

/** Small receipts can use multipart. Larger originals travel in verified parts. */
// Leave room for multipart headers under the preview route's 4.5 MiB body limit.
export const receiptMultipartLimit = 4 * 1024 * 1024;

export async function stageReceipt(
  id: string,
  file: { name: string; mimeType: string; size: number },
  readPart: (index: number) => Promise<string>,
  post: (action: "start" | "part" | "cancel", id: string, body: object) => Promise<unknown>,
  progress?: (fraction: number) => void,
) {
  if (file.size > NATIVE_UPLOAD_MAX_SIZE) throw new Error("Choose a receipt up to 25 MB.");
  await post("start", id, file);
  try {
    const count = Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE);
    let uploaded = 0;
    for (let start = 0; start < count; start += 2) {
      // Bound native base64 memory and wait for both acknowledgements before cancellation.
      const batch = Array.from({ length: Math.min(2, count - start) }, async (_, offset) => {
        const index = start + offset;
        await post("part", id, { index, base64: await readPart(index) });
        uploaded += nativeUploadPartBytes(file.size, index);
        progress?.(uploaded / file.size);
      });
      const results = await Promise.allSettled(batch);
      for (const result of results) if (result.status === "rejected") throw result.reason;
    }
  } catch (error) {
    await post("cancel", id, {}).catch(() => {});
    throw error;
  }
}

export async function browserReceiptPart(file: Blob, index: number) {
  const reader = new FileReader();
  const part = file.slice(index * NATIVE_UPLOAD_PART_SIZE, (index + 1) * NATIVE_UPLOAD_PART_SIZE);
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Unable to read the selected receipt."));
    reader.readAsDataURL(part);
  });
}
