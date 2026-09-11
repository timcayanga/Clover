import assert from "node:assert/strict";
import { formatTransactionAccountName, planTransactionAccountPage, compareTransactionsByAccount } from "../lib/transaction-account-sort";
import { buildTransactionDetailDraft } from "../lib/transaction-detail-draft";
import { buildTransactionUpdatePayload } from "../lib/transaction-update-payload";

const accounts = [
  { id: "a", name: "Same raw name", institution: "QA Bank", accountNumber: "1234", type: "bank", source: "upload" },
  { id: "b", name: "Same raw name", institution: "QA Bank", accountNumber: "5678", type: "bank", source: "upload" },
  { id: "c", name: "Different raw name", institution: "QA Bank", accountNumber: "1234", type: "bank", source: "upload" },
];
assert.equal(formatTransactionAccountName(accounts[0]), "QA Bank 1234");
assert.equal(formatTransactionAccountName(accounts[1]), "QA Bank 5678");
assert.equal(formatTransactionAccountName(accounts[2]), "QA Bank 1234");
const rows = Array.from({ length: 201 }, (_, n) => ({ id: String(n).padStart(3, "0"), accountId: accounts[n % 3].id, date: new Date(Date.UTC(2026, 0, 1 + n % 9)) }));
const counts = accounts.map(a => ({ accountId: a.id, count: rows.filter(r => r.accountId === a.id).length }));
for (const direction of ["asc", "desc"] as const) {
  const multiplier = direction === "asc" ? 1 : -1;
  const withinGroup = (a: typeof rows[number], b: typeof rows[number]) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? -1 : 1) * multiplier;
  const expected = [...rows].sort((a, b) => (Number(a.accountId === "b") - Number(b.accountId === "b")) * multiplier || withinGroup(a, b));
  assert.deepEqual([...rows].sort(compareTransactionsByAccount(accounts, direction)), expected);
  for (const pageSize of [1, 25, 50, 100, 200, 201]) {
    const actual: typeof rows = [];
    for (let offset = 0; offset < rows.length; offset += pageSize) {
      const segments = planTransactionAccountPage(accounts, counts, offset, pageSize, direction);
      actual.push(...segments.flatMap(s => rows.filter(r => s.accountIds.includes(r.accountId)).sort(withinGroup).slice(s.skip, s.skip + s.take)));
    }
    assert.deepEqual(actual, expected, `${direction}/${pageSize}: global order with equal-label accounts and date ties`);
  }
  assert.deepEqual(planTransactionAccountPage(accounts, counts, 300, 25, direction), []);
}

for (const rawPayload of [undefined, null, "legacy raw text", { original: "source" }, { original: "source", receiptLineItems: [{ description: "A", quantity: 2, unitPrice: 3, amount: 6, extraRawField: "retain" }] }]) {
  const source = { merchantRaw: "RAW", merchantClean: "Title", date: "2026-09-09", accountId: "a", amount: "6", currency: "PHP", isExcluded: false, rawPayload };
  const draft = buildTransactionDetailDraft(source, { merchantClean: "Revised", effectiveType: "expense" });
  draft.description = "Changed note";
  const before = JSON.stringify(source);
  assert.equal(Object.hasOwn(buildTransactionUpdatePayload(draft, source), "rawPayload"), false, "Unchanged line items must omit raw source entirely");
  assert.equal(JSON.stringify(source), before);
  draft.receiptLineItems = [{ description: "New line", quantity: "", unitPrice: "", amount: "2", currency: "PHP" }];
  assert.equal(Object.hasOwn(buildTransactionUpdatePayload(draft, source), "rawPayload"), true, "Explicit line-item edits still save");
  draft.receiptLineItems = [];
  if (rawPayload && typeof rawPayload === "object" && "receiptLineItems" in rawPayload) {
    assert.equal(Object.hasOwn(buildTransactionUpdatePayload(draft, source), "rawPayload"), true, "Explicitly removing existing line items still saves");
  }
}
console.log("PASS: global account pagination, equal display labels, stable ties, and untouched raw-payload preservation.");
