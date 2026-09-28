import assert from "node:assert/strict";
import {
  getInternalOrigin,
  internalRouteDecision,
} from "../lib/internal-routing";
import { hasInternalEmail } from "../lib/internal-permissions";
import {
  initialStudio,
  reviseDraft,
  reviewDraft,
  studioSchema,
} from "../lib/team-studio";

assert.equal(
  hasInternalEmail([
    { emailAddress: "HELLO@CLOVER.PH", verification: { status: "verified" } },
  ]),
  true,
);
assert.equal(
  hasInternalEmail([
    { emailAddress: "hello@clover.ph", verification: { status: "unverified" } },
  ]),
  false,
);
assert.equal(
  hasInternalEmail([
    { emailAddress: "other@clover.ph", verification: { status: "verified" } },
  ]),
  false,
);
assert.equal(hasInternalEmail([]), false);
assert.equal(
  getInternalOrigin("https://team.clover.ph"),
  "https://team.clover.ph",
);
for (const invalid of [
  "http://team.clover.ph",
  "https://team.clover.ph.evil.test",
  "https://evil.test",
  "https://user:secret@team.clover.ph",
  "https://team.clover.ph:8080",
])
  assert.equal(getInternalOrigin(invalid), null);
assert.equal(internalRouteDecision("team.clover.ph", "/", false), "office");
assert.equal(
  internalRouteDecision("team.clover.ph", "/continue", true),
  "office",
);
assert.equal(
  internalRouteDecision("team.clover.ph", "/admin/users", true),
  "continue",
);
assert.equal(
  internalRouteDecision("clover.ph", "/admin/users", false),
  "continue",
);
assert.equal(
  internalRouteDecision("clover.ph", "/admin/users", true),
  "redirect",
);
assert.equal(
  internalRouteDecision("www.clover.ph", "/office/sign-in", true),
  "redirect",
);
assert.equal(
  internalRouteDecision("clover.ph", "/api/admin/users", true),
  "reject-api",
);
assert.equal(
  internalRouteDecision("clover.ph", "/api/administer", true),
  "continue",
);
assert.equal(
  internalRouteDecision("clover.ph", "/dashboard", true),
  "continue",
);
assert.equal(
  internalRouteDecision("clover-stage.vercel.app", "/admin", true),
  "continue",
);
const initial = initialStudio();
assert.equal(studioSchema.safeParse(initial).success, true);
const approved = reviewDraft(initial.drafts[0], "Approved", "Approved");
assert.equal(approved.approvedRevision, 1);
const revised = reviseDraft(approved, { caption: "A changed caption" });
assert.equal(revised.status, "Draft");
assert.equal(revised.approvedRevision, undefined);
assert.equal(revised.revision, 2);
assert.equal(revised.history.at(-1)?.caption, approved.caption);
assert.equal(approved.caption, initial.drafts[0].caption);
assert.equal(
  reviseDraft(approved, { date: "2026-10-05" }).approvedRevision,
  undefined,
);
assert.equal(
  reviseDraft(approved, { mediaId: "replacement" }).approvedRevision,
  undefined,
);
assert.equal(
  reviewDraft(approved, "Changes requested", "Change the opening")
    .approvedRevision,
  undefined,
);
assert.equal(studioSchema.safeParse({ ...initial, version: 2 }).success, false);
console.log(
  "Team studio: owner access, host migration, approval invalidation, and history checks passed.",
);
