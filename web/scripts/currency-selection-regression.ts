import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clearSelectedCurrencyPreferences,
  persistSelectedCurrency,
  readSelectedCurrency,
  selectedCurrencyByWorkspaceKey,
} from "@/lib/workspace-selection";
import {
  fallbackDefaultCurrency,
  readDefaultCurrency,
  regionalPreferencesStorageKey,
} from "@/lib/regional-preferences";
import { convertAmount } from "@/lib/use-exchange-rates";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage },
});

assert.equal(readSelectedCurrency("workspace-a"), null);
assert.equal(readDefaultCurrency(), fallbackDefaultCurrency, "Default currency should safely fall back to PHP.");

localStorage.setItem(regionalPreferencesStorageKey, JSON.stringify({ baseCurrency: "usd", dateFormat: "MM/DD/YYYY" }));
assert.equal(readDefaultCurrency(), "USD", "The Settings currency should be normalized for every page.");
assert.equal(convertAmount(100, "USD", { USD: 1, GBP: 1.25 }), 100);
assert.equal(convertAmount(100, "GBP", { USD: 1, GBP: 1.25 }), 125);
assert.equal(convertAmount(100, "EUR", { USD: 1, GBP: 1.25 }), null, "Missing rates must not produce a mixed total.");

persistSelectedCurrency("workspace-a", "gbp");
persistSelectedCurrency("workspace-b", "usd");
assert.equal(readSelectedCurrency("workspace-a"), "GBP");
assert.equal(readSelectedCurrency("workspace-b"), "USD");

persistSelectedCurrency("workspace-a", "");
assert.equal(readSelectedCurrency("workspace-a"), "", "All currencies must persist distinctly from a missing preference.");
assert.equal(readSelectedCurrency("workspace-b"), "USD", "Currency preferences must remain isolated by workspace.");

clearSelectedCurrencyPreferences();
assert.equal(readSelectedCurrency("workspace-a"), null, "Changing the default currency must reset older workspace view overrides.");
assert.equal(readSelectedCurrency("workspace-b"), null, "The new default must apply consistently across workspaces.");

localStorage.setItem(selectedCurrencyByWorkspaceKey, "{invalid");
assert.equal(readSelectedCurrency("workspace-a"), null, "Corrupt browser storage must safely fall back to page defaults.");

const accountsPageSource = readFileSync(resolve(process.cwd(), "app/accounts/page.tsx"), "utf8");
const investmentsPageSource = readFileSync(resolve(process.cwd(), "app/investments/page.tsx"), "utf8");
const transactionsPageSource = readFileSync(resolve(process.cwd(), "app/transactions/page.tsx"), "utf8");
const currencySelectorSource = readFileSync(resolve(process.cwd(), "components/currency-selector.tsx"), "utf8");
const globalStylesSource = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const compactTransactionsActions = transactionsPageSource.slice(
  transactionsPageSource.indexOf('className="transactions-shell-actions transactions-shell-actions--compact"'),
  transactionsPageSource.indexOf('className="transactions-shell-actions"', transactionsPageSource.indexOf('className="transactions-shell-actions transactions-shell-actions--compact"') + 1),
);
assert.ok(
  currencySelectorSource.includes("currency-selector__all-icon") &&
    globalStylesSource.includes(".content--accounts .accounts-currency-filter .currency-selector__all-label"),
  "All Currencies must use an unclipped icon in the compact Accounts header."
);
assert.ok(
  !compactTransactionsActions.includes("<CurrencySelector") &&
    transactionsPageSource.includes("transactions-filter-group--currency") &&
    transactionsPageSource.includes('ariaLabel="Filter transactions by currency"'),
  "Mobile Transactions must keep Currency inside Filters instead of crowding the centered page title."
);
assert.ok(
  accountsPageSource.includes("visibleAccountCurrencies.some((currency) => currency !== defaultCurrencyCode)"),
  "Accounts should show FX estimates whenever All Currencies includes a non-default currency."
);
assert.ok(
  accountsPageSource.includes("convertAmount(signedValue, row.currency, accountExchangeRates.rates)"),
  "Each Accounts section should use the shared FX rates instead of adding unlike currencies."
);
assert.ok(
  !accountsPageSource.includes('accounts-overview-card__info--fx') &&
    accountsPageSource.includes('<button className="accounts-overview-card__info"') &&
    accountsPageSource.includes('Values are estimated in ${defaultCurrency} using the latest available exchange rates.'),
  "Mixed-currency summary cards should explain FX through Clover's standard information icon."
);
assert.ok(
  accountsPageSource.includes("const usesFxEstimate =") &&
    accountsPageSource.includes("groupCurrencies.some((currency) => currency !== defaultCurrencyCode)") &&
    accountsPageSource.includes(': formatAggregateAmount(group.total, group.rows)'),
  "Sections containing only the default currency should retain their exact total without an estimate label."
);
assert.ok(
  investmentsPageSource.includes("const usesPortfolioFxEstimates =") &&
    investmentsPageSource.includes("convertAmount(currentValue, account.currency, portfolioExchangeRates.rates)") &&
    investmentsPageSource.includes("convertAmount(purchaseValue, account.currency, portfolioExchangeRates.rates)"),
  "Investments should convert each holding value and purchase value before calculating mixed-currency totals."
);
assert.ok(
  investmentsPageSource.includes("formatPortfolioSummary(estimatedPortfolioTotals.currentValue)") &&
    investmentsPageSource.includes("formatPortfolioSummary(estimatedPortfolioTotals.gainLoss)") &&
    !investmentsPageSource.includes('? formatInvestmentAggregate(estimatedPortfolioTotals.currentValue, selectedCurrencyInvestmentAccounts)'),
  "Investment summary cards should show FX estimates instead of a Mixed currencies placeholder."
);
assert.ok(
  investmentsPageSource.includes("Values are estimated in ${defaultCurrencyCode} using the latest available exchange rates.") &&
    investmentsPageSource.includes("!portfolioEstimateUnavailable && estimatedPortfolioTotals.purchaseValue > 0"),
  "Investment FX summaries should explain their rates and calculate ROI from converted values only when rates are complete."
);

const exchangeRateSource = readFileSync(resolve(process.cwd(), "lib/use-exchange-rates.ts"), "utf8");
assert.ok(
  exchangeRateSource.includes('const rateCacheStorageKey = "clover.exchange-rates.v1"') &&
    exchangeRateSource.includes("const missingSources = sources.filter"),
  "Exchange rates should render from a bounded browser cache before refreshing missing rates."
);

console.log("Currency selection regression passed.");
