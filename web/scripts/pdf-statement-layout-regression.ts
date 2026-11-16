import assert from "node:assert/strict";
import { reconstructPdfStatementPages, type PdfStatementContinuation, type PositionedPdfRow } from "../lib/pdf-statement-layout";

import { mergePdfPageBatches, mergePdfPageTranscript, planPdfPageEscalation } from "../lib/pdf-page-escalation";
import { assessPdfStatementRowEvidence } from "../lib/pdf-statement-row-evidence";

const cell = (x: number, text: string, width = text.length * 4) => ({ x, text, width, height: 10 });
const header = [cell(20, "Date"), cell(105, "Description"), cell(330, "Amount"), cell(425, "Balance")];
const movement = (date: string, description: string, amount: string, balance: string) =>
  [cell(427, balance), cell(105, description), cell(332, amount), cell(20, date)];
const row = (centerY: number, ...items: PositionedPdfRow["items"]): PositionedPdfRow => ({ centerY, items });
const page = (rows: PositionedPdfRow[]) => ({
  rows,
  lines: rows.map(item => item.items.slice().sort((a, b) => a.x - b.x).map(item => item.text).join(" ")),
});
const account = (number = "12345678") => row(760, cell(20, `Account Number: ${number}`));
const first = page([
  account(),
  row(720, ...header),
  row(705, ...movement("01/10/2026", "Airport hotel", "-32.00", "100.00")),
  row(694, cell(108, "Reservation AB123")),
  row(683, cell(108, "Terminal two")),
  row(670, ...header),
  row(654, cell(108, "Unassigned table note")),
  row(640, ...movement("02/10/2026", "Rail ticket", "-15.00", "85.00")),
  row(100, cell(20, "Page 1 of 2")),
]);
const second = page([
  account(),
  row(720, ...header),
  row(708, cell(108, "Booking for two")),
  row(695, ...movement("03/10/2026", "Refund", "+10.00", "95.00")),
  row(684, cell(108, "Printed total"), cell(332, "12.50")),
  row(672, cell(108, "Leave this line alone")),
  row(100, cell(20, "Page 2 of 2")),
]);
const [one, two] = reconstructPdfStatementPages([first, second]);
assert(one && two);
assert(one.includes("01/10/2026 Airport hotel Reservation AB123 Terminal two -32.00 100.00"));
assert(one.includes("02/10/2026 Rail ticket Booking for two -15.00 85.00"));
assert.equal(one.match(/Date Description Amount Balance/g)?.length, 2);
assert(one.includes("Unassigned table note"));
assert(!two.includes("Booking for two"));
assert(two.includes("Printed total 12.50\nLeave this line alone"));
assert(two.includes("03/10/2026 Refund +10.00 95.00"));
assert(one.includes("Page 1 of 2"));
assert(two.includes("Page 2 of 2"));

const otherAccount = page([account("99999999"), ...second.rows.slice(1)]);
const gap = page([...second.rows.slice(0, -1), row(100, cell(20, "Page 3 of 3"))]);
for (const unsafe of [otherAccount, gap]) {
  const [unchangedPrevious, unchangedCurrent] = reconstructPdfStatementPages([first, unsafe]);
  assert(!unchangedPrevious?.includes("Booking for two"));
  assert.equal(unchangedCurrent, null);
}
const splitBefore = page([
  account(), row(720, ...header),
  row(705, cell(20, "2026-10-02"), cell(105, "Rail ticket")),
  row(100, cell(20, "Page 1 of 2")),
]);
const splitAfter = page([
  account(), row(720, ...header),
  row(708, cell(105, "Booking for two"), cell(332, "-15.00"), cell(427, "85.00")),
  row(695, ...movement("2026-10-03", "Airport hotel", "-10.00", "75.00")),
  row(100, cell(20, "Page 2 of 2")),
]);
const spans: PdfStatementContinuation[] = [];
const [splitOne, splitTwo] = reconstructPdfStatementPages([splitBefore, splitAfter], spans);
assert(splitOne?.includes("2026-10-02 Rail ticket Booking for two -15.00 85.00"));
assert(!splitTwo?.includes("Booking for two"));
assert.deepEqual(spans, [{ page: 1, line: 3, continuationPage: 2 }]);
assert.deepEqual(assessPdfStatementRowEvidence([splitOne!, splitTwo!], [
  { date: "2026-10-02", amount: "15.00", merchantRaw: "Rail ticket Booking for two" },
], "12345678", spans).evidence, spans);
assert.deepEqual(reconstructPdfStatementPages([
  splitBefore, page([account("99999999"), ...splitAfter.rows.slice(1)]),
]), [null, null]);

const a = { page: 1, text: "Entry 1" };
const b = { page: 2, text: "Repeated purchase 120.00" };
const c = { page: 3, text: "Repeated purchase 120.00" };
assert.deepEqual(mergePdfPageBatches([[b, c], [a, b]], 1, 3), [a.text, b.text, c.text]);
assert.equal(mergePdfPageBatches([[a, b], [{ ...b, text: "Different reading" }, c]], 1, 3), null);
assert.equal(mergePdfPageBatches([[a], [c]], 1, 3), null);

const hybrid = ["Header\nOctober 1 Cafe 120.00\nOctober 1 Train 42.00", "", "Header\nOctober 2 Shop 50.00\nEnding Balance 200.00"];
const plan = planPdfPageEscalation(hybrid)!;
assert.equal(mergePdfPageTranscript(hybrid, plan, "October 1 Cafe 120.00\nOctober 1 Train 42.00\nOctober 2 Shop 99.00"), null);
assert.ok(mergePdfPageTranscript(hybrid, plan, "October 1 Train 42.00\nOctober 2 Cafe 15.00"));
console.log("PDF coordinate layout regression passed.");
