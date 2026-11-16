import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { matchInvestmentLogo } from "../lib/investment-logo-matching";
import { getInvestmentAssetBrand } from "../lib/investment-assets";

const cases = [
  [{ name: "Apple Inc", subtype: "stock" }, "/assets/investments/us/AAPL.svg"],
  [{ name: "Jollibee Foods Corporation", subtype: "stock" }, "/assets/investments/philippines/JFC.svg"],
  [{ name: "Bitcoin", subtype: "crypto" }, "/assets/investments/crypto/BTC.svg"],
  [{ symbol: "PSE:BPI", subtype: "stock" }, "/assets/investments/philippines/BPI.svg"],
  [{ symbol: "NASDAQ:AAPL", subtype: "stock" }, "/assets/investments/us/AAPL.svg"],
  [{ symbol: "C", subtype: "stock", currency: "PHP" }, null],
  [{ symbol: "PSE:C", subtype: "stock" }, "/assets/investments/philippines/C.svg"],
  [{ symbol: "NYSE:C", subtype: "stock" }, "/assets/investments/us/C.svg"],
  [{ symbol: "PSE:C", subtype: "stock", market: "us" }, null],
  [{ symbol: "TSLA", name: "Apple Inc", subtype: "stock" }, null],
  [{ symbol: "BTC", subtype: "stock" }, null],
  [{ symbol: "AAPL", subtype: "crypto" }, null],
  [{ name: "Apple savings", subtype: "stock" }, null],
  [{ name: "Unknown Company", subtype: "stock" }, null],
  [{ symbol: "AAPL", subtype: "time_deposit" }, null],
  [{ symbol: "../us/AAPL", subtype: "stock" }, null],
] as const;
for (const [input, expected] of cases) {
  assert.equal(matchInvestmentLogo(input), expected, JSON.stringify(input));
  if (expected) assert.ok(existsSync(path.resolve(__dirname, "../..", expected.slice(1))), expected);
}
const unknown = getInvestmentAssetBrand({ name: "Unknown Company", subtype: "stock", institution: "BPI" });
assert.deepEqual(unknown.logoSrcs, [], "The broker must not stand in for an unknown asset");
assert.ok(unknown.fallbackIconSrc, "An unmatched asset retains its default icon");
console.log(`Investment logos passed: ${cases.length} identity cases, local files and broker-safe fallback.`);
