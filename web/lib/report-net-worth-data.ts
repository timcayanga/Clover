import { normalizeAccountBalanceSign } from "@/lib/account-balance";
import { getAccountCheckpointEffectiveTime, isAccountBalanceCheckpointEvidence, type AccountBalanceCheckpoint } from "@/lib/account-balance-projection";

export type ReportNetWorthAccount = {
  type: string;
  currency: string;
  statementCheckpoints: Array<AccountBalanceCheckpoint & { endingBalance: unknown }>;
};

// Keep dated evidence and complete-account coverage; never infer missing balances.
export function buildReportNetWorth(allAccounts: readonly ReportNetWorthAccount[], currency: string, from: Date, to: Date) {
  const accounts = allAccounts.filter(account => account.currency === currency);
  const histories = accounts.map((account) => ({
    type: account.type,
    points: account.statementCheckpoints
      .filter(isAccountBalanceCheckpointEvidence)
      .map((point) => ({
        time: getAccountCheckpointEffectiveTime(point),
        balance: Number(point.endingBalance),
      }))
      .filter((point) => point.time > 0 && Number.isFinite(point.balance))
      .sort((a, b) => a.time - b.time),
  }));
  const dates = [
    ...new Set(
      histories.flatMap((account) => account.points.map((point) => point.time)),
    ),
  ]
    .filter((time) => time >= +from && time <= +to)
    .sort((a, b) => a - b);
  const points = dates.flatMap((time) => {
    const values = histories.map((account) => {
      const point = account.points.filter((point) => point.time <= time).at(-1);
      return point
        ? normalizeAccountBalanceSign(account.type, point.balance)
        : null;
    });
    return values.length && values.every((value) => value !== null)
      ? [
          {
            date: new Date(time).toISOString().slice(0, 10),
            balance: values.reduce<number>(
              (total, value) => total + (value ?? 0),
              0,
            ),
          },
        ]
      : [];
  });
  return {
    points: [...new Map(points.map((point) => [point.date, point])).values()],
    accountCount: accounts.length,
  };
}
