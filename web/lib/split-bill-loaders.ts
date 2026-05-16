import { prisma } from "@/lib/prisma";
import { serializeSplitBillRecord, splitBillGroupMemberOrderBy, splitBillItemOrderBy } from "@/lib/split-bill";
import type { SplitBillGroupSummary, SplitBillPersonSummary } from "@/lib/split-bill-entities";
import { loadSplitBillTransferSettlementsForBills } from "@/lib/split-bill-transfer-settlements";

const billInclude = {
  transaction: {
    select: {
      id: true,
      merchantRaw: true,
      merchantClean: true,
      date: true,
      amount: true,
      currency: true,
      account: {
        select: {
          name: true,
        },
      },
    },
  },
  group: {
    include: {
      members: {
        orderBy: splitBillGroupMemberOrderBy,
      },
    },
  },
  participants: true,
  items: {
    include: {
      participants: true,
    },
    orderBy: splitBillItemOrderBy,
  },
  payments: true,
};

export const loadSplitBillWorkspaceData = async (userId: string) => {
  const [bills, groups, people] = await Promise.all([
    prisma.splitBill.findMany({
      where: { userId },
      orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }],
      include: billInclude,
    }),
    prisma.splitBillGroup.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        members: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            sortOrder: true,
          },
        },
        _count: {
          select: {
            bills: true,
          },
        },
      },
    }),
    prisma.splitBillPerson.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        avatarUrl: true,
      },
    }),
  ]);
  const transferSettlementsByBillId = await loadSplitBillTransferSettlementsForBills(bills.map((bill) => bill.id));

  return {
    bills: bills.map((bill) =>
      serializeSplitBillRecord({
        ...bill,
        transferSettlements: transferSettlementsByBillId.get(bill.id) ?? [],
      } as Parameters<typeof serializeSplitBillRecord>[0])
    ),
    groups: groups as unknown as SplitBillGroupSummary[],
    people: people as unknown as SplitBillPersonSummary[],
  };
};

export const loadSplitBillEditorGroups = async (userId: string) =>
  prisma.splitBillGroup.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      members: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

export const loadSplitBillBill = async (userId: string, billId: string) => {
  const bill = await prisma.splitBill.findFirst({
    where: {
      id: billId,
      userId,
    },
    include: billInclude,
  });

  if (!bill) {
    return null;
  }

  const transferSettlements = await loadSplitBillTransferSettlementsForBills([bill.id]);
  return {
    ...bill,
    transferSettlements: transferSettlements.get(bill.id) ?? [],
  };
};

export const loadSplitBillGroup = async (userId: string, groupId: string) =>
  prisma.splitBillGroup.findFirst({
    where: {
      id: groupId,
      userId,
    },
    include: {
      members: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      _count: {
        select: {
          bills: true,
        },
      },
    },
  });
