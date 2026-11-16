import {
  entryTransaction,
  type EntryDraft,
  type EntryFormContext,
} from "./adviser-entry-types";
export function simpleEntryCandidates(question: string, context?: EntryFormContext) {
  const lines = question
    .trim()
    .replace(
      /^(?:add|record|log)\s+(?:these\s+)?(?:transactions?|expenses?)\s*:?\s*/i,
      "",
    )
    .split(/[\n;]/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    !lines.length ||
    lines.length > 50 ||
    context?.kind === "account" ||
    context?.kind === "investment" ||
    context?.kind === "receipt" || context?.kind === "recurring" || context?.kind === "split" || context?.kind === "trade"
  )
    return null;
  const rows = [];
  for (const [index, line] of lines.entries()) {
    const accountSuffix = line.match(/\s+(?:from|using|with|paid with)\s+([\p{L}][\p{L}\p{N} '&()./-]{0,120})$/iu);
    const entryText = accountSuffix ? line.slice(0, accountSuffix.index) : line;
    const amount = "((?:\\d{1,3}(?:,\\d{3})+|\\d{1,12})(?:\\.\\d{1,2})?)";
    const currency = "(?:(PHP|USD|EUR|GBP|SGD|HKD|AUD|CAD|IDR|KRW|JPY|₱|₩)\\s*)?";
    const name = "([\\p{L}][\\p{L}\\p{N} '&()./-]{0,120}?)";
    const amountFirst = entryText.match(new RegExp(`^${currency}${amount}\\s+(?:at|for)\\s+${name}$`, "iu"));
    const match = amountFirst ? [amountFirst[0], amountFirst[3], amountFirst[1], amountFirst[2], undefined] :
      entryText.match(new RegExp(`^${name}\\s+${currency}${amount}(?:\\s+(\\d{4}-\\d{2}-\\d{2}))?$`, "iu"));
    if (!match) return null;
    const explicitCurrency = match[2] === "₱" ? "PHP" : match[2] === "₩" ? "KRW" : match[2]?.toUpperCase();
    const normalizedAmount = match[3]!.replace(/,/g, "");
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalizedAmount)) return null;
    rows.push({ accountName: accountSuffix?.[1].trim() || "", explicitCurrency, transaction: {
      ...entryTransaction(`row-${index + 1}`),
      merchant: match[1]!,
      amount: normalizedAmount,
      date: match[4] || context?.fields.date?.slice(0, 10) || "",
      currency: explicitCurrency || context?.fields.currency || "",
      accountId: accountSuffix ? "" : context?.fields.accountId || "",
      type:
        context?.fields.type === "income"
          ? ("income" as const)
          : ("expense" as const),
    } });
  }
  return rows;
}
export function simpleEntryRows(question: string, context?: EntryFormContext) {
  return simpleEntryCandidates(question, context)?.map(candidate => candidate.transaction) ?? null;
}
export function isEntryRequest(
  question: string,
  context?: EntryFormContext,
  draft?: EntryDraft,
) {
  if (context?.kind === "account" || context?.kind === "investment") return true;
  if (context?.kind === "recurring" || context?.kind === "split" || context?.kind === "trade") return true;
  if (
    draft &&
    !/\b(?:weather|joke|poem|politics|recipe|write code)\b/i.test(question)
  )
    return true;
  if (context && /^\s*\d[\d,.]*(?:\s*[A-Z]{3})?\s*$/.test(question))
    return true;
  if (
    /\b(?:add|create|record|log|enter)\b[\s\S]*\b(?:transactions?|expenses?|accounts?|investments?|receipts?|items?|holdings?)\b/i.test(
      question,
    )
  )
    return true;
  if (/\bI (?:paid|spent|bought)\b/i.test(question) && /\d/.test(question))
    return true;
  if (
    (context || draft) &&
    /^(?:use|change|make|set|remove|add|put|include|replace|actually)\b/i.test(
      question.trim(),
    )
  )
    return true;
  return Boolean(simpleEntryRows(question, context));
}
