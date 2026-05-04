import { notFound } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillEditor } from "@/components/split-bill-editor";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { prisma } from "@/lib/prisma";
import {
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";

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

export default async function EditSplitBillPage({ params }: { params: Promise<{ billId: string }> }) {
  const user = await getSplitBillCurrentUser();
  const { billId } = await params;

  const [bill, groups] = await Promise.all([
    prisma.splitBill.findFirst({
      where: {
        id: billId,
        userId: user.id,
      },
      include: billInclude,
    }),
    prisma.splitBillGroup.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        members: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
  ]);

  if (!bill) {
    notFound();
  }

  return (
    <CloverShell active="split-bill" title="Edit Split Bill">
      <SplitBillEditor mode="edit" initialBill={serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0])} groups={groups} />
    </CloverShell>
  );
}
