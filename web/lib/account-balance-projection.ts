import { prefersLiveInvestmentBalance } from "@/lib/investment-balance";

type BalanceValue = { toString(): string } | string | number | null | undefined;
type DateValue = Date | string | null | undefined;

export type AccountBalanceCheckpoint = {
  createdAt: DateValue;
  statementEndDate?: DateValue;
  sourceMetadata?: unknown;
};

const NON_BALANCE_IMPORT_MODES = new Set(["receipt", "transfer_receipt", "notes", "split_bill"]);

export const isAccountBalanceCheckpointEvidence = (checkpoint: Pick<AccountBalanceCheckpoint, "sourceMetadata">) => {
  const sourceMetadata =
    checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
      ? (checkpoint.sourceMetadata as Record<string, unknown>)
      : null;
  const documentType = String(sourceMetadata?.importMode ?? sourceMetadata?.documentType ?? "")
    .trim()
    .toLowerCase();

  // Receipts and notes create transactions, not point-in-time account
  // balances. Legacy imports retained checkpoint rows for progress/audit
  // metadata; those rows must never override the ledger projection.
  return !NON_BALANCE_IMPORT_MODES.has(documentType);
};

const toBalanceString = (value: BalanceValue) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
};

const toTimestamp = (value: DateValue) => {
  if (!value) return 0;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

/**
 * Statements are effective on their statement end date, not the day the file
 * happened to be uploaded. Point-in-time screenshots and other imports without
 * a statement period use their capture/import time instead.
 */
export const getAccountCheckpointEffectiveTime = (checkpoint: AccountBalanceCheckpoint) => {
  const sourceMetadata =
    checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
      ? (checkpoint.sourceMetadata as Record<string, unknown>)
      : null;
  const importMode = typeof sourceMetadata?.importMode === "string" ? sourceMetadata.importMode.trim() : null;

  if (importMode && importMode !== "statement") {
    return toTimestamp(checkpoint.createdAt);
  }

  const statementEndTime = toTimestamp(checkpoint.statementEndDate);
  if (statementEndTime) {
    return statementEndTime;
  }

  // A legacy statement with no period is undated financial evidence. Its
  // upload time must not outrank a statement that has an explicit statement
  // date; doing so can make an older balance replace a freshly imported one.
  // `selectLatestAccountCheckpoint` still uses createdAt to order multiple
  // undated statements when no stronger date exists.
  return importMode === "statement" ? 0 : toTimestamp(checkpoint.createdAt);
};

export const compareAccountCheckpointFreshness = (
  left: AccountBalanceCheckpoint,
  right: AccountBalanceCheckpoint
) => {
  const effectiveDifference =
    getAccountCheckpointEffectiveTime(left) - getAccountCheckpointEffectiveTime(right);
  if (effectiveDifference !== 0) {
    return effectiveDifference;
  }

  return toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
};

export const selectLatestAccountCheckpoint = <T extends AccountBalanceCheckpoint>(checkpoints: T[]) => {
  let latest: T | null = null;

  for (const checkpoint of checkpoints) {
    if (!isAccountBalanceCheckpointEvidence(checkpoint)) {
      continue;
    }
    if (!latest || compareAccountCheckpointFreshness(checkpoint, latest) >= 0) {
      latest = checkpoint;
    }
  }

  return latest;
};

/**
 * Reconciled statement checkpoints are authoritative for cash and liability
 * accounts. Investment accounts remain tied to their live holding valuation,
 * because an imported portfolio checkpoint is only a point-in-time snapshot.
 * Every read surface must use this rule so list and detail views cannot drift.
 */
export const resolveEffectiveAccountBalance = (params: {
  accountType: string | null | undefined;
  liveBalance: BalanceValue;
  checkpointStatus?: string | null;
  checkpointBalance?: BalanceValue;
}) => {
  const liveBalance = toBalanceString(params.liveBalance);
  const checkpointBalance = toBalanceString(params.checkpointBalance);
  if (prefersLiveInvestmentBalance(params.accountType)) {
    return liveBalance;
  }

  if (params.checkpointStatus !== "mismatch" && checkpointBalance !== null) {
    return checkpointBalance;
  }

  return liveBalance;
};

export const balancesMatch = (left: BalanceValue, right: BalanceValue) => {
  const leftValue = Number(toBalanceString(left));
  const rightValue = Number(toBalanceString(right));
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return toBalanceString(left) === toBalanceString(right);
  }
  return Math.abs(leftValue - rightValue) < 0.005;
};
