import { prefersLiveInvestmentBalance } from "@/lib/investment-balance";

type BalanceValue = { toString(): string } | string | number | null | undefined;

const toBalanceString = (value: BalanceValue) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
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
