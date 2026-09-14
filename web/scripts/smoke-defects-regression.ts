import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getAccountCardName } from "../lib/account-display";
import { reportAccountBalance, buildReportBalanceSeries } from "../lib/report-balances";
import { getParticipantOutstandingBalance } from "../lib/split-bill-view-models";
import type { SplitBillSerializedBill } from "../lib/split-bill";

assert.equal(getAccountCardName({type:"cash",name:"QA Dollar Cash Renamed"}),"QA Dollar Cash Renamed");
assert.equal(getAccountCardName({type:"cash",name:"Cash USD"}),"Cash");
const movements = [
  {accountId:"bank",amount:"2000",type:"income",date:new Date("2026-09-14T12:00:00"),currency:"PHP"},
  {accountId:"bank",amount:"500",type:"expense",date:new Date("2026-09-14T12:00:00"),currency:"PHP"},
  {accountId:"bank",amount:"1000",type:"transfer",date:new Date("2026-09-14T12:00:00"),currency:"PHP",rawPayload:{amountDelta:"-1000"}},
  {accountId:"cash",amount:"1000",type:"transfer",date:new Date("2026-09-14T12:00:00"),currency:"PHP",rawPayload:{amountDelta:"1000"}},
];
const bank={id:"bank",type:"bank",currency:"PHP",source:"manual",balance:"10000",transactions:movements.filter(t=>t.accountId==="bank"),statementCheckpoints:[]};
assert.equal(reportAccountBalance(bank),10500);
assert.equal(reportAccountBalance({...bank,id:"cash",type:"cash",balance:"0",transactions:movements.filter(t=>t.accountId==="cash")}),1000);
const accounts=[{id:"bank",currency:"PHP",balance:10500},{id:"cash",currency:"PHP",balance:1000},{id:"usd",currency:"USD",balance:100}];
const from=new Date("2026-09-01T00:00:00"),to=new Date("2026-09-30T23:59:59"),asOf=new Date("2026-09-14T23:59:59");
const series=buildReportBalanceSeries(accounts,movements,from,to,asOf);
assert.deepEqual(series.map(s=>[s.currency,s.points.at(-1)?.balance]),[["PHP",11500],["USD",100]]);
assert.equal(series[0].points.at(-1)?.date,"2026-09-14","Do not label a future date as current balance");
assert.equal(series[0].points[0].balance,10000);
assert.equal(buildReportBalanceSeries([accounts[0]],movements,from,to,asOf)[0].points.at(-1)?.balance,10500,"Account-scoped transfer affects balance");
const historical=buildReportBalanceSeries(accounts,movements,new Date("2026-08-01T00:00:00"),new Date("2026-08-31T23:59:59"),asOf);
assert.equal(historical[0].points.length,31);
assert.equal(historical[0].points.at(-1)?.balance,10000,"Reverse later September movements for an August report");
const bill={settlement:{transfers:[{fromParticipantId:"b",toParticipantId:"a",amount:125}]}} as SplitBillSerializedBill;
assert.equal(getParticipantOutstandingBalance(bill,"a"),125);
assert.equal(getParticipantOutstandingBalance(bill,"b"),-125);
assert.equal(getParticipantOutstandingBalance({settlement:{transfers:[]}} as unknown as SplitBillSerializedBill,"b"),0);
const modal=readFileSync('components/import-files-modal.tsx','utf8');
const localPreparse=modal.slice(modal.indexOf('if (groupedRows.size > 0)'),modal.indexOf('  const removeItem ='));
assert.ok(localPreparse.includes('localPreparseSummaryByItemIdRef.current.set(itemId, persistedSummary)'));
// Advisory previews stay in the modal until the server confirms deduplication.
assert.doesNotMatch(localPreparse, /seedImportedWorkspaceCaches|onImported\(/);
assert.match(modal,/completionMessage: duplicateMessage/);
const payment=readFileSync('components/split-bill-qr-library.tsx','utf8');
assert.match(payment,/setSelectedPaymentAccountId\(profile.provider \? "saved-provider" : ""\)/);
assert.match(payment,/<option value="saved-provider">\{draft.provider\}<\/option>/);
console.log('Smoke defect regressions passed: aliases, balances/currencies/dates, settled allocations, duplicate publication, saved payment provider.');
