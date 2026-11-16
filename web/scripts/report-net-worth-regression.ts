import assert from "node:assert/strict";
import { buildReportNetWorth, type ReportNetWorthAccount } from "../lib/report-net-worth-data";
const point = (date: string, balance: number, mode = "statement") => ({ endingBalance: balance, statementEndDate: new Date(date), createdAt: new Date(date), sourceMetadata: { importMode: mode } });
const accounts: ReportNetWorthAccount[] = [
  {type:"bank",currency:"PHP",statementCheckpoints:[point("2026-08-01",1000),point("2026-09-01",1100),point("2026-09-05",9999,"receipt")]},
  {type:"credit_card",currency:"PHP",statementCheckpoints:[point("2026-08-01",200),point("2026-09-10",300)]},
  {type:"bank",currency:"USD",statementCheckpoints:[point("2026-08-01",90),point("2026-09-05",100)]},
];
const from = new Date("2026-09-01"), to = new Date("2026-09-30");
assert.deepEqual(buildReportNetWorth(accounts,"PHP",from,to),{accountCount:2,points:[{date:"2026-09-01",balance:900},{date:"2026-09-10",balance:800}]});
assert.deepEqual(buildReportNetWorth(accounts,"USD",from,to),{accountCount:1,points:[{date:"2026-09-05",balance:100}]});
assert.deepEqual(buildReportNetWorth([accounts[0]],"PHP",from,to),{accountCount:1,points:[{date:"2026-09-01",balance:1100}]});
assert.deepEqual(buildReportNetWorth([...accounts,{type:"cash",currency:"PHP",statementCheckpoints:[]}],"PHP",from,to),{accountCount:3,points:[]});
assert.deepEqual(buildReportNetWorth(accounts,"EUR",from,to),{accountCount:0,points:[]});
assert.deepEqual(buildReportNetWorth(accounts,"PHP",new Date("2026-09-02"),new Date("2026-09-09")),{accountCount:2,points:[]});
console.log("Report net worth regression passed: currency/account scope, liabilities, historical carry-forward, receipt exclusion, missing evidence and date bounds.");
