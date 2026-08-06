import {
  getInvestmentActivityAssetName,
  getInvestmentActivityType,
  getInvestmentActivityUnits,
} from "@/lib/investment-activity";

export type ManualInvestmentActivityInput = {
  id: string;
  accountId: string;
  date: string;
  createdAt: string;
  type: "income" | "expense" | "transfer";
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  source?: "upload" | "manual" | string;
};

export type ManualInvestmentPositionActivity = {
  transactionId: string;
  accountId: string;
  assetName: string;
  normalizedAssetName: string;
  unitsDelta: number;
  tradeDate: string;
  recordedAt: string;
};

export const normalizeInvestmentPositionName = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isManualInvestmentActivity = (transaction: ManualInvestmentActivityInput) => {
  if (transaction.source === "manual") return true;
  if (!transaction.rawPayload || typeof transaction.rawPayload !== "object" || Array.isArray(transaction.rawPayload)) {
    return false;
  }
  return (transaction.rawPayload as Record<string, unknown>).source === "manual";
};

export const getInvestmentPositionActivities = (
  transactions: ManualInvestmentActivityInput[],
  options: { manualOnly?: boolean } = {}
): ManualInvestmentPositionActivity[] =>
  transactions.flatMap((transaction) => {
    if (options.manualOnly && !isManualInvestmentActivity(transaction)) return [];

    const assetName = getInvestmentActivityAssetName(transaction)?.trim() ?? "";
    const normalizedAssetName = normalizeInvestmentPositionName(assetName);
    const units = Number(getInvestmentActivityUnits(transaction));
    const action = getInvestmentActivityType(transaction);
    if (!assetName || !normalizedAssetName || !Number.isFinite(units) || units <= 0) return [];
    if (action !== "Buy" && action !== "Sell") return [];

    return [{
      transactionId: transaction.id,
      accountId: transaction.accountId,
      assetName,
      normalizedAssetName,
      unitsDelta: action === "Sell" ? -units : units,
      tradeDate: transaction.date,
      recordedAt: transaction.createdAt,
    }];
  });

export const getManualInvestmentPositionActivities = (
  transactions: ManualInvestmentActivityInput[]
): ManualInvestmentPositionActivity[] => getInvestmentPositionActivities(transactions, { manualOnly: true });

export const sumManualInvestmentUnits = (
  activities: ManualInvestmentPositionActivity[],
  params: { accountId: string; assetName: string; recordedAfter?: string | null }
) => {
  const normalizedAssetName = normalizeInvestmentPositionName(params.assetName);
  const recordedAfter = params.recordedAfter ? new Date(params.recordedAfter).getTime() : null;
  return activities.reduce((sum, activity) => {
    if (activity.accountId !== params.accountId || activity.normalizedAssetName !== normalizedAssetName) return sum;
    if (recordedAfter !== null) {
      const recordedAt = new Date(activity.recordedAt).getTime();
      if (!Number.isFinite(recordedAt) || recordedAt <= recordedAfter) return sum;
    }
    return sum + activity.unitsDelta;
  }, 0);
};

export const getFirstManualInvestmentDate = (
  activities: ManualInvestmentPositionActivity[],
  params: { accountId: string; assetName: string }
) => {
  const normalizedAssetName = normalizeInvestmentPositionName(params.assetName);
  return activities
    .filter(
      (activity) =>
        activity.accountId === params.accountId &&
        activity.normalizedAssetName === normalizedAssetName &&
        activity.unitsDelta > 0
    )
    .map((activity) => activity.tradeDate)
    .sort()[0] ?? null;
};
