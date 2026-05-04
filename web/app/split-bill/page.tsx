import { prisma } from "@/lib/prisma";
import { CloverShell } from "@/components/clover-shell";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import {
  serializeSplitBillRecord,
  normalizeCurrencyCode,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";

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

export default async function SplitBillPage({ searchParams }: { searchParams?: Promise<{ add?: string; group?: string; currency?: string }> }) {
  const user = await getSplitBillCurrentUser();
  const params = searchParams ? await searchParams : undefined;
  const selectedCurrency = params?.currency ? params.currency.toUpperCase() : "ALL";

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
  const normalizedCurrencies = Array.from(new Set(bills.map((bill) => normalizeCurrencyCode(bill.currency)).filter(Boolean))).sort();

  return (
    <CloverShell
      active="split-bill"
      title="Split Bill"
      actions={<SplitBillPageActions currencies={normalizedCurrencies} selectedCurrency={selectedCurrency} />}
    >
      <SplitBillHome
        bills={bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]))}
        groups={groups}
        selectedCurrency={selectedCurrency}
      />
    </CloverShell>
  );
}
