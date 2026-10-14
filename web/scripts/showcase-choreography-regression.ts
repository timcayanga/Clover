import assert from "node:assert/strict";
import { purchaseChoreography } from "../app/landing-showcase/showcase-choreography";

const start = purchaseChoreography(0);
assert.equal(start["--paper-fold"], 0);
assert.equal(start["--purchase-away"], 0);
let previous = start;
const forward = new Map<number, ReturnType<typeof purchaseChoreography>>();
for (let index = 0; index <= 300; index++) {
  const frame = purchaseChoreography(index / 100);
  forward.set(index, frame);
  for (const [name, value] of Object.entries(frame)) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name} escaped its visual range`);
    if (name !== "--category-glow") assert.ok(value >= previous[name as keyof typeof previous], `${name} moved backwards during forward scroll`);
  }
  if (frame["--category-join"] > 0.01) assert.ok(frame["--purchase-merge"] > 0.95, "Wide transaction travels across the report before collapsing");
  if (frame["--category-join"] > 0) assert.equal(frame["--report-reveal"], 1, "Purchase arrives before the report is readable");
  if (frame["--purchase-away"] > 0) assert.ok(frame["--category-fill"] > 0.95, "Purchase disappears before its category appears");
  previous = frame;
}
assert.equal(previous["--purchase-away"], 1);
assert.equal(previous["--category-fill"], 1);
// Reversing scroll restores the exact corresponding frame and then the receipt.
for (let index = 300; index >= 0; index--) assert.deepEqual(purchaseChoreography(index / 100), forward.get(index));
assert.deepEqual(purchaseChoreography(0), start);
console.log("Showcase choreography: bounded, reversible, readable handoff passed.");
