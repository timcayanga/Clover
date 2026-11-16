// PDF names can encode a character as # followed by its hexadecimal value.
// Recognize an escaped Encrypt key as well as the literal trailer entry.
export const hasPdfEncryptionMarker = (bytes: Uint8Array) =>
  /\/(?:E|#45)(?:n|#6[eE])(?:c|#63)(?:r|#72)(?:y|#79)(?:p|#70)(?:t|#74)(?=[\s\x00()[\]<>/%]|$)/.test(new TextDecoder("latin1").decode(bytes));
