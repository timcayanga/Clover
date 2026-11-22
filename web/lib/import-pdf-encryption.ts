// PDF names may encode each character as # followed by two hexadecimal digits.
const encryptName = new TextEncoder().encode("Encrypt");
const slashByte = 0x2f;
const escapeByte = 0x23;

function hexDigit(byte: number) {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return -1;
}

export function hasPdfEncryptionMarker(bytes: Uint8Array) {
  for (let slash = bytes.indexOf(slashByte); slash !== -1; slash = bytes.indexOf(slashByte, slash + 1)) {
    let cursor = slash + 1;
    if (bytes[cursor] !== encryptName[0] && bytes[cursor] !== escapeByte) continue;
    let matched = 0;
    for (const expected of encryptName) {
      let actual = bytes[cursor++];
      if (actual === escapeByte) {
        const hi = hexDigit(bytes[cursor++]), lo = hexDigit(bytes[cursor++]);
        if (hi < 0 || lo < 0) break;
        actual = hi * 16 + lo;
      }
      if (actual !== expected) break;
      matched++;
    }
    if (matched === encryptName.length &&
        (cursor === bytes.length || /[\s\x00()[\]<>/%]/.test(String.fromCharCode(bytes[cursor])))) return true;
  }
  return false;
}
