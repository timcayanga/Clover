import { randomUUID } from "expo-crypto";
import { selectedUploadPartReader } from "./offline/file-storage";
import { browserReceiptPart, stageReceipt, receiptMultipartLimit } from "../../shared/receipt-upload";
import { Platform } from "react-native";
import { fileProblem, receiptPhotoForm, resolveSelectedFile, type SelectedFile } from "./upload";

/** Keep originals outside the HTTP body limit when previewing a large receipt. */
export async function uploadSelectedFile<T>(
  path: string,
  request: <R>(path: string, options: RequestInit) => Promise<R>,
  selected: SelectedFile,
) {
  const file = Platform.OS === "web" ? selected : resolveSelectedFile(selected);
  const blob = Platform.OS === "web" ? await (await fetch(file.uri)).blob() : null;
  const size = blob?.size ?? file.size;
  const problem = fileProblem({ ...file, size });
  if (problem || !size) throw new Error(problem || "The file is empty.");
  if (size <= receiptMultipartLimit)
    return request<T>(path, { method: "POST", body: await receiptPhotoForm(file) });
  const id = randomUUID();
  const read = blob ? (index: number) => browserReceiptPart(blob, index) : selectedUploadPartReader(file);
  await stageReceipt(id, { name: file.name, mimeType: file.mimeType || "application/octet-stream", size },
    read, (action, uploadId, data) => request(path + "&action=" + action + "&uploadId=" + uploadId,
      { method: "POST", body: JSON.stringify(data) }));
  return request<T>(path + "&uploadId=" + id, { method: "POST" });
}
