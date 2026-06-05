const MAX_TRANSACTION_TAGS = 20;
const MAX_TRANSACTION_TAG_LENGTH = 40;

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const normalizeTransactionTagKey = (value: string) => collapseWhitespace(value).toLowerCase();

export const sanitizeTransactionTagName = (value: string) => collapseWhitespace(value).slice(0, MAX_TRANSACTION_TAG_LENGTH);

export const sanitizeTransactionTagNames = (values: readonly string[]) => {
  const next: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = sanitizeTransactionTagName(value);
    if (!cleaned) {
      continue;
    }

    const normalized = normalizeTransactionTagKey(cleaned);
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    next.push(cleaned);

    if (next.length >= MAX_TRANSACTION_TAGS) {
      break;
    }
  }

  return next;
};

export const getTransactionTagSignature = (values: readonly string[]) =>
  sanitizeTransactionTagNames(values)
    .map((value) => normalizeTransactionTagKey(value))
    .join("|");
