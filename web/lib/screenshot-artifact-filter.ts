const SCREENSHOT_UI_ARTIFACT_NAME_PATTERN =
  /^(?:accounts?|account details|transaction history|recent transactions|past transactions|open orders|my deposit accounts|view other accounts|view all(?: transactions)?|dashboard|goals|all|received|sent|download|manage(?: my account)?|add\s*\/\s*manage|deposit accounts|transactions?|available balance|current balance|total balance|outstanding balance|amount due|send money|receive money|pay bills|buy load|mailbox|logout|more|home|profile|qr|today|yesterday|wallet|trading wallet|deposit|credit card|time deposit|portfolio|market|successful|tap to see more|powered by pdax|(?:cash\s+in|cash\s+out|deposit|send)(?:\s+(?:cash\s+in|cash\s+out|deposit|send)){1,3})$/i;

const SCREENSHOT_DATE_FRAGMENT_PATTERN =
  /^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{1,2})?(?:,?\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}[/-]\d{2}[/-]\d{2}|(?:to\s+)?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)(?:\s*[-–—]\s*)?$/i;

const SCREENSHOT_EVIDENCE_ARTIFACT_PATTERN =
  /\b(?:transaction history|recent transactions|past transactions|open orders|account details|my deposit accounts|deposit accounts|view other accounts|view all(?: transactions)?|available balance|current balance|total balance|outstanding balance|amount due|dashboard|goals|download|manage(?: my account)?|mailbox|logout|send money|receive money|pay bills|buy load|home|profile|qr|today|yesterday|market|portfolio|tap to see more|powered by pdax)\b/i;

export const normalizeScreenshotArtifactText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;

export const isLikelyScreenshotDateFragment = (value?: string | null) => {
  const normalized = normalizeScreenshotArtifactText(value);
  return Boolean(normalized && SCREENSHOT_DATE_FRAGMENT_PATTERN.test(normalized));
};

export const isLikelyScreenshotUiArtifactText = (value?: string | null) => {
  const normalized = normalizeScreenshotArtifactText(value);
  if (!normalized) {
    return true;
  }

  return (
    SCREENSHOT_UI_ARTIFACT_NAME_PATTERN.test(normalized) ||
    SCREENSHOT_DATE_FRAGMENT_PATTERN.test(normalized) ||
    /^(?:php|usd|eur|gbp|cad|aud|sgd|jpy|cny|thb|hkd|aed|chf|nzd)$/i.test(normalized) ||
    /^(?:php|usd|eur|gbp|cad|aud|sgd|jpy|cny|thb|hkd|aed|chf|nzd)\s+[0-9][0-9,]*\.\d{2}$/i.test(normalized)
  );
};

export const screenshotEvidenceContainsUiArtifact = (value?: string | null) => {
  const normalized = normalizeScreenshotArtifactText(value);
  return Boolean(normalized && SCREENSHOT_EVIDENCE_ARTIFACT_PATTERN.test(normalized));
};
