import assert from "node:assert/strict";
import { buildSpendingPaceSnapshot } from "../lib/spending-pace";

const date = (value: string) => new Date(`${value}T12:00:00+08:00`);

const snapshot = buildSpendingPaceSnapshot(
  [
    { date: date("2026-07-01"), amount: 1_000, category: "Dining" },
    { date: date("2026-07-16"), amount: 2_000, category: "Transport" },
    { date: date("2026-07-25"), amount: 8_000, category: "Shopping" },
    { date: date("2026-08-01"), amount: 1_500, category: "Dining" },
    { date: date("2026-08-16"), amount: 3_000, category: "Transport" },
  ],
  date("2026-08-28")
);

assert.ok(snapshot);
assert.equal(snapshot.comparableDay, 16);
assert.equal(snapshot.currentTotal, 4_500);
assert.equal(snapshot.previousTotal, 3_000, "later July spending must not enter the matched-period comparison");
assert.equal(snapshot.points.find((point) => point.day === 25)?.previous, 11_000, "the remainder line can still show the completed prior month");
assert.equal(snapshot.points.find((point) => point.day === 17)?.current, null);
assert.equal(snapshot.deltaPercent, 50);
assert.deepEqual(snapshot.drivers.map((driver) => driver.category), ["Transport", "Dining"]);

const februarySnapshot = buildSpendingPaceSnapshot(
  [
    { date: date("2026-02-28"), amount: 500, category: "Dining" },
    { date: date("2026-03-31"), amount: 700, category: "Dining" },
  ],
  date("2026-04-01")
);
assert.ok(februarySnapshot);
assert.equal(februarySnapshot.comparableDay, 31);
assert.equal(februarySnapshot.previousComparableEnd.getDate(), 28, "comparison must clamp to the prior month's final day");

console.log("Spending pace regression checks passed.");
