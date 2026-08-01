import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyMerchant } from "../lib/data-engine";
import { getTransactionSummaryTypeOverrides } from "../lib/transaction-summary";

const rows = [
  {
    id: "card-payment",
    accountId: "card",
    accountType: "credit_card",
    date: "2026-06-05",
    amount: "70000.00",
    currency: "PHP",
    type: "expense" as const,
    merchantRaw: "Cash Payment",
    rawPayload: { amountText: "70,000.00-" },
  },
  {
    id: "bank-payment",
    accountId: "bank",
    accountType: "bank",
    date: "2026-06-05",
    amount: "70000.00",
    currency: "PHP",
    type: "expense" as const,
    merchantRaw: "Bills Payment",
  },
  {
    id: "unsigned-cash-purchase",
    accountId: "card",
    accountType: "credit_card",
    date: "2026-06-06",
    amount: "500.00",
    currency: "PHP",
    type: "expense" as const,
    merchantRaw: "Cash Payment",
    rawPayload: { amountText: "500.00" },
  },
  {
    id: "unrelated-bill",
    accountId: "bank",
    accountType: "bank",
    date: "2026-06-10",
    amount: "70000.00",
    currency: "PHP",
    type: "expense" as const,
    merchantRaw: "Bills Payment",
  },
];

const overrides = getTransactionSummaryTypeOverrides(rows);

assert.equal(overrides.get("card-payment"), "transfer");
assert.equal(overrides.get("bank-payment"), "transfer");
assert.equal(overrides.has("unsigned-cash-purchase"), false);
assert.equal(overrides.has("unrelated-bill"), false);

const classifiedPaymentCredit = classifyMerchant({
  merchantText: "Cash Payment",
  categoryText: "Cash Payment",
  institution: "RCBC",
  type: "income",
  categoryName: "Transfers",
  merchantRules: [],
  trainingSignals: [],
});
assert.equal(classifiedPaymentCredit.categoryName, "Transfers");
assert.equal(classifiedPaymentCredit.preferredType, "income");

const pageSource = readFileSync(path.join(process.cwd(), "app/transactions/page.tsx"), "utf8");
const footerSnapshot = pageSource.match(
  /<div className="transactions-footer-snapshot"[\s\S]*?<\/div>\s*<\/div>\s*\) : null}/
)?.[0] ?? "";
assert.match(footerSnapshot, />Income<\/span>/);
assert.match(footerSnapshot, />Spending<\/span>/);
assert.match(footerSnapshot, />Net Cash Flow<\/span>/);
assert.doesNotMatch(footerSnapshot, />Transfers<\/span>/);
assert.match(pageSource, /const netCashFlow = displayedTransactionsSummary\.income - displayedTransactionsSummary\.spending;/);

console.log("[PASS] transaction summaries exclude repayments and show income, spending, and net cash flow");
