// Detect Unicode before attempting a regional legacy encoding. Some mobile JS
// runtimes support only UTF-8 in TextDecoder, so read UTF-16 code units directly.
export function decodeUnicodeTable(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0 ||
      bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) {
    throw new Error("Save the table as UTF-8 or UTF-16 and upload it again.");
  }
  const littleBom = bytes[0] === 0xff && bytes[1] === 0xfe;
  const bigBom = bytes[0] === 0xfe && bytes[1] === 0xff;
  const pairs = Math.floor(Math.min(bytes.length, 512) / 2);
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < pairs * 2; i += 2) {
    if (bytes[i] === 0) evenZeros++;
    if (bytes[i + 1] === 0) oddZeros++;
  }
  const little = littleBom || (!bigBom && pairs >= 4 && oddZeros >= pairs * .6 && evenZeros < pairs * .6);
  const big = bigBom || (!littleBom && pairs >= 4 && evenZeros >= pairs * .6 && oddZeros < pairs * .6);
  if (little || big) {
    if (bytes.length % 2) throw new Error("Incomplete UTF-16 table. Export the original file again.");
    const offset = littleBom || bigBom ? 2 : 0;
    const encoding = little ? "utf-16le" : "utf-16be";
    let decoder: TextDecoder | undefined;
    try {
      decoder = new TextDecoder(encoding, { fatal: true });
    } catch { /* Some mobile runtimes only implement UTF-8. */ }
    if (decoder?.encoding === encoding) return decoder.decode(bytes.subarray(offset));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks: string[] = [];
    for (let cursor = offset; cursor < bytes.length;) {
      const end = Math.min(cursor + 8192, bytes.length);
      const units: number[] = [];
      for (; cursor < end; cursor += 2) units.push(view.getUint16(cursor, little));
      chunks.push(String.fromCharCode(...units));
    }
    const text = chunks.join("");
    if (/[\uD800-\uDFFF]/u.test(text)) throw new Error("Invalid UTF-16 table. Export the original file again.");
    return text;
  }
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(utf8Bom ? bytes.subarray(3) : bytes);
  } catch {
    if (utf8Bom) throw new Error("Invalid UTF-8 table. Export the original file again.");
    return null;
  }
}
