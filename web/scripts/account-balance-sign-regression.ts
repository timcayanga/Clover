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

const manualOpeningBalance = Number(
  deriveReconciledBalance({
    balance: 10_000,
    treatStoredBalanceAsOpening: true,
    transactions: [
      {
        amount: 5_000,
        type: "income",
      },
      {
        amount: 1_300,
        type: "expense",
      },
    ],
  })
);

const importedCurrentBalance = Number(
  deriveReconciledBalance({
    balance: 10_000,
    transactions: [
      {
        amount: 5_000,
        type: "income",
      },
      {
        amount: 1_300,
        type: "expense",
      },
    ],
  })
);

assert.equal(expenseBalance, -123.45);
assert.equal(manualOpeningBalance, 13_700);
assert.equal(importedCurrentBalance, 3_700);
assert.equal(normalizeAccountBalanceSign("cash", expenseBalance), 0);
assert.equal(normalizeAccountBalanceSign("bank", -500), -500);
assert.equal(normalizeAccountBalanceSign("credit_card", 500), -500);

console.log("Account balance sign regression passed.");
