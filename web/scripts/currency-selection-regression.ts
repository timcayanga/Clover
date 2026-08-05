import { strict as assert } from "node:assert";
import {
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

localStorage.setItem(selectedCurrencyByWorkspaceKey, "{invalid");
assert.equal(readSelectedCurrency("workspace-a"), null, "Corrupt browser storage must safely fall back to page defaults.");

console.log("Currency selection regression passed.");
