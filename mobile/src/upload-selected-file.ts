import { CryptoDigestAlgorithm, digest, randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { selectedUploadPartReader } from "./offline/file-storage";
import { browserReceiptPart, stageReceipt, receiptMultipartLimit } from "../../shared/receipt-upload";
import { Platform } from "react-native";
import { fileProblem, receiptPhotoForm, resolveSelectedFile, type SelectedFile } from "./upload";

// Calculated lazily only when a preview response is delayed. The source
// is local, and the server's status endpoint reads the saved extraction.
export async function selectedReceiptDraftId(file: SelectedFile, currency: string) {
  const bytes = Platform.OS === "web" ? new Uint8Array(await (await fetch(file.uri)).arrayBuffer()) : await new File(file.uri).bytes();
  const prefix = new TextEncoder().encode("receipt-v1:" + currency + ":");
  const data = new Uint8Array(prefix.length + bytes.length);
  data.set(prefix);
  data.set(bytes, prefix.length);
  const hash = new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, data));
  return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Keep originals outside the HTTP body limit when previewing a large receipt. */
export async function uploadSelectedFile<T>(
  path: string,
  request: <R>(path: string, options: RequestInit & { onUploadProgress?: (fraction: number) => void }) => Promise<R>,
  selected: SelectedFile,
  progress?: (fraction: number) => void,
) {
  const file = Platform.OS === "web" ? selected : resolveSelectedFile(selected);
  const blob = Platform.OS === "web" ? await (await fetch(file.uri)).blob() : null;
  const size = blob?.size ?? file.size;
  const problem = fileProblem({ ...file, size });
  if (problem || !size) throw new Error(problem || "The file is empty.");
  if (size <= receiptMultipartLimit) {
    const useNativeXhr = progress && Platform.OS !== "web";
    const body = useNativeXhr ? new FormData() : await receiptPhotoForm(file, blob);
    // RN XMLHttpRequest resolves URI parts through its native networking module.
    if (useNativeXhr) body.append("file", {uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream"} as unknown as Blob);
    return request<T>(path, { method: "POST", body, onUploadProgress: progress });
  }
  const id = randomUUID();
  const read = blob ? (index: number) => browserReceiptPart(blob, index) : selectedUploadPartReader(file);
  await stageReceipt(id, { name: file.name, mimeType: file.mimeType || "application/octet-stream", size },
    read, (action, uploadId, data) => request(path + "&action=" + action + "&uploadId=" + uploadId,
      { method: "POST", body: JSON.stringify(data) }), progress);
  return request<T>(path + "&uploadId=" + id, { method: "POST" });
}
