import assert from "node:assert/strict";
import {
  adviserFileProblem,
  adviserAttachmentIds,
  decodeAdviserText,
} from "../lib/adviser-attachments";
import { mobileAdviserInput } from "../lib/mobile-adviser-input";
import { mobileOperation } from "../lib/mobile-api-policy";
import { normalizeEntryProposal } from "../lib/adviser-entry-schema";
const note = "Lunch at Café — ₱580.00";
for (const bom of ["", "\ufeff"]) {
  const little = Buffer.from(bom + note, "utf16le");
  assert.equal(decodeAdviserText(little), note);
  assert.equal(decodeAdviserText(Buffer.from(little).swap16()), note);
}
assert.equal(decodeAdviserText(Buffer.from(note)), note);
assert.throws(() => decodeAdviserText(Buffer.from([0xff, 0xfe, 0x41])), /No readable text/);
assert.throws(() => decodeAdviserText(Buffer.from([0xc3, 0x28])), /No readable text/);
const id = "adviser_file_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
for (const name of [
  "receipt.pdf",
  "photo.HEIC",
  "budget.csv",
  "notes.txt",
  "holdings.xlsx",
])
  assert.equal(adviserFileProblem({ name, size: 100 }), null);
for (const type of ["application/pdf; version=1.7", "text/csv; charset=utf-8", "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]) {
  assert.equal(adviserFileProblem({ name: "Document", size: 100, type }), null);
}
assert.equal(adviserFileProblem({ name: "Photo", size: 5_000_000, type: "image/jpeg" }), null);
for (const name of ["statement.pdf", "trades.tsv", "portfolio.xlsx"]) {
  assert.equal(adviserFileProblem({ name, size: 8_000_000 }), null);
  assert(adviserFileProblem({ name, size: 25 * 1024 * 1024 + 1 }));
}
for (const file of [
  { name: "wrong.exe", type: "image/jpeg", size: 100 },
  { name: "Document", type: "image/svg+xml", size: 100 },
  { name: "a.exe", size: 10 },
  { name: "a.pdf", size: 0 },
  { name: "notes.txt", size: 3_500_001 },
])
  assert(adviserFileProblem(file));
assert(adviserAttachmentIds.safeParse([id]).success);
for (const ids of [[id, id], ["../other"], Array(4).fill(id)])
  assert(!adviserAttachmentIds.safeParse(ids).success);
assert(
  mobileAdviserInput.safeParse({
    messages: [{ role: "user", content: "Explain this receipt" }],
    attachmentIds: [id],
  }).success,
);
assert(
  !mobileAdviserInput.safeParse({
    messages: [{ role: "user", content: "Explain" }],
    attachmentIds: [id],
    attachmentText: "forged",
  }).success,
);
assert.equal(
  mobileOperation("POST", ["adviser", "attachments"]),
  "adviser-attachments",
);
assert.equal(mobileOperation("GET", ["adviser", "attachments"]), null);
const draft = normalizeEntryProposal(
  { attachmentIds: [id] },
  { id: "draft", workspaceId: "profile", sourceText: "Add this receipt" },
);
assert(draft.success);
assert.deepEqual(draft.data.attachmentIds, [id]);
console.log(
  "PASS attachment limits, formats, native allowlist and draft source references",
);
