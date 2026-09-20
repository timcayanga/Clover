import assert from "node:assert/strict";
import { buildReviewDraft, mergeReviewDrafts } from "../lib/review-refresh-state";

const previous = [{ id: "existing", accountId: "cash", categoryId: "old-category", description: "old note" }];
const next = [{ ...previous[0], categoryId: "enriched-category", description: "server note" }, { id: "new-import", accountId: "bank", categoryId: null, description: null }];
const noteDraft = { ...buildReviewDraft(previous[0]), description: "unsaved note" };
assert.deepEqual(mergeReviewDrafts(previous, next, { existing: noteDraft }), {
  existing: { accountId: "cash", categoryId: "enriched-category", description: "unsaved note" },
}, "A new import preserves the note while untouched enrichment fields refresh.");
const cleared = { accountId: "chosen-account", categoryId: "", description: "" };
assert.deepEqual(mergeReviewDrafts(previous, next, { existing: cleared }), { existing: cleared }, "Intentional clears and account changes survive refresh.");
assert.deepEqual(mergeReviewDrafts(previous, [], { existing: noteDraft }), {}, "Removed rows must not retain actionable drafts.");
assert.deepEqual(mergeReviewDrafts(previous, next, {}), {}, "New imports do not create artificial local edits.");
assert.deepEqual(noteDraft, { accountId: "cash", categoryId: "old-category", description: "unsaved note" }, "Merging never mutates an existing draft.");
console.log("PASS: Review refresh preserves edits/clears, accepts untouched enrichment and prunes removed rows.");
