import assert from "node:assert/strict";
import { addCalendarMonths } from "../lib/recurring-date";

for (const timezone of ["UTC", "Asia/Manila", "Pacific/Kiritimati", "America/Los_Angeles"]) {
  process.env.TZ = timezone;
  for (const [source, months, expected] of [
    ["2027-01-31", 1, "2027-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-03-31", 1, "2026-04-30"],
    ["2026-12-31", 1, "2027-01-31"],
    ["2028-02-29", 12, "2029-02-28"],
    ["2026-08-15T00:00:00.000Z", 1, "2026-09-15"],
  ] as const) {
    assert.equal(addCalendarMonths(source, months), expected, `${timezone}: ${source}`);
  }
}
console.log("PASS: 24 recurring calendar-date checks across four time zones.");
