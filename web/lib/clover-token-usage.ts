import type { PlanTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasUnlimitedPlanLimits } from "@/lib/user-limits";

const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_INPUT_PRICE_PER_MILLION_USD = 0.75;
const WARNING_PERCENT = 80;

export const CLOVER_TOKEN_LIMITS: Record<PlanTier, { monthly: number; rolling24h: number }> = {
  free: { monthly: 100_000, rolling24h: 30_000 },
  pro: { monthly: 1_000_000, rolling24h: 250_000 },
};

export type CloverTokenWindow = {
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number;
  warned: boolean;
  exhausted: boolean;
  startsAt: string;
  resetsAt: string;
};

export type CloverTokenUsageSnapshot = {
  planTier: PlanTier;
  localParserTokens: number;
  backupParserTokens: number;
  adviserTokens: number;
  totalTokens: number;
  monthly: CloverTokenWindow;
  rolling24h: CloverTokenWindow;
};

export type CloverTokenUsageUser = {
  id: string;
  clerkUserId?: string | null;
  planTier: PlanTier;
};

type UsageLog = {
  action: string;
  metadata: unknown;
  createdAt: Date;
};

type UsageParts = {
  localParserTokens: number;
  backupParserTokens: number;
  adviserTokens: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asCount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

const getModelRates = (model: string) => {
  const normalized = model.trim().toLowerCase();
  if (normalized === "gpt-5.5" || normalized.startsWith("gpt-5.5-")) {
    return { input: 5, cached: 0.5, output: 30 };
  }
  if (normalized === "gpt-5.4-mini" || normalized.startsWith("gpt-5.4-mini-")) {
    return { input: 0.75, cached: 0.075, output: 4.5 };
  }
  if (normalized === "gpt-5.1" || normalized.startsWith("gpt-5.1-")) {
    return { input: 1.25, cached: 0.125, output: 10 };
  }
  if (normalized === "gpt-4.1-mini" || normalized.startsWith("gpt-4.1-mini-")) {
    return { input: 0.4, cached: 0.1, output: 1.6 };
  }
  if (normalized === "gpt-4.1" || normalized.startsWith("gpt-4.1-")) {
    return { input: 2, cached: 0.5, output: 8 };
  }
  return null;
};

export const calculateModelCloverTokens = (metadata: unknown) => {
  const usage = asRecord(metadata) ?? {};
  const inputTokens = asCount(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, asCount(usage.cachedInputTokens));
  const outputTokens = asCount(usage.outputTokens);
  const totalTokens = asCount(usage.totalTokens) || inputTokens + outputTokens;
  const model = typeof usage.model === "string" ? usage.model : "";
  const rates = getModelRates(model);

  if (!rates) return totalTokens;

  const normalizedCost =
    ((inputTokens - cachedInputTokens) * rates.input
      + cachedInputTokens * rates.cached
      + outputTokens * rates.output)
    / BASE_INPUT_PRICE_PER_MILLION_USD;
  return Math.max(totalTokens > 0 ? 1 : 0, Math.ceil(normalizedCost));
};

export const calculateUsageParts = (logs: UsageLog[], startsAt: Date): UsageParts => {
  const parts: UsageParts = { localParserTokens: 0, backupParserTokens: 0, adviserTokens: 0 };
  for (const log of logs) {
    if (log.createdAt < startsAt) continue;
    if (log.action === "import.parser_usage") {
      const metadata = asRecord(log.metadata);
      const localParser = asRecord(metadata?.localParser);
      const estimate = asCount(localParser?.estimatedTokens);
      if (estimate > 0) parts.localParserTokens += Math.max(250, Math.ceil(estimate * 0.1));
      continue;
    }
    if (log.action === "import.openai_model_call") {
      parts.backupParserTokens += calculateModelCloverTokens(log.metadata);
      continue;
    }
    if (log.action === "adviser.model_call") {
      parts.adviserTokens += calculateModelCloverTokens(log.metadata);
    }
  }
  return parts;
};

export const getManilaMonthWindow = (now: Date) => {
  const manilaNow = new Date(now.getTime() + MANILA_UTC_OFFSET_MS);
  const year = manilaNow.getUTCFullYear();
  const month = manilaNow.getUTCMonth();
  return {
    startsAt: new Date(Date.UTC(year, month, 1) - MANILA_UTC_OFFSET_MS),
    resetsAt: new Date(Date.UTC(year, month + 1, 1) - MANILA_UTC_OFFSET_MS),
  };
};

const buildWindow = (used: number, limit: number | null, startsAt: Date, resetsAt: Date): CloverTokenWindow => {
  const percent = limit === null || limit <= 0 ? 0 : Math.min(100, Math.max(0, (used / limit) * 100));
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    percent,
    warned: limit !== null && percent >= WARNING_PERCENT,
    exhausted: limit !== null && used >= limit,
    startsAt: startsAt.toISOString(),
    resetsAt: resetsAt.toISOString(),
  };
};

export const getCloverTokenUsage = async (
  user: CloverTokenUsageUser,
  now = new Date(),
): Promise<CloverTokenUsageSnapshot> => {
  const month = getManilaMonthWindow(now);
  const rollingStartsAt = new Date(now.getTime() - DAY_MS);
  const earliestStart = month.startsAt < rollingStartsAt ? month.startsAt : rollingStartsAt;
  const logs = await prisma.auditLog.findMany({
    where: {
      workspace: { userId: user.id },
      action: { in: ["import.parser_usage", "import.openai_model_call", "adviser.model_call"] },
      createdAt: { gte: earliestStart },
    },
    select: { action: true, metadata: true, createdAt: true },
  });
  const monthlyParts = calculateUsageParts(logs, month.startsAt);
  const rollingParts = calculateUsageParts(logs, rollingStartsAt);
  const monthlyUsed = monthlyParts.localParserTokens + monthlyParts.backupParserTokens + monthlyParts.adviserTokens;
  const rollingUsed = rollingParts.localParserTokens + rollingParts.backupParserTokens + rollingParts.adviserTokens;
  const unlimited = hasUnlimitedPlanLimits(user) || process.env.NODE_ENV !== "production";
  const limits = CLOVER_TOKEN_LIMITS[user.planTier];

  return {
    planTier: user.planTier,
    ...monthlyParts,
    totalTokens: monthlyUsed,
    monthly: buildWindow(monthlyUsed, unlimited ? null : limits.monthly, month.startsAt, month.resetsAt),
    rolling24h: buildWindow(rollingUsed, unlimited ? null : limits.rolling24h, rollingStartsAt, now),
  };
};

export const getCloverTokenLimitError = (usage: CloverTokenUsageSnapshot) => {
  const exhaustedWindow = usage.rolling24h.exhausted ? usage.rolling24h : usage.monthly.exhausted ? usage.monthly : null;
  if (!exhaustedWindow) return null;
  const isRolling = exhaustedWindow === usage.rolling24h;
  return {
    error: isRolling
      ? "You’ve reached Clover’s rolling 24-hour AI allowance. Try again as earlier usage clears from the window."
      : usage.planTier === "free"
        ? "You’ve used this month’s Clover token allowance. Upgrade to Pro for more room."
        : "You’ve used this month’s Clover token allowance. Your allowance resets next month.",
    planTier: usage.planTier,
    limitType: isRolling ? "clover_token_24h_limit" : "clover_token_monthly_limit",
    limitValue: exhaustedWindow.limit,
    usage,
  };
};
