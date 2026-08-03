type InvestmentActivityInput = {
  type: "income" | "expense" | "transfer";
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
};

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readFirstText = (records: Array<Record<string, unknown> | null>, keys: string[]) => {
  for (const record of records) {
    for (const key of keys) {
      const value = record?.[key];
      if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
        return String(value).trim();
      }
    }
  }
  return null;
};

const normalizeAction = (value: string) => {
  if (/\b(?:buy|bought|purchase|purchased)\b/i.test(value)) return "Buy";
  if (/\b(?:sell|sold|sale)\b/i.test(value)) return "Sell";
  if (/\b(?:trade|swap|convert|exchange)\b/i.test(value)) return "Trade";
  if (/\b(?:withdraw|withdrawal|cash out)\b/i.test(value)) return "Withdraw";
  if (/\b(?:deposit|cash in|funding)\b/i.test(value)) return "Deposit";
  if (/\bdividend\b/i.test(value)) return "Dividend";
  if (/\binterest\b/i.test(value)) return "Interest";
  return null;
};

export const getInvestmentActivityType = (transaction: InvestmentActivityInput) => {
  const records = [asRecord(transaction.rawPayload), asRecord(transaction.normalizedPayload)];
  const structuredAction = readFirstText(records, ["action", "transactionAction", "tradeType", "side"]);
  const evidence = [structuredAction, transaction.merchantClean, transaction.merchantRaw, transaction.description]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");

  return (
    normalizeAction(evidence) ??
    (transaction.type === "income" ? "Income" : transaction.type === "expense" ? "Expense" : "Transfer")
  );
};

const normalizeUnits = (value: string | null) => {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  return normalized.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
};

const getActivityRecords = (transaction: InvestmentActivityInput) => [
  asRecord(transaction.rawPayload),
  asRecord(transaction.normalizedPayload),
];

const getSourceLines = (transaction: InvestmentActivityInput) => {
  const sourceText = readFirstText(getActivityRecords(transaction), ["sourceLine", "sourceText", "line"]);
  return sourceText
    ? sourceText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
};

export const getInvestmentActivityAssetName = (transaction: InvestmentActivityInput) => {
  const structuredName = readFirstText(getActivityRecords(transaction), ["assetName", "fundName", "asset", "securityName"]);
  if (structuredName) return structuredName;

  const description = transaction.description?.trim() ?? "";
  const describedAsset =
    description.match(/\basset\s*:\s*([^.;]+)/i)?.[1]?.trim() ??
    description.match(/^crypto\s+(?:sale|purchase|trade)\s*:\s*([a-z][a-z0-9 .&'-]*?)(?=\s+-?\d|\s+with\b|[.;]|$)/i)?.[1]?.trim();
  if (describedAsset) return describedAsset;

  const merchantText = transaction.merchantRaw?.trim() || transaction.merchantClean?.trim() || "";
  const merchantAsset = merchantText
    .match(/^(?:buy|sell|trade|swap|convert|withdraw)\s+(.+?)(?:\s+-?\d+(?:\.\d+)?)?$/i)?.[1]
    ?.trim();
  if (merchantAsset) return merchantAsset;

  const sourceLines = getSourceLines(transaction);
  const actionIndex = sourceLines.findIndex((line) => /\b(?:buy|sell|trade|swap|convert|withdraw)\b/i.test(line));
  if (actionIndex >= 0) {
    const candidate = sourceLines
      .slice(actionIndex + 1)
      .find(
        (line) =>
          !/^(?:successful|failed|pending)$/i.test(line) &&
          !/^(?:php|usd|eur|gbp|jpy|aud|cad|sgd|hkd|cny|krw|inr|thb|idr|myr|vnd)\b/i.test(line) &&
          !/^-?\d[\d,]*(?:\.\d+)?$/.test(line)
      );
    if (candidate) return candidate;
  }

  return null;
};

export const getInvestmentActivityUnits = (transaction: InvestmentActivityInput) => {
  const records = getActivityRecords(transaction);
  const structuredUnits = normalizeUnits(
    readFirstText(records, ["quantity", "units", "assetQuantity", "unitCount", "shares", "cryptoAmount"])
  );
  if (structuredUnits) return structuredUnits;

  const sourceLineUnits = getSourceLines(transaction)
    .map((line) => normalizeUnits(line))
    .find((value): value is string => Boolean(value));
  if (sourceLineUnits) return sourceLineUnits;

  const evidence = [transaction.merchantRaw, transaction.merchantClean, transaction.description]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  const labelledQuantity = evidence.match(/\bquantity\s*:\s*(-?\d+(?:\.\d+)?)/i)?.[1];
  if (labelledQuantity) return normalizeUnits(labelledQuantity);
  const quotedAmount = evidence.match(/\bwith amounts?\s+["']?(-?\d+(?:\.\d+)?)/i)?.[1];
  if (quotedAmount) return normalizeUnits(quotedAmount);
  const parenthesized = evidence.match(/\((-?\d+(?:\.\d+)?)\s*(?:units?|shares?)?\)/i)?.[1];
  if (parenthesized) return normalizeUnits(parenthesized);
  const labelled = evidence.match(/(-?\d+(?:\.\d+)?)\s+(?:presumed\s+)?(?:[a-z0-9-]+\s+)?(?:units?|shares?)\b/i)?.[1];
  if (labelled) return normalizeUnits(labelled);
  const merchantUnits = transaction.merchantRaw?.match(/\b(?:buy|sell|trade|swap|convert)\s+.+?\s+(-?\d+(?:\.\d+)?)$/i)?.[1];
  return normalizeUnits(merchantUnits ?? null);
};

const isGeneratedImportNote = (value: string) =>
  /^(?:crypto\s+(?:sale|purchase|trade|buy|sell)|row shows\s*:|(?:buy|sell|withdraw|trade)\s*[-:]\s*)/i.test(value) ||
  /\b(?:with amounts?|partially visible|visible digits|presumed .+ units?|source (?:text|row)|what was read|read from|parser confidence|screenshot label|quantity\s*:|status\s*:)/i.test(value);

export const getInvestmentActivityNote = (transaction: InvestmentActivityInput) => {
  const records = [asRecord(transaction.normalizedPayload), asRecord(transaction.rawPayload)];
  const structuredNote = readFirstText(records, ["userNote", "userNotes", "note", "notes"]);
  if (structuredNote && !isGeneratedImportNote(structuredNote)) return structuredNote;

  const description = transaction.description?.trim() ?? "";
  return description && !isGeneratedImportNote(description) ? description : null;
};

export const getInvestmentActivityAmountTone = (transaction: InvestmentActivityInput) => {
  const action = getInvestmentActivityType(transaction);
  if (["Sell", "Dividend", "Interest", "Deposit", "Income"].includes(action)) return "positive";
  if (["Buy", "Withdraw", "Expense"].includes(action)) return "negative";
  return "neutral";
};
