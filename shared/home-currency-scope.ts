/** A currency filter selects records; only All converts totals into Profile currency. */
export function homeCurrencyScope(selection: string | undefined, profileCurrency: string) {
  const normalized = selection?.trim().toUpperCase();
  const selected = normalized && /^(ALL|[A-Z]{3})$/.test(normalized) ? normalized : profileCurrency;
  return {
    selected,
    allCurrencies: selected === "ALL",
    displayCurrency: selected === "ALL" ? profileCurrency : selected,
    includes: (currency: string) => selected === "ALL" || currency.toUpperCase() === selected,
  };
}
