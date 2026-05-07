import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import {
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";
import { SplitBillWorkspace } from "@/components/split-bill-workspace";
import type { SplitBillGroupSummary, SplitBillPersonSummary } from "@/lib/split-bill-entities";

export const dynamic = "force-dynamic";

const billInclude = {
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

export default async function SplitBillPage() {
  const user = await getSplitBillCurrentUser();

  const [bills, groups, people] = await Promise.all([
    prisma.splitBill.findMany({
      where: { userId: user.id },
      orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }],
      include: billInclude,
    }),
    prisma.splitBillGroup.findMany({
      where: { userId: user.id },
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
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        avatarUrl: true,
      },
    }),
  ]);

  return (
    <SplitBillWorkspace
      bills={bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]))}
      groups={groups as SplitBillGroupSummary[]}
      people={people as SplitBillPersonSummary[]}
    />
  );
}
