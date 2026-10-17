import assert from "node:assert/strict";
import { planSwipeDirection } from "../app/landing-showcase/showcase-interactions";
import { purchaseChoreography, storyTravel } from "../app/landing-showcase/showcase-choreography";

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

const weights = [1, .55, .85, 1.2, 1.2, .7];
assert.equal(storyTravel(0, weights), 0);
assert.equal(storyTravel(1, weights), 6);
assert.equal(storyTravel(-1, weights), 0);
assert.equal(storyTravel(2, weights), 6);
assert.equal(storyTravel(.5, []), 0);
let lastTravel = 0;
const timeline = new Map<number, number>();
for (let index = 0; index <= 1000; index++) {
  const travel = storyTravel(index / 1000, weights);
  assert.ok(travel >= lastTravel && travel - lastTravel < .02, "Weighted chapters jump or reverse");
  timeline.set(index, travel);
  const frame = purchaseChoreography(travel, { trustInterlude: true });
  for (const value of Object.values(frame)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  if (travel >= 1.1 && travel <= 1.85) {
    assert.equal(frame["--purchase-presence"], 0, "Purchase obscures early trust content");
    assert.equal(frame["--category-join"], 0, "Purchase enters report during trust chapter");
  }
  if (frame["--category-join"] > .01) assert.ok(frame["--purchase-merge"] > .95);
  lastTravel = travel;
}
for (let index = 1000; index >= 0; index--) assert.equal(storyTravel(index / 1000, weights), timeline.get(index));
// The same row resumes after trust, then joins its category and disappears.
assert.equal(purchaseChoreography(1.5, {trustInterlude:true})["--paper-fold"], 1);
assert.equal(purchaseChoreography(2.2, {trustInterlude:true})["--purchase-presence"], 1);
assert.equal(purchaseChoreography(3, {trustInterlude:true})["--purchase-away"], 1);
console.log("Weighted story: compact chapters, trust isolation and reversible purchase continuity passed.");

// Gesture intent must not turn an ordinary page scroll or a short tap into a plan change.
assert.equal(planSwipeDirection(-80, 8), 1);
assert.equal(planSwipeDirection(80, 8), -1);
assert.equal(planSwipeDirection(-20, 1), 0);
assert.equal(planSwipeDirection(60, 100), 0);
assert.equal(planSwipeDirection(50, 50), 0);
assert.equal(planSwipeDirection(NaN, 0), 0);
assert.equal(planSwipeDirection(0, Infinity), 0);
console.log("Plan swipes: forward/backward intent, short taps and native vertical scrolling passed.");
