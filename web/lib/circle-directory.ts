import { prisma } from "@/lib/prisma";
import { getMonthBounds, type CirclesWorkspaceData } from "@/lib/circles";
import { getUserDisplayName } from "@/lib/user-display-name";
import type { User } from "@prisma/client";

// Match the detail view's ordering, limits and split-bill de-duplication exactly.
// Only the amount/date fields needed for the card cross the database boundary.
export async function loadCirclesDirectoryData(user: User): Promise<CirclesWorkspaceData> {
  const { start, end } = getMonthBounds(new Date());
  const circles = await prisma.circle.findMany({
    where: {
      archivedAt: null,
      OR: [{ ownerUserId: user.id }, { memberships: { some: { userId: user.id, status: "active" } } }],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, name: true, type: true, description: true, avatarUrl: true,
      color: true, currency: true, ownerUserId: true, updatedAt: true,
      _count: { select: { memberships: { where: { status: "active" } } } },
      memberships: { where: { userId: user.id, status: "active" }, select: { role: true }, take: 1 },
      sharedTransactions: {
        where: { transaction: { deletedAt: null, isExcluded: false, type: "expense" } },
        orderBy: { createdAt: "desc" }, take: 100,
        select: { transactionId: true, sharedAmount: true, transaction: { select: { date: true, amount: true } } },
      },
      splitBillGroup: { select: { id: true, bills: {
        orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }], take: 100,
        select: { transactionId: true, billDate: true, total: true },
      } } },
    },
  });
  return {
    currentUserId: user.id, currentUserName: getUserDisplayName(user),
    personalTransactions: [], investmentAccounts: [],
    circles: circles.map((circle) => {
      const bills = circle.splitBillGroup?.bills ?? [];
      const splitIds = new Set(bills.map((bill) => bill.transactionId).filter(Boolean));
      const expenseTotalThisMonth = bills
        .filter((bill) => bill.billDate >= start && bill.billDate < end)
        .reduce((sum, bill) => sum + Math.abs(Number(bill.total)), 0)
        + circle.sharedTransactions
          .filter((entry) => entry.transaction.date >= start && entry.transaction.date < end && !splitIds.has(entry.transactionId))
          .reduce((sum, entry) => sum + Math.abs(Number(entry.sharedAmount ?? entry.transaction.amount)), 0);
      return {
        id: circle.id, name: circle.name, type: circle.type, description: circle.description,
        avatarUrl: circle.avatarUrl, color: circle.color, currency: circle.currency,
        role: circle.ownerUserId === user.id ? "organizer" : circle.memberships[0]?.role ?? "participant",
        isOwner: circle.ownerUserId === user.id, memberCount: circle._count.memberships,
        splitBillGroupId: circle.splitBillGroup?.id ?? null, updatedAt: circle.updatedAt.toISOString(),
        expenseTotalThisMonth, detailsLoaded: false,
        pendingCount: 0, contributionTotalThisMonth: 0,
        members: [], budgets: [], goals: [], commitments: [], contributions: [], expenses: [],
        investmentShares: [], activities: [], invitations: [], insights: [],
      };
    }),
  };
}
