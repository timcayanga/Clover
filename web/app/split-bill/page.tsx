import { prisma } from "@/lib/prisma";
import { CloverShell } from "@/components/clover-shell";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import {
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";
import { SplitBillHome } from "@/components/split-bill-home";

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

  const [bills, groups] = await Promise.all([
    prisma.splitBill.findMany({
      where: { userId: user.id },
      orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }],
      include: billInclude,
    }),
    prisma.splitBillGroup.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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
    }),
  ]);

  return (
    <CloverShell
      active="split-bill"
      title="Split Bill"
      kicker="More"
      subtitle="Keep receipt splitting separate from Clover's finance ledger."
    >
      <SplitBillHome
        bills={bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]))}
        groups={groups}
      />
    </CloverShell>
  );
}
