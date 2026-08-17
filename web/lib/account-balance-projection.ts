import { prefersLiveInvestmentBalance } from "@/lib/investment-balance";

type BalanceValue = { toString(): string } | string | number | null | undefined;
type DateValue = Date | string | null | undefined;

export type AccountBalanceCheckpoint = {
  createdAt: DateValue;
  statementEndDate?: DateValue;
  sourceMetadata?: unknown;
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

  return toTimestamp(checkpoint.statementEndDate) || toTimestamp(checkpoint.createdAt);
};

export const selectLatestAccountCheckpoint = <T extends AccountBalanceCheckpoint>(checkpoints: T[]) => {
  let latest: T | null = null;
  let latestEffectiveTime = -1;
  let latestCreatedTime = -1;

  for (const checkpoint of checkpoints) {
    const effectiveTime = getAccountCheckpointEffectiveTime(checkpoint);
    const createdTime = toTimestamp(checkpoint.createdAt);
    if (
      effectiveTime > latestEffectiveTime ||
      (effectiveTime === latestEffectiveTime && createdTime >= latestCreatedTime)
    ) {
      latest = checkpoint;
      latestEffectiveTime = effectiveTime;
      latestCreatedTime = createdTime;
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
