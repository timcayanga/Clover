import { prisma } from "@/lib/prisma";
import { getUserDisplayName } from "@/lib/user-display-name";
import {
  buildCircleInsights,
  calculateGoalForecast,
  clampPercent,
  getMonthBounds,
  type CircleBudgetSummary,
  type CircleExpenseSummary,
  type CircleGoalSummary,
  type CircleMemberSummary,
  type CircleSummary,
  type CirclesWorkspaceData,
} from "@/lib/circles";
import type { User } from "@prisma/client";

const numberValue = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const toIso = (value: Date | null | undefined) => value?.toISOString() ?? null;

export const loadCirclesWorkspaceData = async (
  user: User,
): Promise<CirclesWorkspaceData> => {
  const now = new Date();
  const { start, end } = getMonthBounds(now);
  const circles = await prisma.circle.findMany({
    where: {
      archivedAt: null,
      OR: [
        { ownerUserId: user.id },
        { memberships: { some: { userId: user.id, status: "active" } } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      memberships: {
        where: { status: { in: ["active", "invited"] } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      budgets: { orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] },
      goals: {
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        include: { contributions: { orderBy: { contributionDate: "asc" } } },
      },
      commitments: {
        orderBy: [
          { isActive: "desc" },
          { nextDueDate: "asc" },
          { createdAt: "desc" },
        ],
        include: { assignedMember: true },
      },
      contributions: {
        orderBy: { contributionDate: "desc" },
        include: { member: true },
        take: 200,
      },
      sharedTransactions: {
        where: { transaction: { deletedAt: null, type: "expense" } },
        orderBy: { createdAt: "desc" },
        include: {
          transaction: { include: { category: true } },
        },
        take: 100,
      },
      investmentShares: {
        orderBy: { createdAt: "desc" },
        include: { account: true },
      },
      splitBillGroup: {
        include: {
          bills: {
            orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }],
            take: 100,
          },
        },
      },
      invitations: {
        where: { status: "pending", expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { actor: true },
      },
    },
  });

  const serializedCircles: CircleSummary[] = circles.map((circle) => {
    const currentMembership =
      circle.memberships.find((membership) => membership.userId === user.id) ??
      null;
    const role =
      circle.ownerUserId === user.id
        ? "organizer"
        : (currentMembership?.role ?? "participant");
    const monthlyContributions = circle.contributions.filter(
      (entry) =>
        entry.contributionDate >= start && entry.contributionDate < end,
    );
    const memberContributionMap = new Map<string, number>();
    for (const entry of monthlyContributions) {
      if (entry.memberId) {
        memberContributionMap.set(
          entry.memberId,
          (memberContributionMap.get(entry.memberId) ?? 0) +
            numberValue(entry.amount),
        );
      }
    }

    const members: CircleMemberSummary[] = circle.memberships.map(
      (membership) => ({
        id: membership.id,
        userId: membership.userId,
        isOwner: membership.userId === circle.ownerUserId,
        displayName: membership.displayName,
        email:
          role === "organizer" || membership.userId === user.id
            ? membership.email
            : null,
        role: membership.role,
        status: membership.status,
        contributionTarget:
          membership.contributionTarget === null
            ? null
            : numberValue(membership.contributionTarget),
        contributionCadence: membership.contributionCadence,
        contributedThisMonth: memberContributionMap.get(membership.id) ?? 0,
      }),
    );

    const splitBillTransactionIds = new Set(
      (circle.splitBillGroup?.bills ?? [])
        .map((bill) => bill.transactionId)
        .filter((value): value is string => Boolean(value)),
    );
    const splitExpenses: CircleExpenseSummary[] = (
      circle.splitBillGroup?.bills ?? []
    ).map((bill) => ({
      id: bill.id,
      kind: "split_bill",
      title: bill.title,
      amount: Math.abs(numberValue(bill.total)),
      currency: bill.currency,
      date: bill.billDate.toISOString(),
      visibility: "circle_owned",
      href: `/split-bill?bill=${encodeURIComponent(bill.id)}`,
      settled: null,
    }));
    const sharedExpenses: CircleExpenseSummary[] =
      circle.sharedTransactions.map((entry) => {
        const transaction = entry.transaction;
        const amount =
          entry.sharedAmount === null
            ? Math.abs(numberValue(transaction.amount))
            : Math.abs(numberValue(entry.sharedAmount));
        const canSeeItem = entry.visibility !== "summary";
        return {
          id: entry.id,
          kind: "shared_transaction",
          title: canSeeItem
            ? entry.sharedTitle ||
              transaction.merchantClean ||
              transaction.merchantRaw ||
              "Shared transaction"
            : "Shared expense",
          amount,
          currency: transaction.currency,
          date: transaction.date.toISOString(),
          visibility: entry.visibility,
          href: canSeeItem
            ? `/transactions?q=${encodeURIComponent(transaction.merchantClean || transaction.merchantRaw)}`
            : "/circles",
          settled: null,
        };
      });
    const expenses = [...splitExpenses, ...sharedExpenses].sort(
      (left, right) =>
        new Date(right.date).getTime() - new Date(left.date).getTime(),
    );
    const monthlySplitExpenseTotal = (circle.splitBillGroup?.bills ?? [])
      .filter((bill) => bill.billDate >= start && bill.billDate < end)
      .reduce((sum, bill) => sum + Math.abs(numberValue(bill.total)), 0);
    const monthlySharedExpenseTotal = circle.sharedTransactions
      .filter(
        (entry) =>
          entry.transaction.date >= start &&
          entry.transaction.date < end &&
          !splitBillTransactionIds.has(entry.transactionId),
      )
      .reduce(
        (sum, entry) =>
          sum +
          Math.abs(
            entry.sharedAmount === null
              ? numberValue(entry.transaction.amount)
              : numberValue(entry.sharedAmount),
          ),
        0,
      );
    const expenseTotalThisMonth =
      monthlySplitExpenseTotal + monthlySharedExpenseTotal;

    const budgets: CircleBudgetSummary[] = circle.budgets.map((budget) => {
      const normalizedCategory =
        budget.categoryName?.trim().toLowerCase() ?? "";
      const spentAmount = normalizedCategory
        ? circle.sharedTransactions
            .filter(
              (entry) =>
                entry.transaction.date >= start &&
                entry.transaction.date < end &&
                entry.transaction.category?.name.trim().toLowerCase() ===
                  normalizedCategory,
            )
            .reduce(
              (sum, entry) =>
                sum +
                Math.abs(
                  entry.sharedAmount === null
                    ? numberValue(entry.transaction.amount)
                    : numberValue(entry.sharedAmount),
                ),
              0,
            )
        : expenseTotalThisMonth;
      const targetAmount = numberValue(budget.targetAmount);
      return {
        id: budget.id,
        name: budget.name,
        targetAmount,
        spentAmount,
        remainingAmount: targetAmount - spentAmount,
        progressPercent:
          targetAmount > 0
            ? clampPercent((spentAmount / targetAmount) * 100)
            : 0,
        currency: budget.currency,
        cadence: budget.cadence,
        categoryName: budget.categoryName,
        isActive: budget.isActive,
      };
    });

    const goals: CircleGoalSummary[] = circle.goals.map((goal) => {
      const currentAmount =
        numberValue(goal.startingAmount) +
        goal.contributions.reduce(
          (sum, entry) => sum + numberValue(entry.amount),
          0,
        );
      const targetAmount = numberValue(goal.targetAmount);
      const forecast = calculateGoalForecast({
        currentAmount,
        targetAmount,
        now,
        contributions: goal.contributions.map((entry) => ({
          amount: numberValue(entry.amount),
          contributionDate: entry.contributionDate,
        })),
      });
      return {
        id: goal.id,
        name: goal.name,
        purpose: goal.purpose,
        targetAmount,
        currentAmount,
        remainingAmount: Math.max(0, targetAmount - currentAmount),
        progressPercent:
          targetAmount > 0
            ? clampPercent((currentAmount / targetAmount) * 100)
            : 0,
        currency: goal.currency,
        targetDate: toIso(goal.targetDate),
        status: goal.status,
        estimatedCompletionDate: toIso(forecast.estimatedCompletionDate),
        estimateConfidence: forecast.confidence,
        estimateReason: forecast.reason,
      };
    });

    const contributionTotalThisMonth = monthlyContributions.reduce(
      (sum, entry) => sum + numberValue(entry.amount),
      0,
    );
    const insights = buildCircleInsights({
      currency: circle.currency,
      expenseTotalThisMonth,
      contributionTotalThisMonth,
      budgets,
      goals,
      members,
    });
    const membershipInvitationKeys = new Set(
      members.flatMap((member) =>
        [member.email, member.displayName]
          .filter((value): value is string => Boolean(value?.trim()))
          .map((value) => value.trim().toLowerCase()),
      ),
    );
    const invitationOnlyCount = circle.invitations.filter((invitation) => {
      const keys = [invitation.email, invitation.displayName]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim().toLowerCase());
      return keys.length === 0 ||
        !keys.some((key) => membershipInvitationKeys.has(key));
    }).length;

    return {
      id: circle.id,
      name: circle.name,
      type: circle.type,
      description: circle.description,
      avatarUrl: circle.avatarUrl,
      color: circle.color,
      currency: circle.currency,
      role,
      isOwner: circle.ownerUserId === user.id,
      splitBillGroupId: circle.splitBillGroup?.id ?? null,
      memberCount: members.filter((member) => member.status === "active")
        .length,
      pendingCount:
        members.filter((member) => member.status === "invited").length +
        invitationOnlyCount,
      expenseTotalThisMonth,
      contributionTotalThisMonth,
      updatedAt: circle.updatedAt.toISOString(),
      members,
      budgets,
      goals,
      commitments: circle.commitments.map((commitment) => ({
        id: commitment.id,
        title: commitment.title,
        amount:
          commitment.amount === null ? null : numberValue(commitment.amount),
        currency: commitment.currency,
        recurrence: commitment.recurrence,
        nextDueDate: toIso(commitment.nextDueDate),
        notes: commitment.notes,
        isActive: commitment.isActive,
        assignedMemberId: commitment.assignedMemberId,
        assignedMemberName: commitment.assignedMember?.displayName ?? null,
      })),
      contributions: circle.contributions.map((entry) => ({
        id: entry.id,
        memberId: entry.memberId,
        memberName: entry.member?.displayName ?? null,
        goalId: entry.goalId,
        amount: numberValue(entry.amount),
        currency: entry.currency,
        contributionDate: entry.contributionDate.toISOString(),
        note: entry.note,
      })),
      expenses,
      investmentShares: circle.investmentShares.map((entry) => ({
        id: entry.id,
        accountId: entry.accountId,
        name:
          entry.visibility === "summary"
            ? "Investment summary"
            : entry.account.name,
        institution:
          entry.visibility === "summary" ? null : entry.account.institution,
        balance:
          entry.account.balance === null
            ? null
            : numberValue(entry.account.balance),
        currency: entry.account.currency,
        visibility: entry.visibility,
        includeHoldings:
          entry.includeHoldings && entry.visibility !== "summary",
      })),
      activities: circle.activities.map((activity) => ({
        id: activity.id,
        action: activity.action,
        summary: activity.summary,
        actorName: activity.actor ? getUserDisplayName(activity.actor) : null,
        createdAt: activity.createdAt.toISOString(),
      })),
      invitations:
        role === "organizer"
          ? circle.invitations.map((invitation) => ({
              id: invitation.id,
              email: invitation.email,
              displayName: invitation.displayName,
              role: invitation.role,
              status: invitation.status,
              shareUrl: `/circles/join/${invitation.token}`,
              expiresAt: invitation.expiresAt.toISOString(),
            }))
          : [],
      insights,
    };
  });

  const [personalTransactions, investmentAccounts] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        workspace: { userId: user.id },
        deletedAt: null,
        type: "expense",
      },
      orderBy: { date: "desc" },
      take: 40,
      include: { workspace: true },
    }),
    prisma.account.findMany({
      where: { workspace: { userId: user.id }, type: "investment" },
      orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
      take: 30,
    }),
  ]);

  return {
    circles: serializedCircles,
    currentUserId: user.id,
    currentUserName: getUserDisplayName(user),
    personalTransactions: personalTransactions.map((transaction) => ({
      id: transaction.id,
      title:
        transaction.merchantClean || transaction.merchantRaw || "Transaction",
      amount: Math.abs(numberValue(transaction.amount)),
      currency: transaction.currency,
      date: transaction.date.toISOString(),
      workspaceName: transaction.workspace.name,
    })),
    investmentAccounts: investmentAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      institution: account.institution,
      balance: account.balance === null ? null : numberValue(account.balance),
      currency: account.currency,
    })),
  };
};
