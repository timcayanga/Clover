export function evidenceMime(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.subarray(0,5).toString() === "%PDF-") return "application/pdf";
  throw new Error("Upload a PNG, JPEG or PDF receipt.");
}
