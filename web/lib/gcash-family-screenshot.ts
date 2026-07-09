const normalizeInlineWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export type GcashFamilyScreenshotScreenType =
  | "gsave_overview"
  | "gsave_account_list"
  | "gfunds_transaction_history"
  | "gcrypto_transaction_history"
  | "gcash_wallet_history"
  | "unknown";

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

export const classifyGcashFamilyScreenshotScreen = (text: string): GcashFamilyScreenshotScreenType => {
  const normalized = normalizeGcashFamilyScreenshotOcrText(text);
  const compact = normalizeInlineWhitespace(normalized);
  if (!compact) {
    return "unknown";
  }

  if (gsaveScreenshotExpectsMultipleAccounts(compact)) {
    return /\bSAVINGS\s+ACCOUNTS\b/i.test(compact) && /\bDEPOSIT\s+ACCOUNTS\b/i.test(compact)
      ? "gsave_account_list"
      : "gsave_overview";
  }

  if (
    /\bTransaction History\b/i.test(compact) &&
    /(buy order completed|sell order completed)/i.test(compact) &&
    /\bATRAM\b|\bPhilippine Stock Index Fund \(Units\)\b/i.test(compact)
  ) {
    return "gfunds_transaction_history";
  }

  if (
    /\bGCrypto\b/i.test(compact) &&
    /\bTransaction History\b/i.test(compact) &&
    /\bPast Transactions\b/i.test(compact) &&
    /\b(?:Buy|Sell|Withdraw)\b/i.test(compact)
  ) {
    return "gcrypto_transaction_history";
  }

  if (
    /\bGCash\b/i.test(compact) &&
    /\bTransaction History\b/i.test(compact) &&
    /\b(?:Send Money|Cash In|Received|Payment|Transfer)\b/i.test(compact)
  ) {
    return "gcash_wallet_history";
  }

  return "unknown";
};

export const estimateGcashFamilyScreenshotVisibleEntries = (text: string) => {
  const normalized = normalizeGcashFamilyScreenshotOcrText(text);
  const screenType = classifyGcashFamilyScreenshotScreen(normalized);
  const compact = normalizeInlineWhitespace(normalized);

  switch (screenType) {
    case "gsave_overview":
    case "gsave_account_list": {
      const productMatches = compact.match(
        /\b(?:GSave|CIMB|#UNOready@GCash|#UNOboost@GCash|UNO Digital Bank)\b/gi
      );
      const accountSuffixMatches = compact.match(/(?:\.\.\.|\bAcct\b|\bAccount\b)\s*\d{4}\b/gi);
      return Math.max(
        0,
        Math.max(
          accountSuffixMatches?.length ?? 0,
          productMatches ? Math.min(productMatches.length, 6) : 0
        )
      );
    }
    case "gfunds_transaction_history":
      return compact.match(/\b(?:Buy|Sell)\s+Order\s+Completed\b/gi)?.length ?? 0;
    case "gcrypto_transaction_history":
      return compact.match(/\b(?:Buy|Sell|Withdraw)\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s+Successful\b/gi)?.length ?? 0;
    case "gcash_wallet_history":
      return compact.match(/\b(?:Today|Yesterday|[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/gi)?.length ?? 0;
    default:
      return 0;
  }
};
