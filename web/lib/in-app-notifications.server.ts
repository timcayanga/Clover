import { NotificationKeyCache } from "./notification-key-cache";
import { isPendingBankSelection } from "../../shared/finverse-lifecycle";
import { loadActivityInsightNotifications } from "./activity-insight-notifications.server";
import { getCurrentUserEnvironment } from "./user-environment";
import { bankLifecycleOverview } from "./finverse-lifecycle";
import { bankWarningStage } from "../../shared/finverse-lifecycle";
import { getAppPreferences, parseAppPreferences } from "./app-preferences";
import { notificationAllowed } from "../../shared/app-preferences";
import { isSplitBillResolved } from "./split-bill-resolution";
import { parseRecurringTracking } from "@/lib/recurring-tracking";
import type { BillingSubscriptionStatus, CommitmentKind, ImportFileStatus } from "@prisma/client";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { InAppNotification, InAppNotificationPriority } from "@/lib/in-app-notifications";
import { loadBudgetWorkspaceData } from "@/lib/budgeting-data";
import { getCircleInvitationPath } from "@/lib/circle-invitations";
import { getUserDisplayName } from "@/lib/user-display-name";
import { buildReviewQueueWhere } from "@/lib/review-queue";
import { prisma } from "@/lib/prisma";
import { inAppTemplateVariants, renderInAppVariant } from "@/lib/notification-template-rules";
import { loadRuntimeNotificationTemplates } from "@/lib/notification-templates.server";
import { getCloverTokenUsage } from "@/lib/clover-token-usage";
import type { PlanTier } from "@prisma/client";
import { getEffectiveProfileLimit, getEffectiveUserLimits } from "@/lib/user-limits";
import { countNonCashAccounts } from "@/lib/account-limit-count";

type NotificationUser = {
  appPreferences?: unknown;
  environment?: string;
  id: string;
  email: string;
  clerkUserId?: string | null;
  planTier: PlanTier;
  accountLimit?: number | null;
  monthlyUploadLimit?: number | null;
  transactionLimit?: number | null;
};

const notificationPreferences = (user: NotificationUser) => user.appPreferences === undefined
  ? getAppPreferences(user.id)
  : parseAppPreferences(user.appPreferences);

const DAY_MS = 24 * 60 * 60 * 1000;
const priorityRank: Record<InAppNotificationPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const toDateKey = (value: Date) => value.toISOString().slice(0, 10);
const toMonthDay = (value: Date) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(value);
const toAmount = (value: unknown) => Number(value ?? 0);
const importProductHref = "/transactions";

const getImportCopy = (input: {
  status: ImportFileStatus;
  fileName: string;
  confirmedTransactionsCount: number;
  processingMessage: string | null;
}) => {
  if (input.status === "failed") {
    return {
      title: "Import needs attention",
      message: `${input.fileName} could not be processed. ${input.processingMessage ?? "Review the file and try again."}`,
      tone: "danger" as const,
      ctaLabel: "Review import",
    };
  }

  if (input.status === "processing") {
    return {
      title: "Import in progress",
      message: `${input.fileName} is still being processed by Clover.`,
      tone: "neutral" as const,
      ctaLabel: "View progress",
    };
  }

  return {
    title: "Import complete",
    message: input.confirmedTransactionsCount > 0
      ? `${input.confirmedTransactionsCount} transaction${input.confirmedTransactionsCount === 1 ? " was" : "s were"} added from ${input.fileName}.`
      : `${input.fileName} is ready in Clover.`,
    tone: "positive" as const,
    ctaLabel: "View transactions",
  };
};

const getRecurringProductLabel = (kind: CommitmentKind) => {
  if (kind === "debt") return "Debts";
  if (kind === "receivable") return "Money Owed";
  return "Recurring";
};

type NotificationRank = Pick<InAppNotification, "id" | "priority" | "createdAt">;
type RankedCandidate = NotificationRank & { render: () => InAppNotification };

const rankedCandidates = async (
  user: NotificationUser,
  workspaceId: string,
  now = new Date(),
  options: { raw?: boolean; keysOnly?: boolean; preferences?: Awaited<ReturnType<typeof getAppPreferences>> } = {},
): Promise<RankedCandidate[]> => {
  const preferences = options.preferences ?? await notificationPreferences(user);
  if (!preferences.notifications[options.raw ? "email" : "inApp"]) return [];
  const withDetails = !options.keysOnly;
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const threeDaysFromNow = new Date(now.getTime() + 3 * DAY_MS);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * DAY_MS);

  const [
    imports,
    reviewSummary,
    mismatches,
    commitments,
    budgetData,
    invitations,
    circleActivities,
    splitRequests,
    dividends,
    maturingInvestments,
    billingSubscription,
    cloverTokenUsage,
    profileCount,
    planAccounts,
    activityInsights,
  ] = await Promise.all([
    prisma.importFile.findMany({
      where: { workspaceId, status: { in: ["processing", "done", "failed"] } },
      select: {
        id: true,
        fileName: withDetails,
        status: true,
        confirmedTransactionsCount: withDetails,
        processingMessage: withDetails,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    preferences.notifications.transactionsNeedReview ? prisma.transaction.aggregate({
      where: buildReviewQueueWhere(workspaceId),
      _count: { _all: true },
      _max: { updatedAt: true },
    }) : { _count: { _all: 0 }, _max: { updatedAt: null } },
    preferences.notifications.transactionsNeedReview ? prisma.accountStatementCheckpoint.findMany({
      where: {
        workspaceId,
        status: "mismatch",
        NOT: { mismatchReason: "A transaction from this statement was deleted by the user." },
      },
      select: { id: true, mismatchReason: withDetails, updatedAt: true, account: withDetails && { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }) : [],
    prisma.financialCommitment.findMany({
      where: {
        workspaceId,
        status: "active",
        OR: [
          { nextDueDate: { gte: thirtyDaysAgo, lte: threeDaysFromNow } },
          { nextDueDate: null, dueDate: { gte: thirtyDaysAgo, lte: threeDaysFromNow } },
        ],
      },
      select: {
        id: true,
        kind: true,
        title: withDetails,
        amount: true,
        tracking: true,
        currency: true,
        dueDate: true,
        nextDueDate: true,
        updatedAt: true,
      },
      orderBy: [{ nextDueDate: "asc" }, { dueDate: "asc" }],
      take: 12,
    }),
    preferences.notifications.budgetWarnings ? loadBudgetWorkspaceData(workspaceId, now).catch(() => null) : null,
    prisma.circleInvitation.findMany({
      where: {
        email: { equals: user.email, mode: "insensitive" },
        status: "pending",
        expiresAt: { gt: now },
        circle: {
          archivedAt: null,
          owner: { environment: user.environment ?? getCurrentUserEnvironment() },
          memberships: { none: { userId: user.id, status: "active" } },
        },
      },
      select: {
        id: true,
        token: withDetails,
        createdAt: true,
        expiresAt: true,
        circle: withDetails && { select: { name: true } },
        invitedBy: withDetails && { select: { firstName: withDetails, lastName: withDetails, email: withDetails } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.circleActivity.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        actorUserId: { not: user.id },
        circle: {
          archivedAt: null,
          OR: [
            { ownerUserId: user.id },
            { memberships: { some: { userId: user.id, status: "active" } } },
          ],
        },
      },
      select: { id: true, summary: withDetails, createdAt: true, circle: withDetails && { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.splitBillPaymentRequest.findMany({
      where: {
        bill: { userId: user.id },
        status: { in: ["requested", "payment_reported", "paid"] },
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        recipientName: withDetails,
        dueDate: true,
        updatedAt: true,
        bill: { select: { id: true, title: withDetails, rawPayload:true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.investmentDividend.findMany({
      where: { account: { workspaceId }, paidAt: { gte: sevenDaysAgo, lte: now } },
      select: { id: true, amount: withDetails, currency: withDetails, paidAt: true, account: withDetails && { select: { name: true } } },
      orderBy: { paidAt: "desc" },
      take: 5,
    }),
    prisma.account.findMany({
      where: {
        workspaceId,
        type: "investment",
        investmentMaturityDate: { gte: now, lte: fourteenDaysFromNow },
      },
      select: { id: true, name: withDetails, investmentMaturityDate: true, updatedAt: true },
      orderBy: { investmentMaturityDate: "asc" },
      take: 5,
    }),
    prisma.billingSubscription.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true, updatedAt: true },
    }),
    preferences.notifications.budgetWarnings ? getCloverTokenUsage(user, now) : null,
    preferences.notifications.budgetWarnings ? prisma.workspace.count({ where: { userId: user.id } }) : 0,
    preferences.notifications.budgetWarnings ? prisma.account.findMany({
      where: { workspace: { userId: user.id } },
      select: { type: true, name: true, institution: true },
    }) : [],
    options.raw ? Promise.resolve([]) : loadActivityInsightNotifications(workspaceId, now).catch(() => []),
  ]);

  const items: RankedCandidate[] = [];
  const add = (rank: NotificationRank, details: () => Omit<InAppNotification, keyof NotificationRank>) => {
    items.push({ ...rank, render: () => ({ ...rank, ...details() }) });
  };
  const include = (rows: InAppNotification[]) => {
    for (const item of rows) items.push({ id: item.id, priority: item.priority, createdAt: item.createdAt, render: () => item });
  };
  const formatTokens = (value: number) => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(value);
  const planLimitSource = {
    ...user,
    accountLimit: user.accountLimit ?? null,
    monthlyUploadLimit: user.monthlyUploadLimit ?? null,
    transactionLimit: user.transactionLimit ?? null,
  };
  const effectivePlanLimits = getEffectiveUserLimits(planLimitSource);
  const accountCount = countNonCashAccounts(planAccounts);
  const pushPlanLimitWarning = (input: { key: "profiles" | "accounts"; label: string; used: number; limit: number | null }) => {
    if (input.limit === null || input.limit <= 0) return;
    const limit = input.limit;
    const percent = (input.used / limit) * 100;
    if (percent < 80) return;
    const exhausted = input.used >= input.limit;
    add({
      id: `plan-limit:${input.key}:${input.limit}:${exhausted ? "100" : "80"}`,
      priority: exhausted ? "critical" : "high",
      createdAt: now.toISOString(),
    }, () => ({
      product: "settings",
      productLabel: "Plan",
      productHref: "/settings?section=plan",
      title: exhausted ? `${input.label} limit reached` : `${input.label} usage is at ${Math.round(percent)}%`,
      message: user.planTier === "free"
        ? `You’re using ${input.used} of ${input.limit} available ${input.label.toLowerCase()}. Upgrade to Plus or Pro for more room.`
        : `You’re using ${input.used} of ${input.limit} available ${input.label.toLowerCase()}.`,
      tone: exhausted ? "danger" : "warning",
      href: "/settings?section=plan&plan_source=notification",
      ctaLabel: user.planTier === "free" ? "View plans" : "View plan",
      progress: { used: input.used, limit, percent, label: input.label },
    }));
  };
  pushPlanLimitWarning({ key: "profiles", label: "Profiles", used: profileCount, limit: getEffectiveProfileLimit(user) });
  pushPlanLimitWarning({ key: "accounts", label: "Accounts", used: accountCount, limit: effectivePlanLimits.accountLimit });
  if (cloverTokenUsage?.monthly.warned && cloverTokenUsage.monthly.limit !== null) {
    const usage = cloverTokenUsage.monthly;
    const limit = Number(usage.limit);
    const percentage = Math.min(100, Math.round(usage.percent));
    add({
      id: `clover-token:monthly:${usage.startsAt.slice(0, 7)}:${usage.exhausted ? "100" : "80"}`,
      priority: usage.exhausted ? "critical" : "high",
      createdAt: now.toISOString(),
    }, () => ({
      product: "settings",
      productLabel: "Plan",
      productHref: "/settings?section=plan",
      title: usage.exhausted ? "Monthly Clover tokens used" : `Monthly Clover tokens are at ${percentage}%`,
      message: user.planTier === "free"
        ? `You’ve used ${formatTokens(usage.used)} of ${formatTokens(limit)} tokens. Upgrade to Plus for a 1,000,000-token monthly allowance.`
        : `You’ve used ${formatTokens(usage.used)} of ${formatTokens(limit)} tokens. Your allowance resets at the start of next month.`,
      tone: usage.exhausted ? "danger" : "warning",
      href: "/settings?section=plan&plan_source=notification",
      ctaLabel: user.planTier === "free" ? "View plans" : "View plan",
      progress: { used: usage.used, limit, percent: usage.percent, label: "Monthly Clover tokens" },
    }));
  }
  if (cloverTokenUsage?.rolling24h.warned && cloverTokenUsage.rolling24h.limit !== null) {
    const usage = cloverTokenUsage.rolling24h;
    const limit = Number(usage.limit);
    const percentage = Math.min(100, Math.round(usage.percent));
    add({
      id: `clover-token:rolling:${toDateKey(now)}:${usage.exhausted ? "100" : "80"}`,
      priority: usage.exhausted ? "critical" : "high",
      createdAt: now.toISOString(),
    }, () => ({
      product: "settings",
      productLabel: "Plan",
      productHref: "/settings?section=plan",
      title: usage.exhausted ? "24-hour Clover token allowance used" : `24-hour Clover tokens are at ${percentage}%`,
      message: `You’ve used ${formatTokens(usage.used)} of ${formatTokens(limit)} tokens in the rolling 24-hour window. Earlier usage clears automatically.`,
      tone: usage.exhausted ? "danger" : "warning",
      href: "/settings?section=plan&plan_source=notification",
      ctaLabel: "View usage",
      progress: { used: usage.used, limit, percent: usage.percent, label: "Rolling 24-hour Clover tokens" },
    }));
  }
  const reviewCount = reviewSummary._count._all;
  const recentImports = imports.filter((item) => item.updatedAt >= sevenDaysAgo || item.status !== "done");
  include(activityInsights);
  recentImports.forEach((item) => {
    if (item.status === "done" && activityInsights.some(insight => insight.id.startsWith(`activity-insights:${workspaceId}:upload:${item.id}:`))) return;
    add({
      id: `import:${item.id}:${item.status}`,
      priority: item.status === "failed" ? "critical" : "normal",
      createdAt: item.updatedAt.toISOString(),
    }, () => {
      const copy = getImportCopy(item);
      return {
        product: "transactions",
        productLabel: "Transactions",
        productHref: importProductHref,
        title: copy.title,
        message: copy.message,
        tone: copy.tone,
        href: importProductHref,
        ctaLabel: copy.ctaLabel,
      };
    });
  });

  const latestCompletedImport = imports.find((item) => item.status === "done");
  if ((!latestCompletedImport || latestCompletedImport.updatedAt < sevenDaysAgo) && imports.every((item) => item.status !== "processing")) {
    const reminderKeyDate = new Date(now);
    reminderKeyDate.setUTCDate(reminderKeyDate.getUTCDate() - reminderKeyDate.getUTCDay());
    add({
      id: `upload-reminder:${workspaceId}:${toDateKey(reminderKeyDate)}`,
      priority: "low",
      createdAt: reminderKeyDate.toISOString(),
    }, () => ({
      product: "transactions",
      productLabel: "Transactions",
      productHref: "/transactions",
      title: "Upload your latest data",
      message: "A quick statement or receipt upload keeps balances and reports current.",
      tone: "neutral",
      href: "/transactions",
      ctaLabel: "Upload data",
    }));
  }

  if (reviewCount > 0) {
    add({
      id: `review:${workspaceId}:${reviewCount}`,
      priority: "high",
      createdAt: (reviewSummary._max.updatedAt ?? now).toISOString(),
    }, () => ({
      product: "transactions",
      productLabel: "Transactions",
      productHref: "/transactions",
      title: `${reviewCount} transaction${reviewCount === 1 ? "" : "s"} need attention`,
      message: "Review uncertain categories, possible duplicates, or account matches Clover wants you to confirm.",
      tone: "warning",
      href: "/review",
      ctaLabel: "Review transactions",
    }));
  }

  mismatches.forEach((checkpoint) => {
    add({
      id: `account-mismatch:${checkpoint.id}`,
      priority: "critical",
      createdAt: checkpoint.updatedAt.toISOString(),
    }, () => ({
      product: "accounts",
      productLabel: "Accounts",
      productHref: "/accounts",
      title: `${checkpoint.account?.name ?? "Account"} needs reconciliation`,
      message: checkpoint.mismatchReason ?? "The statement balance does not match the recorded account activity.",
      tone: "danger",
      href: "/accounts",
      ctaLabel: "Review account",
    }));
  });

  commitments.forEach((commitment) => {
    const dueDate = commitment.nextDueDate ?? commitment.dueDate;
    if (!dueDate) return;
    const tracking = parseRecurringTracking(commitment.tracking);
    if (tracking && (tracking.reminderDays === null || dueDate.getTime() - now.getTime() > tracking.reminderDays * 86400000)) return;
    const overdue = dueDate < now;
    const amount = tracking && (commitment.kind === "debt" || commitment.kind === "receivable") ? tracking.paymentAmount ?? toAmount(commitment.amount) : toAmount(commitment.amount);
    const amountCopy = () => amount > 0 ? ` of ${formatCurrencyAmount(amount, commitment.currency)}` : "";
    add({
      id: `recurring:${commitment.id}:${toDateKey(dueDate)}`,
      priority: overdue ? "critical" : "high",
      createdAt: commitment.updatedAt.toISOString(),
    }, () => ({
      product: "recurring",
      productLabel: getRecurringProductLabel(commitment.kind),
      productHref: "/recurring",
      title: overdue ? `${commitment.title} is overdue` : `${commitment.title} is due soon`,
      message: overdue
        ? `This payment${amountCopy()} was due ${toMonthDay(dueDate)}.`
        : `This payment${amountCopy()} is due ${toMonthDay(dueDate)}.`,
      tone: overdue ? "danger" : "warning",
      href: "/recurring",
      ctaLabel: overdue ? "Mark as paid" : "View payment",
    }));
  });

  budgetData?.overview.alerts.slice(0, 4).forEach((budget) => {
    add({
      id: `budget:${budget.id}:${budget.stage}:${budget.periodLabel}`,
      priority: budget.tone === "danger" ? "critical" : "high",
      createdAt: now.toISOString(),
    }, () => ({
      product: "budgeting",
      productLabel: "Budgeting",
      productHref: "/budgeting",
      title: budget.stage === "exceeded" ? `${budget.name} is over budget` : `${budget.name} is nearing its limit`,
      message: budget.statusDetail,
      tone: budget.tone === "danger" ? "danger" : budget.tone === "warning" ? "warning" : "positive",
      href: budget.href,
      ctaLabel: budget.actionLabel,
    }));
  });

  invitations.forEach((invitation) => {
    add({
      id: `circle-invitation:${invitation.id}`,
      priority: "high",
      createdAt: invitation.createdAt.toISOString(),
    }, () => ({
      product: "circles",
      productLabel: "Circles",
      productHref: "/circles",
      title: `Join ${invitation.circle.name}`,
      message: `${getUserDisplayName(invitation.invitedBy)} invited you to a Circle. The invitation expires ${toMonthDay(invitation.expiresAt)}.`,
      tone: "positive",
      href: getCircleInvitationPath(invitation.token),
      ctaLabel: "View invitation",
    }));
  });

  circleActivities.forEach((activity) => {
    add({
      id: `circle-activity:${activity.id}`,
      priority: "normal",
      createdAt: activity.createdAt.toISOString(),
    }, () => ({
      product: "circles",
      productLabel: "Circles",
      productHref: "/circles",
      title: activity.circle.name,
      message: activity.summary,
      tone: "neutral",
      href: "/circles",
      ctaLabel: "View Circle",
    }));
  });

  splitRequests.forEach((request) => {
    if (isSplitBillResolved(request.bill.rawPayload) && request.status !== "paid") return;
    add({
      id: `split-request:${request.id}:${request.status}`,
      priority: request.status === "payment_reported" ? "high" : "normal",
      createdAt: request.updatedAt.toISOString(),
    }, () => {
      const statusCopy = request.status === "paid"
        ? { title: "Split bill settled", message: `${request.recipientName} marked ${formatCurrencyAmount(toAmount(request.amount), request.currency)} as paid.`, tone: "positive" as const, cta: null }
        : request.status === "payment_reported"
          ? { title: "Payment reported", message: `${request.recipientName} reported a payment for ${request.bill.title}.`, tone: "warning" as const, cta: "Review payment" }
          : { title: "Payment requested", message: `${formatCurrencyAmount(toAmount(request.amount), request.currency)} was requested for ${request.bill.title}.`, tone: "neutral" as const, cta: "View request" };
      return {
        product: "splitBills",
        productLabel: "Split Bills",
        productHref: "/split-bill",
        title: statusCopy.title,
        message: statusCopy.message,
        tone: statusCopy.tone,
        href: statusCopy.cta ? `/split-bill/${request.bill.id}` : null,
        ctaLabel: statusCopy.cta,
      };
    });
  });

  dividends.forEach((dividend) => {
    add({
      id: `investment-dividend:${dividend.id}`,
      priority: "normal",
      createdAt: dividend.paidAt.toISOString(),
    }, () => ({
      product: "investments",
      productLabel: "Investments",
      productHref: "/investments",
      title: "Dividend recorded",
      message: `${formatCurrencyAmount(toAmount(dividend.amount), dividend.currency)} was recorded for ${dividend.account.name}.`,
      tone: "positive",
      href: "/investments",
      ctaLabel: "View investment",
    }));
  });

  maturingInvestments.forEach((account) => {
    const maturityDate = account.investmentMaturityDate;
    if (!maturityDate) return;
    add({
      id: `investment-maturity:${account.id}:${toDateKey(maturityDate)}`,
      priority: "high",
      createdAt: account.updatedAt.toISOString(),
    }, () => ({
      product: "investments",
      productLabel: "Investments",
      productHref: "/investments",
      title: `${account.name} matures soon`,
      message: `This investment matures ${toMonthDay(maturityDate)}. Review your next options.`,
      tone: "warning",
      href: "/investments",
      ctaLabel: "Review options",
    }));
  });

  const billingProblemStatuses = new Set<BillingSubscriptionStatus>(["suspended", "expired"]);
  if (billingSubscription && billingProblemStatuses.has(billingSubscription.status)) {
    add({
      id: `billing:${billingSubscription.id}:${billingSubscription.status}`,
      priority: "critical",
      createdAt: billingSubscription.updatedAt.toISOString(),
    }, () => ({
      product: "settings",
      productLabel: "Settings",
      productHref: "/settings?section=plan",
      title: "Subscription needs attention",
      message: "Clover could not confirm an active subscription. Review your plan and payment details.",
      tone: "danger",
      href: "/settings?section=plan&plan_source=notification",
      ctaLabel: "Review subscription",
    }));
  }

  if (preferences.notifications.weeklySummary) {
    // Previous complete Monday-Sunday week in Clover's reporting time zone.
    const local = new Date(+now + 8 * 60 * 60 * 1000);
    const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - ((local.getUTCDay() + 6) % 7)) - 8 * 60 * 60 * 1000);
    const previous = new Date(+start - 7 * DAY_MS);
    const count = await prisma.transaction.count({ where: { workspaceId, deletedAt: null, type: { not: "transfer" }, date: { gte: previous, lt: start } } });
    if (count > 0) add({
      id: `weekly-summary:${workspaceId}:${toDateKey(start)}`,
      priority: "low",
      createdAt: start.toISOString(),
    }, () => ({
      product: "transactions",
      productLabel: "Reports",
      productHref: "/reports",
      title: "Your weekly summary",
      message: `${count} income and spending transactions were recorded last week. Open Reports to review your finances.`,
      tone: "neutral",
      href: "/reports",
      ctaLabel: "View reports",
    }));
  }
  const bankLifecycle=await bankLifecycleOverview(user.id);
  if (!options.raw) for (const c of bankLifecycle.pending.filter(c => c.workspaceId === workspaceId)) {
    add({
      id: `bank-link:${c.id}`,
      priority: "high",
      createdAt: c.createdAt.toISOString(),
    }, () => ({
      product: "accounts",
      productLabel: "Connected banks",
      productHref: "/accounts",
      iconSrc: c.logoUrl,
      title: `Finish linking ${c.name}`,
      message: c.status === "awaiting_selection" ? "Choose which accounts to link to Clover." : "Open Clover to check your bank setup.",
      tone: "neutral",
      href: `/accounts?finverse=connected&finverseConnection=${encodeURIComponent(c.id)}&finverseWorkspace=${encodeURIComponent(workspaceId)}`,
      ctaLabel: c.status === "awaiting_selection" ? "Select accounts" : "Continue setup",
    }));
  }
  for(const c of bankLifecycle.connections.filter(c=>c.workspaceId===workspaceId && c.status!=='disconnected')) {
    if (isPendingBankSelection(c.status, c.accounts.some(a => Boolean(a.accountId && !a.unlinkedAt)), c.lastSyncedAt)) continue;
    const stage=bankWarningStage(c.inactivityDeadline,now);
    const planEnding=bankLifecycle.accessEndsAt && +bankLifecycle.accessEndsAt-+now<=14*DAY_MS ? bankLifecycle.accessEndsAt : null;
    const deadline=planEnding??c.inactivityDeadline;
    if(stage || c.disconnectError || planEnding) add({
      id:`bank-lifecycle:${c.id}:${c.disconnectError?'pending':planEnding?'plan':stage}:${deadline.toISOString()}`,
      priority:'high',
      createdAt:new Date(Math.min(+now,+deadline-(planEnding?14:stage??14)*DAY_MS)).toISOString(),
    }, () => ({
      product:'accounts',
      productLabel:'Connected banks',
      productHref:'/accounts',
      title:c.disconnectError?'Bank disconnection pending':planEnding?'Review your connected banks':'Sync to keep connected',
      message:c.disconnectError?'Finverse disconnection is pending. Your history remains available.':planEnding?`Plus or Pro access ends ${toMonthDay(planEnding)}. Bank connections exceeding your next allowance will disconnect; records remain.`:`${c.name} has not synced recently. Sync before ${toMonthDay(c.inactivityDeadline)} to keep connected. Your history will remain if disconnected.`,
      tone:'warning',
      href:'/accounts',
      ctaLabel:'Manage connected banks',
    }));
  }
  const { switchNotifications } = await import("./switch-campaign-notifications.server");
  include(await switchNotifications(user.id));
  if (!options.raw) {
    const { signupTrialNotifications } = await import("./signup-trial-lifecycle");
    include(await signupTrialNotifications(user.id, now));
  }
  const templates = options.raw ? [] : await loadRuntimeNotificationTemplates(
    user.environment ?? (await prisma.user.findUnique({ where: { id: user.id }, select: { environment: true } }))?.environment ?? "local",
  );
  const configured = options.raw ? items : items.flatMap(item =>
    inAppTemplateVariants(item, templates).map(({ id, template }) => ({
      ...item, id, render: () => renderInAppVariant(item.render(), id, template),
    }))
  );
  return configured
    .filter(item => notificationAllowed(item.id, preferences.notifications, options.raw ? "email" : "inApp"))
    .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 40);
};

export const buildInAppNotificationCandidates = async (user: NotificationUser, workspaceId: string, now = new Date(), options: { raw?: boolean } = {}) =>
  (await rankedCandidates(user, workspaceId, now, options)).map(item => item.render());

const keyCache = new NotificationKeyCache();
const notificationScope = (user: NotificationUser, workspaceId: string, preferences: Awaited<ReturnType<typeof getAppPreferences>>) =>
  JSON.stringify([user.id, workspaceId, user.environment, user.email, user.planTier, user.accountLimit, user.transactionLimit, user.monthlyUploadLimit, preferences.notifications]);

async function notificationState(userId: string, notificationKeys: string[]) {
  if (!notificationKeys.length) return { dismissedKeys: new Set<string>(), readKeys: new Set<string>() };
  const [dismissed, read] = await Promise.all([
    prisma.inAppNotificationDismissal.findMany({
      where: { userId, notificationKey: { in: notificationKeys } },
      select: { notificationKey: true },
    }),
    prisma.inAppNotificationRead.findMany({
      where: { userId, notificationKey: { in: notificationKeys } },
      select: { notificationKey: true },
    }),
  ]);
  const dismissedKeys = new Set(dismissed.map((item) => item.notificationKey));
  const readKeys = new Set(read.map((item) => item.notificationKey));
  return { dismissedKeys, readKeys };
}

export async function loadUnreadNotificationCount(user: NotificationUser, workspaceId: string) {
  const preferences = await notificationPreferences(user);
  if (!preferences.notifications.inApp) return 0;
  const keys = await keyCache.read(notificationScope(user, workspaceId, preferences), async () =>
    (await rankedCandidates(user, workspaceId, new Date(), { preferences, keysOnly: true })).map(item => item.id));
  const { dismissedKeys, readKeys } = await notificationState(user.id, keys);
  return keys.filter(key => !dismissedKeys.has(key) && !readKeys.has(key)).length;
}

export const loadActiveInAppNotificationFeed = async (user: NotificationUser, workspaceId: string, now = new Date()) => {
  const preferences = await notificationPreferences(user);
  const ranked = await rankedCandidates(user, workspaceId, now, { preferences });
  const keys = ranked.map(item => item.id);
  keyCache.seed(notificationScope(user, workspaceId, preferences), keys);
  const { dismissedKeys, readKeys } = await notificationState(user.id, keys);
  const notifications = ranked.filter(item => !dismissedKeys.has(item.id)).map(item => item.render());
  return {
    notifications,
    readIds: notifications.filter(item => readKeys.has(item.id)).map(item => item.id),
    unreadCount: notifications.filter((item) => !readKeys.has(item.id)).length,
  };
};

export const loadActiveInAppNotifications = async (user: NotificationUser, workspaceId: string, now = new Date()) =>
  (await loadActiveInAppNotificationFeed(user, workspaceId, now)).notifications;
