"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { CurrencySelector } from "@/components/currency-selector";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatCurrencyCode } from "@/lib/currency-format";

const reportCurrencyOptions = getCurrencyCatalogCodes();

export function ReportsCurrencyFilter({ currentCurrency }: { currentCurrency?: string }) {
  const pathname = usePathname();
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
        // Reports are server-authored. A document handoff avoids the slower streamed
        // RSC replacement while preserving the same URL and calculation semantics.
        window.location.replace(query ? `${targetPath}?${query}` : targetPath);
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
