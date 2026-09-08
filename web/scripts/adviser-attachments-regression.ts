import assert from "node:assert/strict";
import {
  adviserFileProblem,
  adviserAttachmentIds,
} from "../lib/adviser-attachments";
import { mobileAdviserInput } from "../lib/mobile-adviser-input";
import { mobileOperation } from "../lib/mobile-api-policy";
import { normalizeEntryProposal } from "../lib/adviser-entry-schema";
const id = "adviser_file_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
for (const name of [
  "receipt.pdf",
  "photo.HEIC",
  "budget.csv",
  "notes.txt",
  "holdings.xlsx",
])
  assert.equal(adviserFileProblem({ name, size: 100 }), null);
for (const file of [
  { name: "a.exe", size: 10 },
  { name: "a.pdf", size: 0 },
  { name: "a.pdf", size: 3_500_001 },
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
