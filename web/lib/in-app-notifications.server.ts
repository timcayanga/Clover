import type { BillingSubscriptionStatus, CommitmentKind, ImportFileStatus } from "@prisma/client";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { InAppNotification, InAppNotificationPriority } from "@/lib/in-app-notifications";
import { loadBudgetWorkspaceData } from "@/lib/budgeting-data";
import { getCircleInvitationPath } from "@/lib/circle-invitations";
import { getUserDisplayName } from "@/lib/user-display-name";
import { buildReviewQueueWhere } from "@/lib/review-queue";
import { prisma } from "@/lib/prisma";

type NotificationUser = {
  id: string;
  email: string;
};

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
      priority: "critical" as const,
      ctaLabel: "Review import",
    };
  }

  if (input.status === "processing") {
    return {
      title: "Import in progress",
      message: `${input.fileName} is still being processed by Clover.`,
      tone: "neutral" as const,
      priority: "normal" as const,
      ctaLabel: "View progress",
    };
  }

  return {
    title: "Import complete",
    message: input.confirmedTransactionsCount > 0
      ? `${input.confirmedTransactionsCount} transaction${input.confirmedTransactionsCount === 1 ? " was" : "s were"} added from ${input.fileName}.`
      : `${input.fileName} is ready in Clover.`,
    tone: "positive" as const,
    priority: "normal" as const,
    ctaLabel: "View transactions",
  };
};

const getRecurringProductLabel = (kind: CommitmentKind) => {
  if (kind === "debt") return "Debts";
  if (kind === "receivable") return "Money Owed";
  return "Recurring";
};

export const buildInAppNotificationCandidates = async (
  user: NotificationUser,
  workspaceId: string,
  now = new Date(),
): Promise<InAppNotification[]> => {
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const threeDaysFromNow = new Date(now.getTime() + 3 * DAY_MS);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * DAY_MS);

  const [
    imports,
    reviewCount,
    mismatches,
    commitments,
    budgetData,
    invitations,
    circleActivities,
    splitRequests,
    dividends,
    maturingInvestments,
    billingSubscription,
  ] = await Promise.all([
    prisma.importFile.findMany({
      where: { workspaceId, status: { in: ["processing", "done", "failed"] } },
      select: {
        id: true,
        fileName: true,
        status: true,
        confirmedTransactionsCount: true,
        processingMessage: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.transaction.count({ where: buildReviewQueueWhere(workspaceId) }),
    prisma.accountStatementCheckpoint.findMany({
      where: { workspaceId, status: "mismatch" },
      select: { id: true, mismatchReason: true, updatedAt: true, account: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
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
        title: true,
        amount: true,
        currency: true,
        dueDate: true,
        nextDueDate: true,
        updatedAt: true,
      },
      orderBy: [{ nextDueDate: "asc" }, { dueDate: "asc" }],
      take: 12,
    }),
    loadBudgetWorkspaceData(workspaceId, now).catch(() => null),
    prisma.circleInvitation.findMany({
      where: {
        email: { equals: user.email, mode: "insensitive" },
        status: "pending",
        expiresAt: { gt: now },
        circle: {
          archivedAt: null,
          memberships: { none: { userId: user.id, status: "active" } },
        },
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        circle: { select: { name: true } },
        invitedBy: { select: { firstName: true, lastName: true, email: true } },
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
      select: { id: true, summary: true, createdAt: true, circle: { select: { id: true, name: true } } },
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
        recipientName: true,
        dueDate: true,
        updatedAt: true,
        bill: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.investmentDividend.findMany({
      where: { account: { workspaceId }, paidAt: { gte: sevenDaysAgo, lte: now } },
      select: { id: true, amount: true, currency: true, paidAt: true, account: { select: { name: true } } },
      orderBy: { paidAt: "desc" },
      take: 5,
    }),
    prisma.account.findMany({
      where: {
        workspaceId,
        type: "investment",
        investmentMaturityDate: { gte: now, lte: fourteenDaysFromNow },
      },
      select: { id: true, name: true, investmentMaturityDate: true, updatedAt: true },
      orderBy: { investmentMaturityDate: "asc" },
      take: 5,
    }),
    prisma.billingSubscription.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true, updatedAt: true },
    }),
  ]);

  const items: InAppNotification[] = [];
  const recentImports = imports.filter((item) => item.updatedAt >= sevenDaysAgo || item.status !== "done");
  recentImports.forEach((item) => {
    const copy = getImportCopy(item);
    items.push({
      id: `import:${item.id}:${item.status}`,
      product: "transactions",
      productLabel: "Transactions",
      productHref: importProductHref,
      title: copy.title,
      message: copy.message,
      tone: copy.tone,
      priority: copy.priority,
      createdAt: item.updatedAt.toISOString(),
      href: importProductHref,
      ctaLabel: copy.ctaLabel,
    });
  });

  const latestCompletedImport = imports.find((item) => item.status === "done");
  if ((!latestCompletedImport || latestCompletedImport.updatedAt < sevenDaysAgo) && imports.every((item) => item.status !== "processing")) {
    const reminderKeyDate = new Date(now);
    reminderKeyDate.setUTCDate(reminderKeyDate.getUTCDate() - reminderKeyDate.getUTCDay());
    items.push({
      id: `upload-reminder:${workspaceId}:${toDateKey(reminderKeyDate)}`,
      product: "transactions",
      productLabel: "Transactions",
      productHref: "/transactions",
      title: "Upload your latest data",
      message: "A quick statement or receipt upload keeps balances and reports current.",
      tone: "neutral",
      priority: "low",
      createdAt: now.toISOString(),
      href: "/transactions",
      ctaLabel: "Upload data",
    });
  }

  if (reviewCount > 0) {
    items.push({
      id: `review:${workspaceId}:${reviewCount}`,
      product: "transactions",
      productLabel: "Transactions",
      productHref: "/transactions",
      title: `${reviewCount} transaction${reviewCount === 1 ? "" : "s"} need attention`,
      message: "Review uncertain categories, possible duplicates, or account matches Clover wants you to confirm.",
      tone: "warning",
      priority: "high",
      createdAt: now.toISOString(),
      href: "/review",
      ctaLabel: "Review transactions",
    });
  }

  mismatches.forEach((checkpoint) => {
    items.push({
      id: `account-mismatch:${checkpoint.id}`,
      product: "accounts",
      productLabel: "Accounts",
      productHref: "/accounts",
      title: `${checkpoint.account?.name ?? "Account"} needs reconciliation`,
      message: checkpoint.mismatchReason ?? "The statement balance does not match the recorded account activity.",
      tone: "danger",
      priority: "critical",
      createdAt: checkpoint.updatedAt.toISOString(),
      href: "/accounts",
      ctaLabel: "Review account",
    });
  });

  commitments.forEach((commitment) => {
    const dueDate = commitment.nextDueDate ?? commitment.dueDate;
    if (!dueDate) return;
    const overdue = dueDate < now;
    const amount = toAmount(commitment.amount);
    const amountCopy = amount > 0 ? ` of ${formatCurrencyAmount(amount, commitment.currency)}` : "";
    items.push({
      id: `recurring:${commitment.id}:${toDateKey(dueDate)}`,
      product: "recurring",
      productLabel: getRecurringProductLabel(commitment.kind),
      productHref: "/recurring",
      title: overdue ? `${commitment.title} is overdue` : `${commitment.title} is due soon`,
      message: overdue
        ? `This payment${amountCopy} was due ${toMonthDay(dueDate)}.`
        : `This payment${amountCopy} is due ${toMonthDay(dueDate)}.`,
      tone: overdue ? "danger" : "warning",
      priority: overdue ? "critical" : "high",
      createdAt: commitment.updatedAt.toISOString(),
      href: "/recurring",
      ctaLabel: overdue ? "Mark as paid" : "View payment",
    });
  });

  budgetData?.overview.alerts.slice(0, 4).forEach((budget) => {
    items.push({
      id: `budget:${budget.id}:${budget.stage}:${budget.periodLabel}`,
      product: "budgeting",
      productLabel: "Budgeting",
      productHref: "/budgeting",
      title: budget.stage === "exceeded" ? `${budget.name} is over budget` : `${budget.name} is nearing its limit`,
      message: budget.statusDetail,
      tone: budget.tone === "danger" ? "danger" : budget.tone === "warning" ? "warning" : "positive",
      priority: budget.tone === "danger" ? "critical" : "high",
      createdAt: now.toISOString(),
      href: budget.href,
      ctaLabel: budget.actionLabel,
    });
  });

  invitations.forEach((invitation) => {
    items.push({
      id: `circle-invitation:${invitation.id}`,
      product: "circles",
      productLabel: "Circles",
      productHref: "/circles",
      title: `Join ${invitation.circle.name}`,
      message: `${getUserDisplayName(invitation.invitedBy)} invited you to a Circle. The invitation expires ${toMonthDay(invitation.expiresAt)}.`,
      tone: "positive",
      priority: "high",
      createdAt: now.toISOString(),
      href: getCircleInvitationPath(invitation.token),
      ctaLabel: "View invitation",
    });
  });

  circleActivities.forEach((activity) => {
    items.push({
      id: `circle-activity:${activity.id}`,
      product: "circles",
      productLabel: "Circles",
      productHref: "/circles",
      title: activity.circle.name,
      message: activity.summary,
      tone: "neutral",
      priority: "normal",
      createdAt: activity.createdAt.toISOString(),
      href: "/circles",
      ctaLabel: "View Circle",
    });
  });

  splitRequests.forEach((request) => {
    const statusCopy = request.status === "paid"
      ? { title: "Split bill settled", message: `${request.recipientName} marked ${formatCurrencyAmount(toAmount(request.amount), request.currency)} as paid.`, tone: "positive" as const, cta: null }
      : request.status === "payment_reported"
        ? { title: "Payment reported", message: `${request.recipientName} reported a payment for ${request.bill.title}.`, tone: "warning" as const, cta: "Review payment" }
        : { title: "Payment requested", message: `${formatCurrencyAmount(toAmount(request.amount), request.currency)} was requested for ${request.bill.title}.`, tone: "neutral" as const, cta: "View request" };
    items.push({
      id: `split-request:${request.id}:${request.status}`,
      product: "splitBills",
      productLabel: "Split Bills",
      productHref: "/split-bill",
      title: statusCopy.title,
      message: statusCopy.message,
      tone: statusCopy.tone,
      priority: request.status === "payment_reported" ? "high" : "normal",
      createdAt: request.updatedAt.toISOString(),
      href: statusCopy.cta ? `/split-bill/${request.bill.id}` : null,
      ctaLabel: statusCopy.cta,
    });
  });

  dividends.forEach((dividend) => {
    items.push({
      id: `investment-dividend:${dividend.id}`,
      product: "investments",
      productLabel: "Investments",
      productHref: "/investments",
      title: "Dividend recorded",
      message: `${formatCurrencyAmount(toAmount(dividend.amount), dividend.currency)} was recorded for ${dividend.account.name}.`,
      tone: "positive",
      priority: "normal",
      createdAt: dividend.paidAt.toISOString(),
      href: "/investments",
      ctaLabel: "View investment",
    });
  });

  maturingInvestments.forEach((account) => {
    if (!account.investmentMaturityDate) return;
    items.push({
      id: `investment-maturity:${account.id}:${toDateKey(account.investmentMaturityDate)}`,
      product: "investments",
      productLabel: "Investments",
      productHref: "/investments",
      title: `${account.name} matures soon`,
      message: `This investment matures ${toMonthDay(account.investmentMaturityDate)}. Review your next options.`,
      tone: "warning",
      priority: "high",
      createdAt: account.updatedAt.toISOString(),
      href: "/investments",
      ctaLabel: "Review options",
    });
  });

  const billingProblemStatuses = new Set<BillingSubscriptionStatus>(["suspended", "expired"]);
  if (billingSubscription && billingProblemStatuses.has(billingSubscription.status)) {
    items.push({
      id: `billing:${billingSubscription.id}:${billingSubscription.status}`,
      product: "settings",
      productLabel: "Settings",
      productHref: "/settings?section=plan",
      title: "Subscription needs attention",
      message: "Clover could not confirm an active subscription. Review your plan and payment details.",
      tone: "danger",
      priority: "critical",
      createdAt: billingSubscription.updatedAt.toISOString(),
      href: "/settings?section=plan",
      ctaLabel: "Review subscription",
    });
  }

  return items
    .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 40);
};

export const loadActiveInAppNotifications = async (user: NotificationUser, workspaceId: string, now = new Date()) => {
  const candidates = await buildInAppNotificationCandidates(user, workspaceId, now);
  if (candidates.length === 0) return [];
  const dismissed = await prisma.inAppNotificationDismissal.findMany({
    where: { userId: user.id, notificationKey: { in: candidates.map((item) => item.id) } },
    select: { notificationKey: true },
  });
  const dismissedKeys = new Set(dismissed.map((item) => item.notificationKey));
  return candidates.filter((item) => !dismissedKeys.has(item.id));
};
