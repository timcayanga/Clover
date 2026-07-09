const normalizeInlineWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const looksLikeGcashFamilyScreenshotText = (text: string) => {
  const normalized = normalizeInlineWhitespace(String(text ?? ""));
  if (!normalized) {
    return false;
  }

  return /\b(?:GSave|GCash|GCrypto|GFunds|ATRAM|UNO\s+Digital\s+Bank|UNOready|UNOboost|CIMB)\b/i.test(normalized);
};

export const normalizeGcashFamilyScreenshotOcrText = (text: string) =>
  String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\bci\s*mb\b/gi, "CIMB")
    .replace(/(?:#\s*)?uno\s*ready(?:@?g?cash|e?c?cash|ccash|eccash)?/gi, "#UNOready@GCash")
    .replace(/(?:#\s*)?uno\s*boost(?:@?g?cash|e?c?cash|ccash|eccash)?/gi, "#UNOboost@GCash")
    .replace(/##+/g, "#")
    .replace(/(@GCash){2,}/gi, "@GCash")
    .replace(/[£$](?=\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b)/g, "₱");

export const gsaveScreenshotExpectsMultipleAccounts = (text: string) => {
  const normalized = normalizeGcashFamilyScreenshotOcrText(text);
  return (
    /\bMy\s+Accounts\b/i.test(normalized) ||
    (/\bSAVINGS\s+ACCOUNTS\b/i.test(normalized) && /\bDEPOSIT\s+ACCOUNTS\b/i.test(normalized))
  );
};
