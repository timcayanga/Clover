import Link from "next/link";
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

const splitBillPageActions = (
  <div className="split-bill-page-actions">
    <details className="split-bill-add-menu">
      <summary className="button button-primary button-small">Add Bill</summary>
      <div className="split-bill-add-menu__panel">
        <Link className="split-bill-add-menu__item" href="/split-bill?add=manual" prefetch={false}>
          Add manually
        </Link>
        <Link className="split-bill-add-menu__item" href="/split-bill/new" prefetch={false}>
          Import files
        </Link>
      </div>
    </details>
    <Link className="button button-secondary button-small" href="#split-bill-groups" prefetch={false}>
      Add Group
    </Link>
  </div>
);

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

export default async function SplitBillPage({ searchParams }: { searchParams?: Promise<{ add?: string }> }) {
  const user = await getSplitBillCurrentUser();
  const params = searchParams ? await searchParams : undefined;
  const showAddMode = params?.add === "manual" ? "manual" : params?.add === "import" ? "import" : null;

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
      actions={splitBillPageActions}
    >
      <SplitBillHome bills={bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]))} groups={groups} initialAddMode={showAddMode} />
    </CloverShell>
  );
}
