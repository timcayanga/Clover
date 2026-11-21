import { NATIVE_UPLOAD_MAX_SIZE, NATIVE_UPLOAD_PART_SIZE } from "./native-upload";

/** Small receipts can use multipart. Larger originals travel in verified parts. */
export const receiptMultipartLimit = NATIVE_UPLOAD_PART_SIZE;

export async function stageReceipt(
  id: string,
  file: { name: string; mimeType: string; size: number },
  readPart: (index: number) => Promise<string>,
  post: (action: "start" | "part" | "cancel", id: string, body: object) => Promise<unknown>,
) {
  if (file.size > NATIVE_UPLOAD_MAX_SIZE) throw new Error("Choose a receipt up to 25 MB.");
  await post("start", id, file);
  try {
    for (let index = 0; index < Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE); index++) {
      await post("part", id, { index, base64: await readPart(index) });
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
