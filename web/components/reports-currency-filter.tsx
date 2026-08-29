"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CurrencySelector } from "@/components/currency-selector";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatCurrencyCode } from "@/lib/currency-format";

const reportCurrencyOptions = getCurrencyCatalogCodes();

export function ReportsCurrencyFilter({ currentCurrency }: { currentCurrency?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = currentCurrency || "all";

  return (
    <CurrencySelector
      value={value}
      onChange={(next) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        const targetPath = pathname || "/reports";
        if (next.toLowerCase() === "all") {
          params.delete("currency");
        } else {
          params.set("currency", formatCurrencyCode(next));
        }
        const query = params.toString();
        router.replace(query ? `${targetPath}?${query}` : targetPath, { scroll: false });
      }}
      options={reportCurrencyOptions}
      includeAllOption
      allLabel="All currencies"
      ariaLabel="Filter reports by currency"
      className="transactions-currency-filter reports-currency-filter"
      buttonClassName="transactions-currency-filter__button reports-currency-filter__button"
      menuClassName="transactions-currency-filter__menu reports-currency-filter__menu"
      optionClassName="transactions-currency-filter__option"
      compact
      menuAlignment="end"
      showGroupedSections
      showChevron={false}
      portalMenu
    />
  );
}
