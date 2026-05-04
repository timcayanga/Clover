import Link from "next/link";
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

const buildSplitBillHref = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/split-bill?${query}` : "/split-bill";
};

const splitBillPageActions = ({ currencies, selectedCurrency }: { currencies: string[]; selectedCurrency: string }) => (
  <div className="split-bill-page-actions">
    <details className="split-bill-currency-menu">
      <summary className="button button-secondary button-small">{selectedCurrency === "ALL" ? "All currencies" : selectedCurrency}</summary>
      <div className="split-bill-add-menu__panel">
        {["ALL", ...currencies].map((currency) => (
          <Link
            key={currency}
            className="split-bill-add-menu__item"
            href={buildSplitBillHref({ currency, add: null, group: null })}
            prefetch={false}
          >
            {currency === "ALL" ? "All currencies" : currency}
          </Link>
        ))}
      </div>
    </details>

    <details className="split-bill-add-menu">
      <summary className="button button-primary button-small">Add Bill</summary>
      <div className="split-bill-add-menu__panel">
        <Link className="split-bill-add-menu__item" href={buildSplitBillHref({ add: "manual", currency: selectedCurrency })} prefetch={false}>
          Add manually
        </Link>
        <Link className="split-bill-add-menu__item" href={buildSplitBillHref({ add: "import", currency: selectedCurrency })} prefetch={false}>
          Import files
        </Link>
      </div>
    </details>

    <Link className="button button-secondary button-small" href={buildSplitBillHref({ group: "new", currency: selectedCurrency })} prefetch={false}>
      Add Group
    </Link>
  </div>
);

export default async function SplitBillPage({ searchParams }: { searchParams?: Promise<{ add?: string; group?: string; currency?: string }> }) {
  const user = await getSplitBillCurrentUser();
  const params = searchParams ? await searchParams : undefined;
  const showAddMode = params?.add === "manual" ? "manual" : params?.add === "import" ? "import" : null;
  const showGroupMode = params?.group === "new" ? "new" : null;
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
      actions={showAddMode || showGroupMode ? null : splitBillPageActions({ currencies: normalizedCurrencies, selectedCurrency })}
    >
      <SplitBillHome
        bills={bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]))}
        groups={groups}
        selectedCurrency={selectedCurrency}
        initialAddMode={showAddMode}
        initialGroupMode={showGroupMode}
      />
    </CloverShell>
  );
}
