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

export const getInvestmentActivityUnits = (transaction: InvestmentActivityInput) => {
  const records = [asRecord(transaction.rawPayload), asRecord(transaction.normalizedPayload)];
  const structuredUnits = normalizeUnits(
    readFirstText(records, ["quantity", "units", "assetQuantity", "unitCount", "shares", "cryptoAmount"])
  );
  if (structuredUnits) return structuredUnits;

  const evidence = [transaction.merchantRaw, transaction.merchantClean, transaction.description]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  const parenthesized = evidence.match(/\((-?\d+(?:\.\d+)?)\s*(?:units?|shares?)?\)/i)?.[1];
  if (parenthesized) return normalizeUnits(parenthesized);
  const labelled = evidence.match(/(-?\d+(?:\.\d+)?)\s+(?:presumed\s+)?(?:crypto\s+)?(?:units?|shares?)\b/i)?.[1];
  return normalizeUnits(labelled ?? null);
};

const isGeneratedImportNote = (value: string) =>
  /^(?:crypto\s+(?:sale|purchase|trade)|(?:buy|sell|withdraw|trade)\s*[-:]\s*)/i.test(value) ||
  /\b(?:with amounts?|partially visible|visible digits|presumed .+ units?|source (?:text|row)|what was read|read from|parser confidence)\b/i.test(value);

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
