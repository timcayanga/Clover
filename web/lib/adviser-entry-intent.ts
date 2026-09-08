import {
  entryTransaction,
  type EntryDraft,
  type EntryFormContext,
} from "./adviser-entry-types";
export function simpleEntryRows(question: string, context?: EntryFormContext) {
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
    context?.kind === "receipt"
  )
    return null;
  const rows = [];
  for (const [index, line] of lines.entries()) {
    const match = line.match(
      /^([\p{L}][\p{L}\p{N} '&()./-]{0,120}?)\s+(?:(PHP|USD|EUR|GBP)\s*)?(\d{1,12}(?:\.\d{1,2})?)(?:\s+(\d{4}-\d{2}-\d{2}))?$/u,
    );
    if (!match) return null;
    rows.push({
      ...entryTransaction(`row-${index + 1}`),
      merchant: match[1],
      amount: match[3],
      date: match[4] || context?.fields.date?.slice(0, 10) || "",
      currency: match[2] || context?.fields.currency || "",
      accountId: context?.fields.accountId || "",
      type:
        context?.fields.type === "income"
          ? ("income" as const)
          : ("expense" as const),
    });
  }
  return rows;
}
export function isEntryRequest(
  question: string,
  context?: EntryFormContext,
  draft?: EntryDraft,
) {
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
