import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatAccountOptionLabel, isInvestmentAccountOption } from "../lib/account-option-label";

const read = (path: string) => readFileSync(path, "utf8");

assert.equal(formatAccountOptionLabel({ name: "Cash", currency: "php" }), "Cash • PHP");
assert.equal(formatAccountOptionLabel({ name: "BPI 3012", currency: "PHP" }), "BPI 3012 • PHP");
assert.equal(formatAccountOptionLabel({ name: "Wise 7807", currency: "usd" }), "Wise 7807 • USD");
assert.equal(formatAccountOptionLabel({ name: "Cash CNY", currency: "CNY" }), "Cash • CNY");
assert.equal(formatAccountOptionLabel({ name: "Wise (USD)", currency: "USD" }), "Wise • USD");
assert.equal(formatAccountOptionLabel({ name: "Cash", currency: null }), "Cash • PHP");
assert.equal(isInvestmentAccountOption({ name: "Portfolio", type: "investment" }), true);
assert.equal(isInvestmentAccountOption({ name: "PDAX", type: "wallet" }), true);
assert.equal(isInvestmentAccountOption({ name: "GSave #UNOReady 4132", type: "bank" }), true);
assert.equal(isInvestmentAccountOption({ name: "Wise 7807", type: "wallet" }), false);
assert.equal(isInvestmentAccountOption({ name: "Savings", type: "bank", hasInvestmentActivity: true }), true);

const budget = read("components/budgeting-workspace.tsx");
const currencyField = budget.indexOf('<span>Currency</span>');
const amountField = budget.indexOf('<span>Amount</span>');
const cadenceField = budget.indexOf('<span>Cadence</span>');
assert.ok(currencyField > 0 && amountField > currencyField && cadenceField > amountField, "Budget fields must show Currency and Amount before the final Cadence row.");
assert.match(budget, /data\.accounts\.map[\s\S]{0,180}formatAccountOptionLabel\(item\)/, "Budget account choices must include currency.");
assert.match(read("lib/budgeting-data.ts"), /isInvestmentAccountOption/, "Budget choices must exclude investment-like accounts, not only investment-typed rows.");

const transactions = read("app/transactions/page.tsx");
assert.doesNotMatch(
  transactions,
  /<option key=\{account\.id\}[\s\S]{0,120}\{formatTransactionAccountName\(account\)\}/,
  "Every native Transactions account option must add explicit currency context.",
);

for (const file of [
  "components/commitments-panel.tsx",
  "components/recurring-calendar-detail.tsx",
  "components/review-workbench.tsx",
  "components/dashboard-top-actions.tsx",
  "components/home-transaction-review-card.tsx",
  "components/circles-workspace.tsx",
  "app/transactions/page.tsx",
  "app/transactions/[transactionId]/page.tsx",
  "app/accounts/[accountId]/page.tsx",
  "app/reports/reports-page-content.tsx",
]) assert.match(read(file), /formatAccountOptionLabel/, `${file} must use the currency-aware account label.`);

console.log("Account dropdown audit passed: Budgeting, Recurring, transaction entry/review, Reports, Circles, and account merge include currency context.");
