import assert from "node:assert/strict";
import {
  detectCurrencyEvidence,
  detectUnknownInstitutionEvidence,
  normalizeGlobalCurrencyCode,
} from "@/lib/financial-identity-detection";
import { detectStatementMetadata } from "@/lib/import-parser";

const assertCurrency = (text: string, currency: string) => {
  const result = detectCurrencyEvidence(text);
  assert.equal(result.currency, currency, `${text}: ${JSON.stringify(result)}`);
  assert.equal(result.ambiguous, false);
};

assert.equal(normalizeGlobalCurrencyCode("U.S. Dollar"), "USD");
assert.equal(normalizeGlobalCurrencyCode("PHILIPPINEPESO"), "PHP");
assert.equal(normalizeGlobalCurrencyCode("A$"), "AUD");
assert.equal(normalizeGlobalCurrencyCode("Peruvian sol"), "PEN");
assert.equal(normalizeGlobalCurrencyCode("SOL"), "SOL", "Crypto SOL must remain distinct from PEN.");

assertCurrency("Account currency: AED\nClosing balance AED 1,250.00", "AED");
assertCurrency("Statement currency KWD\nBalance KWD 82.500", "KWD");
assertCurrency("Available balance R$ 1.234,56", "BRL");
assertCurrency("Available balance A$ 1,234.56", "AUD");
assertCurrency("Available balance S$ 1,234.56", "SGD");
assertCurrency("Available balance CN¥ 8,000", "CNY");
assertCurrency("Available balance JP¥ 8,000", "JPY");
assertCurrency("Account Currency: GBP\nForeign transaction amount EUR 25.00", "GBP");
assertCurrency("Account currency: VND\nClosing balance ₫1,200,000", "VND");
assertCurrency("Currency code: ZAR\nClosing balance R 8,200.00", "ZAR");

assert.deepEqual(detectCurrencyEvidence("Closing balance $1,234.56"), {
  currency: null,
  confidence: 0,
  ambiguous: true,
  evidence: ["ambiguous currency symbol"],
});
assert.equal(detectCurrencyEvidence("Closing balance ¥8,000").currency, null, "Bare yen/yuan symbol must not guess JPY or CNY.");

const monzo = detectUnknownInstitutionEvidence(`
Monzo Bank Limited
Account Statement
Account number: 12345678
Opening balance £10.00
`);
assert.equal(monzo.institution, "Monzo Bank Limited");
assert.ok(monzo.confidence >= 80);

assert.equal(
  detectUnknownInstitutionEvidence("Bank name: Emirates NBD PJSC\nAccount statement\nAccount number: 123456").institution,
  "Emirates NBD PJSC"
);
assert.equal(
  detectUnknownInstitutionEvidence("Banco de Crédito del Perú\nEstado de cuenta\nAccount number: 12345678\nClosing balance PEN 10.00").institution,
  "Banco de Crédito del Perú"
);
assert.equal(
  detectUnknownInstitutionEvidence("Banque Misr\nAccount statement\nAccount number: 12345678\nClosing balance EGP 10.00").institution,
  "Banque Misr"
);

assert.equal(
  detectUnknownInstitutionEvidence("Account statement\nBeneficiary bank: Random Bank\nTransfer to Starling Bank\nClosing balance $10.00").institution,
  null,
  "Counterparty banks must not become the account institution."
);

const unknownStatement = detectStatementMetadata(`
Northstar Credit Union
Account Statement
Statement currency: CAD
Account Number: 99887766
Statement Period: 2026-01-01 to 2026-01-31
Opening Balance C$ 1,000.00
Closing Balance C$ 900.00
`, "northstar-statement.pdf");
assert.ok(unknownStatement);
assert.equal(unknownStatement.institution, "Northstar Credit Union");
assert.equal(unknownStatement.currency, "CAD");
assert.ok((unknownStatement.currencyConfidence ?? 0) >= 80);
assert.ok((unknownStatement.institutionConfidence ?? 0) >= 80);
assert.ok((unknownStatement.identityEvidence?.length ?? 0) > 0);

const counterpartyOnly = detectStatementMetadata(`
Account Statement
Account Number: 11223344
Statement currency: GBP
Opening Balance GBP 100.00
2026-01-03 Transfer to HSBC GBP 25.00
Closing Balance GBP 75.00
`, "account-statement.pdf");
assert.ok(counterpartyOnly);
assert.notEqual(counterpartyOnly.institution, "HSBC", "A transaction counterparty must not become the statement institution.");

console.log("Financial identity detection regression passed.");
