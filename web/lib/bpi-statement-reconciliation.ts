import { parseDateValue, type DetectedStatementMetadata, type ParsedImportRow } from "@/lib/import-parser";

export const BPI_RECONCILIATION_VERSION = "bpi-header-reconciliation-v1";
export const isBpiCardMetadata = (metadata: { accountType?: string | null; institution?: string | null }) =>
  metadata.accountType === "credit_card" && /^(BPI|Bank of the Philippine Islands)$/i.test(metadata.institution ?? "");

// This is an evidence check, not a balance setter. A closing amount equal to
// purchases does not independently establish an unprinted zero opening balance.
export function assessBpiStatementReconciliation(text: string, metadata: DetectedStatementMetadata, rows: ParsedImportRow[]) {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  const previous = [...compact.matchAll(/PREVIOUSBALANCE:?(?:PHP|₱)?([0-9,]+\.\d{2})/g)].map(m => Number(m[1].replace(/,/g, "")));
  const endings = [...compact.matchAll(/(?:TOTALAMOUNTDUE|ENDINGBALANCE):?(?:PHP|₱)?([0-9,]+\.\d{2})/g)].map(m => Number(m[1].replace(/,/g, "")));
  const dates = rows.map(row => parseDateValue(row.date ?? null)).filter((date): date is Date => Boolean(date));
  const cents = (value: unknown) => value !== null && value !== undefined && String(value).trim() && Number.isFinite(Number(value))
    ? Math.round(Number(value) * 100) : null;
  const opening = cents(metadata.openingBalance), ending = cents(metadata.endingBalance);
  let reason: string | null = null;
  let code = "BALANCE_RECONCILED";
  let status: "pending" | "reconciled" | "mismatch" = "pending";
  let expectedEndingBalance: number | null = null;
  if (!isBpiCardMetadata(metadata)) {
    code = "UNSUPPORTED_STATEMENT"; reason = "This reconciliation requires a BPI credit-card statement.";
  } else if (new Set(endings).size > 1 || new Set(previous).size > 1) {
    code = "CONFLICTING_HEADERS"; reason = "The source contains conflicting balance headers. Review the statement.";
  } else if (ending === null || endings.length === 0 || cents(endings[0]) !== ending) {
    code = "MISSING_ENDING_BALANCE"; reason = "The statement ending balance could not be verified from its source header.";
  } else if (rows.length === 0 || dates.length !== rows.length || rows.some(row => cents(row.amount) === null || !["expense", "income"].includes(row.type ?? "") || (row.currency ?? metadata.currency) !== metadata.currency)) {
    code = "UNRESOLVED_LEDGER"; reason = "Every statement row needs a date, amount, direction and matching currency before reconciliation.";
  } else if (opening === null || previous.length === 0 || cents(previous[0]) !== opening) {
    code = "MISSING_OPENING_BALANCE"; reason = "Ending balance captured. The source does not state a verified opening balance; full reconciliation needs that evidence. No zero opening balance was assumed.";
  } else {
    const expected = rows.reduce((balance, row) => balance + (row.type === "expense" ? 1 : -1) * Math.abs(cents(row.amount)!), opening);
    expectedEndingBalance = expected / 100;
    status = expected === ending ? "reconciled" : "mismatch";
    if (status === "mismatch") { code = "BALANCE_MISMATCH"; reason = "The printed opening balance and statement movements do not equal the printed ending balance."; }
  }
  return {
    version: BPI_RECONCILIATION_VERSION, status, code, reason,
    balanceReconciled: status === "reconciled", expectedEndingBalance,
    openingBalance: metadata.openingBalance, endingBalance: metadata.endingBalance,
    // Transaction coverage is distinct from the bill and payment dates.
    statementStartDate: dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))).toISOString() : null,
    statementEndDate: dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))).toISOString() : null,
    rowCount: rows.length, confidence: status === "reconciled" ? metadata.confidence : null,
    reviewRequired: status !== "reconciled",
  };
}
