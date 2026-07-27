import assert from "node:assert/strict";
import {
  deriveReconciledBalance,
  normalizeAccountBalanceSign,
} from "@/lib/account-balance";

const expenseBalance = Number(
  deriveReconciledBalance({
    balance: 0,
    transactions: [
      {
        amount: 123.45,
        type: "expense",
      },
    ],
  })
);

assert.equal(expenseBalance, -123.45);
assert.equal(normalizeAccountBalanceSign("cash", expenseBalance), -123.45);
assert.equal(normalizeAccountBalanceSign("bank", -500), -500);
assert.equal(normalizeAccountBalanceSign("credit_card", 500), -500);

console.log("Account balance sign regression passed.");
