import assert from "node:assert/strict";
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

console.log("[PASS] transaction summaries exclude signed card repayments and their matched bank debit from spending");
