export type ImportedReceivableCommitmentCandidate = {
  title: string;
  amount: number;
  currency: string;
  balanceAsOfDate: string | null;
  confidence: number;
  status: "active" | "resolved";
};

type ImportedReceivableRow = {
  accountName?: unknown;
  currency?: unknown;
  confidence?: unknown;
  rawPayload?: unknown;
};

const toFiniteNumber = (value: unknown) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9.-]/g, ""))
        : Number.NaN;
  return Number.isFinite(numeric) ? numeric : null;
};

const readText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const buildImportedReceivableCommitmentCandidate = (
  rows: ImportedReceivableRow[]
): ImportedReceivableCommitmentCandidate | null => {
  const sourceRow = rows.find((row) => {
    const payload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    return (
      payload?.documentType === "account_inventory" &&
      payload?.kind === "account_snapshot_marker" &&
      payload?.accountType === "receivable" &&
      toFiniteNumber(payload.balance) !== null
    );
  });
  if (!sourceRow) {
    return null;
  }

  const payload = sourceRow.rawPayload as Record<string, unknown>;
  const rawBalance = toFiniteNumber(payload.balance);
  if (rawBalance === null) {
    return null;
  }

  const amount = Math.max(0, rawBalance);
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(toFiniteNumber(sourceRow.confidence) ?? 100))
  );

  return {
    title:
      readText(sourceRow.accountName) ??
      readText(payload.accountName) ??
      "Accounts Receivable",
    amount,
    currency:
      (
        readText(payload.accountCurrency) ??
        readText(sourceRow.currency) ??
        "PHP"
      ).toUpperCase(),
    balanceAsOfDate:
      readText(payload.balanceAsOfDate) ?? readText(payload.snapshotDate),
    confidence,
    status: amount > 0 ? "active" : "resolved",
  };
};
