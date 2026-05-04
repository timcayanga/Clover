"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";
import { normalizeCurrencyCode, type SplitBillSerializedBill } from "@/lib/split-bill";

type SplitBillGroupSummary = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

type SplitBillWorkspaceProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
  currencies: string[];
  selectedCurrency: string;
};

export function SplitBillWorkspace({ bills, groups, currencies, selectedCurrency }: SplitBillWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentCurrency, setCurrentCurrency] = useState(selectedCurrency);

  useEffect(() => {
    setCurrentCurrency(selectedCurrency);
  }, [selectedCurrency]);

  const handleCurrencyChange = (nextCurrency: string) => {
    const normalized = nextCurrency === "all" ? "ALL" : normalizeCurrencyCode(nextCurrency);
    setCurrentCurrency(normalized);

    startTransition(() => {
      router.replace(normalized === "ALL" ? "/split-bill" : `/split-bill?currency=${encodeURIComponent(normalized)}`);
    });
  };

  return (
    <CloverShell
      active="split-bill"
      title="Split Bill"
      actions={<SplitBillPageActions currencies={currencies} selectedCurrency={currentCurrency} onCurrencyChange={handleCurrencyChange} />}
    >
      <div aria-busy={isPending ? "true" : "false"}>
        <SplitBillHome bills={bills} groups={groups} selectedCurrency={currentCurrency} />
      </div>
    </CloverShell>
  );
}
