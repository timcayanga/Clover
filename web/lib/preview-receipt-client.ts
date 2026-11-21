import { browserReceiptPart, receiptMultipartLimit, stageReceipt } from "../../shared/receipt-upload";

export async function previewReceiptFile(file: File, url = "/api/split-bill-receipts/preview") {
  const separator = url.includes("?") ? "&" : "?";
  if (file.size <= receiptMultipartLimit) {
    const body = new FormData();
    body.set("file", file);
    return fetch(url, { method: "POST", body });
  }
  const id = crypto.randomUUID();
  await stageReceipt(id, { name: file.name, mimeType: file.type, size: file.size },
    index => browserReceiptPart(file, index), async (action, uploadId, data) => {
      const response = await fetch(url + separator + "action=" + action + "&uploadId=" + uploadId, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Receipt upload failed.");
    });
  return fetch(url + separator + "uploadId=" + id, { method: "POST" });
}
