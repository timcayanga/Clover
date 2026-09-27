"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CurrencySelector } from "./currency-selector";
export function HomeCurrencySelector({ value, options, mobile = false }: { value: string; options: string[]; mobile?: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  return <CurrencySelector value={value} options={options} includeAllOption allLabel="All Currencies"
    ariaLabel="Home currency" iconOnly={mobile} compact showCurrencyCode={!mobile} portalMenu disabled={pending}
    className={mobile ? "home-currency-mobile" : "home-currency-desktop"}
    onChange={currency => { const params = new URLSearchParams(search?.toString()); params.set("currency", currency.toUpperCase()); startTransition(() => router.replace(`${pathname ?? "/home"}?${params}`, { scroll: false })); }} />;
}
