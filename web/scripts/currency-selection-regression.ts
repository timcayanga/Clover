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
assert.ok(
  accountsPageSource.includes("const usesFxEstimates = isAllCurrenciesView && visibleAccountCurrencies.length > 1"),
  "Accounts should only show FX estimates for a mixed-currency All Currencies view."
);
assert.ok(
  accountsPageSource.includes("convertAmount(signedValue, row.currency, accountExchangeRates.rates)"),
  "Each Accounts section should use the shared FX rates instead of adding unlike currencies."
);
assert.ok(
  accountsPageSource.includes('accounts-overview-card__info--fx') &&
    accountsPageSource.includes('Values are estimated in ${defaultCurrency} using the latest available exchange rates.'),
  "Mixed-currency summary cards should identify and explain their FX estimates."
);
assert.ok(
  accountsPageSource.includes(': formatAggregateAmount(group.total, group.rows)'),
  "Specific-currency section totals should retain their normal exact-currency display."
);

console.log("Currency selection regression passed.");
