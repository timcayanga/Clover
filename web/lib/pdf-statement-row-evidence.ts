import { parseDateValue } from "./import-parser";
import type { PdfStatementContinuation } from "./pdf-statement-layout";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const dateToken = /^(?:\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[-/.]\s*\d{1,2}[-/.]\s*\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:\d{1,2}[- ]\p{L}{3,12}|\p{L}{3,12}[- ]\d{1,2})(?:[- ,]+\d{4}(?![\d.,]))?)(?=\s|\||$)/iu;
const disclosure = /\b(?:opening|ending|closing|previous|beginning|brought forward|carried forward)\s+balance\b|\bbalance\s+(?:brought|carried)\s+forward\b|\b(?:balance plug|reconciliation adjustment|balancing entry|saldo awal|saldo akhir)\b/i;
const accountField = /\b(?:(?:bank\s+)?a\/?c|account|card|(?:no\.?\s+|nomor\s+)?rekening(?:\s+seabank)?|kartu)\s*(?:no\.?|number|nomor|#\s*)?\s*[:#]?\s*((?:[\dXx*•●][ -]?){4,30})(?![\d.,])/gi;
const number = (value: string) => value.normalize("NFKC").toUpperCase().replace(/[•●X]/g, "*").replace(/[ -]/g, "");
const words = (value: string) => value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
const generic = /^(?:the|of|and|pos|card|purchase|payment|debit|credit|transaction|transfer|fee|php|usd|idr|myr|sgd|thb|krw)$/;
const amountToken = /(?<![\p{L}\d.,:/])\d(?:[\d.,]*\d)?(?![\p{L}\d.,:/])/gu;
const referenceField = /\b(?:ref(?:erence)?|approval|authorization|trace)\s*(?:no\.?|number|code|id)?\s*[:#]?\s+[A-Z0-9-]+\b/gi;

function printedAmounts(text: string) {
  return [...text.replace(referenceField, " ").matchAll(amountToken)].map(([token]) => {
    const decimal = token.match(/[.,](\d{1,2})$/);
    if (!decimal) return Number(token.replace(/[.,]/g, ""));
    const integral = token.slice(0, -decimal[0].length).replace(/[.,]/g, "");
    return Number(`${integral}.${decimal[1]}`);
  });
}

function datePrefix(line: string) {
  return line.match(dateToken)?.[0] ?? null;
}

function datesAgree(observed: string, expected: string) {
  const day = expected.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const hasYear = /\b\d{4}\b|\d{4}\s*년|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2}$/.test(observed);
  const value = hasYear ? observed : `${observed.replace(/-/g, " ")} ${day.slice(0, 4)}`;
  for (const spelling of [value, value.replace(/^(\d{1,2})\/(\d{1,2})\//, "$2/$1/")]) {
    const parsed = parseDateValue(spelling);
    if (parsed && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === day) return true;
  }
  return false;
}

export function assessPdfStatementRowEvidence(pages: readonly string[], rows: readonly Record<string, unknown>[], accountNumber?: unknown, continuations: readonly PdfStatementContinuation[] = []) {
  const continuationPages = new Map(continuations.map(span => [`${span.page}:${span.line}`, span.continuationPage]));
  // BPI cards print their ledger identity as Customer Number. This is an
  // institution-specific printed label, not permission to accept customer IDs
  // from unrelated invoices or infer a card number from a suffix.
  const bpiCustomerField = /^Customer\s+(?:Number|No\.?)\s*[:#]?\s*((?:[\dXx*•●][ -]?){4,30})(?![\d.,])/gi;
  const printedAccounts = new Set<string>();
  let activeAccounts = new Set<string>();
  let trailingBalance = false;
  const byAmount = new Map<number, Array<{
    page: number; line: number; text: string; date: string; accounts: ReadonlySet<string>;
  }>>();

  for (const [index, page] of pages.entries()) {
    const bpiCardStatement = /^\s*(?:BPI|BANK OF THE PHILIPPINE ISLANDS)\b[^\n]*(?:CREDIT CARD|SIGNATURE)\b/im.test(page);
    const lines = page.normalize("NFKC").split(/\r?\n/).map(line => line.trim());
    const header = lines.find(line => /^(?:date|tanggal|transaction date|posting date)\b.*\b(?:debit|credit|amount|withdrawals?|deposits?)\b/i.test(line));
    if (header) trailingBalance = /\b(?:running\s+)?balance\s*$/i.test(header);
    for (const [offset, line] of lines.entries()) {
      const accountHeader = [
        ...line.matchAll(accountField),
        ...(bpiCardStatement ? line.matchAll(bpiCustomerField) : []),
      ].map(match => number(match[1]));
      if (accountHeader.length && !datePrefix(line)) {
        accountHeader.forEach(value => printedAccounts.add(value));
        activeAccounts = new Set(accountHeader);
      }
      const date = datePrefix(line);
      if (!date || disclosure.test(line)) continue;
      let body = line.slice(date.length).trimStart();
      const postingDate = datePrefix(body);
      if (postingDate) body = body.slice(postingDate.length);
      const continuation: string[] = [];
      for (const next of lines.slice(offset + 1, offset + 3)) {
        if (!next || datePrefix(next) || disclosure.test(next) || /^(?:page|halaman)\s+\d/i.test(next) || [...next.matchAll(accountField)].length) break;
        continuation.push(next);
      }
      // Wrapped rows may put the description or all amount columns on the next line.
      const rowText = [body, ...continuation].join(" ");
      const baseAmounts = printedAmounts(body);
      const amounts = baseAmounts.length ? baseAmounts : printedAmounts(continuation.join(" "));
      const movements = trailingBalance && amounts.length > 1 ? amounts.slice(0, -1) : amounts;
      const entry = { page: index + 1, line: offset + 1, text: rowText, date, accounts: activeAccounts };
      for (const amount of new Set(movements)) {
        const bucket = byAmount.get(amount) ?? [];
        bucket.push(entry);
        byAmount.set(amount, bucket);
      }
    }
  }

  const documentAccount = typeof accountNumber === "string" && accountNumber.trim() ? number(accountNumber) : null;
  const consumed = new Set<string>();
  const issues: Array<{ row: number; reason: string; page?: number }> = [];
  const evidence = rows.map((row, index) => {
    const raw = record(row.rawPayload);
    const date = typeof row.date === "string" ? row.date : row.date instanceof Date && Number.isFinite(+row.date) ? row.date.toISOString() : null;
    const value = Number(row.amount ?? NaN);
    const account = [row.accountNumber, raw.accountNumber].filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map(number);
    if (!account.length && documentAccount) account.push(documentAccount);
    const identities = [row.merchantRaw, row.description, row.merchantClean].flatMap(label => {
      const tokens = typeof label === "string" ? words(label).filter(word => !generic.test(word)) : [];
      return tokens.length > 1 || tokens[0]?.length >= 4 ? [tokens] : [];
    });
    const parserEvidence = raw.parserEvidence as { page?: unknown } | undefined;
    const claimedPage = typeof parserEvidence?.page === "number" ? parserEvidence.page : null;
    const explicitPlug = /(?:balance[ _-]plug|synthetic[ _-]balance|reconciliation[ _-]adjustment)/i.test(String(raw.kind ?? raw.source ?? ""));
    const eligible = !explicitPlug && Number.isFinite(value) && value !== 0 && identities.length > 0;
    const plausible = eligible ? (byAmount.get(Math.abs(value)) ?? []).filter(candidate => {
      if (claimedPage !== null && candidate.page !== claimedPage) return false;
      const visible = new Set(words(candidate.text));
      return identities.some(tokens => tokens.every(word => visible.has(word)));
    }) : [];
    const accountMatches = plausible.filter(candidate => account.every(id => candidate.accounts.has(id)));
    const candidates = date ? accountMatches.filter(candidate => datesAgree(candidate.date, date)) : [];
    const match = candidates.find(candidate => !consumed.has(`${candidate.page}:${candidate.line}`));
    if (!match) {
      const unprintedAccount = account.some(id => !printedAccounts.has(id));
      const accountConflict = plausible.length > 0 && account.length > 0 && !accountMatches.length;
      const dateConflict = accountMatches.length > 0 && !candidates.length;
      const reason = explicitPlug ? "synthetic_balance_row"
        : unprintedAccount || accountConflict ? "unverified_account_number"
        : dateConflict ? "unverified_transaction_date" : "unverified_row_occurrence";
      const pages = [...new Set(plausible.map(candidate => candidate.page))];
      issues.push({ row: index + 1, reason, ...(pages.length === 1 ? { page: pages[0] } : {}) });
      return null;
    }
    consumed.add(`${match.page}:${match.line}`);
    const continuationPage = continuationPages.get(`${match.page}:${match.line}`);
    return { page: match.page, line: match.line, ...(continuationPage ? { continuationPage } : {}) };
  });
  if (documentAccount && !printedAccounts.has(documentAccount)) issues.push({ row: 0, reason: "unverified_account_number" });
  return { complete: issues.length === 0, issues, evidence };
}
