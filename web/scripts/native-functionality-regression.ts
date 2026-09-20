import { positionInput, positionTradeInput } from "../lib/investment-position-store";
import assert from "node:assert/strict";
import {
  investmentTradeInput,
  tradeSigns,
} from "../lib/investment-trade-input";
import {
  nativeReportWindow,
  buildNativeReportDetails,
} from "../lib/native-report-details";
import { notificationDestination } from "../../mobile/src/notification-destination";
import { mobileOperation } from "../lib/mobile-api-policy";
const input = {
  id: "463b4fa0-d515-4791-925c-57bf22d9f355",
  revision: 0,
  assetName: "Sample Holding",
  date: "2026-09-19",
  kind: "buy",
  quantity: "10.12345678",
  amount: "100.00",
  costBasis: "101.00",
  note: "",
};
assert(investmentTradeInput.safeParse(input).success);
const position={id:input.id,revision:0,assetName:"Example",symbol:"EXM",subtype:"stock",currency:"PHP",openingDate:"2026-09-01",openingQuantity:"0",openingCostBasis:"0",value:null,valueDate:null,sourceHoldingId:null};
assert(positionInput.safeParse(position).success);
for(const change of [{openingQuantity:"-1"},{openingDate:"2026-02-30"},{value:"100",valueDate:null},{actorUserId:"foreign"}])assert(!positionInput.safeParse({...position,...change}).success);
assert(positionTradeInput.safeParse({...input,positionId:input.id,counterpartPositionId:"71738949-f2a5-4f99-b1b5-b25e16a6283a"}).success);
assert(!positionTradeInput.safeParse({...input,positionId:"foreign"}).success);
for (const change of [
  { quantity: "-1" },
  { quantity: "NaN" },
  { costBasis: "1e5" },
  { date: "2026-02-30" },
  { kind: "purchase" },
  { actorUserId: "other" },
  { currency: "USD" },
  { revision: -1 },
])
  assert(!investmentTradeInput.safeParse({ ...input, ...change }).success);
assert.equal(tradeSigns("sell"), -1);
assert.equal(tradeSigns("transfer_out"), -1);
assert.equal(tradeSigns("reinvest"), 1);
const w = nativeReportWindow(
  new URLSearchParams("from=2024-02-29&to=2024-02-29&comparison=year"),
);
assert.equal(w.previousStart.toISOString(), "2023-02-27T16:00:00.000Z");
assert.equal(w.previousEnd.toISOString(), "2023-02-28T15:59:59.999Z");
assert.throws(() =>
  nativeReportWindow(new URLSearchParams("from=2025-01-01&to=2026-09-19")),
);
assert.throws(() => nativeReportWindow(new URLSearchParams("from=2026-02-30")));
assert.equal(
  notificationDestination("/budgeting?budget=abc"),
  "/budgeting?budgetId=abc",
);
assert.equal(
  notificationDestination("/circles/circle-1"),
  "/circles?circleId=circle-1",
);
assert.equal(
  notificationDestination("/accounts/account-1"),
  "/(tabs)/accounts?accountId=account-1",
);
assert.equal(notificationDestination("/circles?token=private"), null);
assert.equal(notificationDestination("//evil.test/"), null);
for (const [method, path] of [
  ["POST", "imports/id/confirm"],
  ["GET", "imports/id/review"],
  ["POST", "accounts/id/trades"],
  ["POST", "circles/id/resources"],
  ["POST", "circles/id/archive"],
])
  assert(mobileOperation(method, path.split("/")));
assert.equal(mobileOperation("PATCH", ["imports", "id", "review"]), null);
console.log(
  "PASS trade validation, date comparison/leap day, safe native destinations and explicit operation allowlist",
);

const range = nativeReportWindow(
  new URLSearchParams("from=2026-09-01&to=2026-09-10"),
);
const row = {
  date: new Date("2026-09-02T00:00:00Z"),
  amount: 100,
  type: "expense" as const,
  isTransfer: false,
  merchantClean: "Cafe",
  merchantRaw: "CAFE",
  category: { name: "Food" },
  account: { id: "bank", name: "Bank" },
};
const details = buildNativeReportDetails(
  [
    row,
    { ...row, date: new Date("2026-09-04T00:00:00Z") },
    { ...row, amount: 999, isTransfer: true },
    { ...row, type: "income", amount: 500, merchantClean: "Salary" },
  ],
  range,
  true,
);
assert.equal(details.current.expense, 200);
assert.equal(details.current.income, 500);
assert.equal(details.repeats[0].count, 2);
assert.equal(details.pace.at(-1)?.current, 200);
assert.equal(details.flows[0].expense, 200);
assert.equal(
  buildNativeReportDetails([row], range, false).flows.length,
  0,
  "Pro flows are omitted at the server boundary",
);
console.log(
  "PASS native report transfer exclusion, merchant grouping, cumulative pace and Pro projection",
);
