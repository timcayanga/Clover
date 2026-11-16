import assert from "node:assert/strict";
import {
  deriveReconciledBalance,
  normalizeAccountBalanceSign,
} from "@/lib/account-balance";
import {
  applyOptimisticWorkspaceTransactionDeletion,
  applyOptimisticWorkspaceTransactionUpsert,
  clearWorkspaceCache,
  getCachedAccountsWorkspace,
  persistAccountsWorkspaceCache,
} from "@/lib/workspace-cache";

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

const workspaceId = "balance-adjustment-regression";
persistAccountsWorkspaceCache(workspaceId, {
  accounts: [{ id: "cash-usd", workspaceId, balance: "100.00", source: "manual", type: "cash", currency: "USD" }],
  accountRules: [],
  transactions: [],
  statementCheckpoints: [],
});
applyOptimisticWorkspaceTransactionUpsert(workspaceId, {
  id: "optimistic-adjustment",
  workspaceId,
  accountId: "cash-usd",
  amount: "25.00",
  type: "income",
  isExcluded: false,
});

let cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
assert.equal(cachedSnapshot?.transactions.length, 1, "An optimistic cash adjustment should be cached immediately.");
assert.equal(
  deriveReconciledBalance({
    balance: cachedSnapshot?.accounts[0]?.balance as string,
    transactions: cachedSnapshot?.transactions as Array<{ amount: string; type: string; isExcluded?: boolean }>,
    treatStoredBalanceAsOpening: true,
  }),
  "125.00",
  "The Accounts cache should reflect an added cash adjustment without waiting for a refresh."
);

applyOptimisticWorkspaceTransactionUpsert(
  workspaceId,
  {
    id: "saved-adjustment",
    workspaceId,
    accountId: "cash-usd",
    amount: "25.00",
    type: "income",
    isExcluded: false,
  },
  { replaceTransactionId: "optimistic-adjustment" }
);
cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
assert.deepEqual(cachedSnapshot?.transactions.map((transaction) => transaction.id), ["saved-adjustment"]);

applyOptimisticWorkspaceTransactionDeletion(workspaceId, "saved-adjustment");
assert.equal(getCachedAccountsWorkspace(workspaceId)?.transactions.length, 0, "A failed adjustment should roll back cleanly.");
clearWorkspaceCache(workspaceId);

console.log("Account balance sign regression passed, including instant cash adjustments.");

// Cash spending remains in the ledger, but never carries a hidden overdraft into later income.
const cashRows = [
  { amount: 500, type: "expense", date: "2026-10-01", createdAt: "2026-10-01" },
  { amount: 100, type: "income", date: "2026-10-02", createdAt: "2026-10-02" },
];
const cashBefore = JSON.stringify(cashRows);
for (const opening of [0, 300]) {
  assert.equal(deriveReconciledBalance({ accountType: "cash", balance: opening, treatStoredBalanceAsOpening: true, transactions: cashRows.slice(0, 1) }), "0.00");
  assert.equal(deriveReconciledBalance({ accountType: "cash", balance: opening, treatStoredBalanceAsOpening: true, transactions: [...cashRows].reverse() }), "100.00");
}
assert.equal(deriveReconciledBalance({ accountType: "cash", balance: 300, treatStoredBalanceAsOpening: true, transactions: cashRows.map(row => ({ ...row, isExcluded: row.type === "expense" })) }), "400.00");
assert.equal(deriveReconciledBalance({ accountType: "bank", balance: 300, treatStoredBalanceAsOpening: true, transactions: cashRows }), "-100.00");
assert.equal(JSON.stringify(cashRows), cashBefore, "Cash projection must not rewrite confirmed spending.");
import { reportCashMovements, buildReportBalanceSeries } from "../lib/report-balances";
const cashProjection = reportCashMovements({
  id: "cash", type: "cash", source: "manual", currency: "PHP", balance: "300", statementCheckpoints: [],
  transactions: cashRows.map(row => ({ ...row, amount: String(row.amount), currency: "PHP" })),
});
const cashSeries = buildReportBalanceSeries([{ id:"cash", currency:"PHP", balance:100, cashMovements:cashProjection }],
  cashRows.map(row => ({...row, accountId:"cash", date:new Date(`${row.date}T00:00:00`)})),
  new Date("2026-09-30T00:00:00"), new Date("2026-10-02T23:59:59"), new Date("2026-10-02T23:59:59"));
assert.deepEqual(cashSeries[0].points.map(point => point.balance), [300, 0, 100], "Cash charts must not reverse a full expense into an invented opening balance.");

const cashSameDate = cashRows.map((row, index) => ({ ...row, id: `cash-${index}`, date: "2026-10-01", createdAt: "2026-10-01" }));
assert.equal(deriveReconciledBalance({ accountType:"cash", balance:0, treatStoredBalanceAsOpening:true, transactions:cashSameDate }), "100.00");
assert.equal(deriveReconciledBalance({ accountType:"cash", balance:0, treatStoredBalanceAsOpening:true, transactions:[...cashSameDate].reverse() }), "100.00");
assert.equal(deriveReconciledBalance({ accountType:"cash", balance:null, transactions:cashRows }), null, "Unknown imported cash must remain unknown without an anchor.");
assert.equal(deriveReconciledBalance({ accountType:"cash", balance:null, transactions:[{amount:300,type:"income",date:"2026-09-30",rawPayload:{kind:"opening_balance"}},...cashRows] }), "100.00");
assert.equal(deriveReconciledBalance({ accountType:"cash", balance:null, transactions:cashRows, checkpoints:[{endingBalance:300,statementEndDate:"2026-09-30",status:"reconciled"}] }), "100.00");
assert.equal(deriveReconciledBalance({ accountType:"cash", balance:null, transactions:[{amount:1,type:"income",date:"2026-09-30",rawPayload:{balance:300}},...cashRows] }), "100.00");
const mismatchCashMovements = reportCashMovements({id:"cash",type:"cash",source:"manual",currency:"PHP",balance:"300",transactions:cashRows.map(row=>({...row,amount:String(row.amount),currency:"PHP"})),statementCheckpoints:[{endingBalance:"900",status:"mismatch",statementEndDate:new Date("2026-09-30"),createdAt:new Date("2026-09-30"),sourceMetadata:{importMode:"statement"}}]});
assert.deepEqual(mismatchCashMovements, cashProjection, "A mismatched checkpoint cannot disable Cash's floor when reconstructing charts.");

const checkpointCashMovements = reportCashMovements({id:"cash",type:"cash",source:"manual",currency:"PHP",balance:"100",transactions:cashRows.map(row=>({...row,amount:String(row.amount),currency:"PHP"})),statementCheckpoints:[{endingBalance:"300",status:"reconciled",statementEndDate:new Date("2026-09-30T00:00:00"),createdAt:new Date("2026-09-30T00:00:00"),sourceMetadata:{importMode:"statement"}}]});
const checkpointCashSeries = buildReportBalanceSeries([{id:"cash",currency:"PHP",balance:100,cashMovements:checkpointCashMovements}],cashRows.map(row=>({...row,accountId:"cash",date:new Date(`${row.date}T00:00:00`)})),new Date("2026-09-30T00:00:00"),new Date("2026-10-02T23:59:59"),new Date("2026-10-02T23:59:59"));
assert.deepEqual(checkpointCashSeries[0].points.map(point=>point.balance), [300,0,100]);

const importedCashProjection = reportCashMovements({id:"imported-cash",type:"cash",source:"upload",currency:"PHP",balance:null,transactions:[{amount:"300",currency:"PHP",date:"2026-09-30",rawPayload:{kind:"opening_balance"}},...cashRows.map(row=>({...row,amount:String(row.amount),currency:"PHP"}))],statementCheckpoints:[]});
const importedCashSeries = buildReportBalanceSeries([{id:"imported-cash",currency:"PHP",balance:100,cashMovements:importedCashProjection}],[],new Date("2026-09-28T00:00:00"),new Date("2026-10-02T23:59:59"),new Date("2026-10-02T23:59:59"));
assert.deepEqual(importedCashSeries[0].points.map(point=>point.balance),[300,0,100]);
assert.equal(importedCashSeries[0].points[0].date,"2026-09-30", "Imported cash history cannot be invented before its first dated anchor.");
const undatedCashProjection = reportCashMovements({id:"unknown-cash",type:"cash",source:"upload",currency:"PHP",balance:"300",transactions:[],statementCheckpoints:[]});
assert.deepEqual(buildReportBalanceSeries([{id:"unknown-cash",currency:"PHP",balance:300,cashMovements:undatedCashProjection}],[],new Date("2026-09-28"),new Date("2026-10-02"),new Date("2026-10-02"))[0].points,[]);
