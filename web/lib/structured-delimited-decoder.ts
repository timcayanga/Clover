const decodeWith = (bytes: Uint8Array, encoding: string, fatal = false) =>
  new TextDecoder(encoding, { fatal }).decode(bytes);

const hasAlternatingNullBytes = (bytes: Uint8Array, parity: 0 | 1) => {
  const sampleLength = Math.min(bytes.length, 512);
  if (sampleLength < 8) return false;
  let matchingNulls = 0;
  let inspected = 0;
  for (let index = parity; index < sampleLength; index += 2) {
    inspected += 1;
    if (bytes[index] === 0) matchingNulls += 1;
  }
  return inspected > 0 && matchingNulls / inspected >= 0.6;
};

export const decodeStructuredDelimitedBytes = (bytes: Uint8Array) => {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeWith(bytes.subarray(3), "utf-8");
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeWith(bytes.subarray(2), "utf-16le");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeWith(bytes.subarray(2), "utf-16be");
  }
  if (hasAlternatingNullBytes(bytes, 1)) return decodeWith(bytes, "utf-16le");
  if (hasAlternatingNullBytes(bytes, 0)) return decodeWith(bytes, "utf-16be");

  try {
    return decodeWith(bytes, "utf-8", true);
  } catch {
    return decodeWith(bytes, "windows-1252");
  }
};
