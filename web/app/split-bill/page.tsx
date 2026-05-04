import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import {
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";
import { SplitBillWorkspace } from "@/components/split-bill-workspace";
import { getCurrencyCatalogCodes } from "@/lib/currencies";

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
  const currencyCatalogCodes = getCurrencyCatalogCodes();

  return (
    <SplitBillWorkspace
      bills={bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]))}
      groups={groups}
      currencies={currencyCatalogCodes}
      selectedCurrency={selectedCurrency}
    />
  );
}
