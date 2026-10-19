import assert from "node:assert/strict";
import { planSwipeDirection, sampleSplitShares } from "../app/landing-showcase/showcase-interactions";
import { flowChapterTravel, flowPurchaseChoreography, purchaseChoreography, receiptJourneyFrame, merchantFlightFrame, storyTravel } from "../app/landing-showcase/showcase-choreography";

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
// Keep a distinct readable transaction beat before collapsing into the insight.
for (const position of [.75, .9, 1.1]) {
  const frame = purchaseChoreography(position);
  assert.equal(frame["--paper-fold"], 1);
  assert.equal(frame["--paper-expand"], 1);
  assert.equal(frame["--purchase-merge"], 0);
  assert.equal(frame["--purchase-arrival"], 1);
}
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

// Natural scrolling follows actual document geometry, including unequal phone chapters.
for (const tops of [[0, 900, 1800], [120, 910, 1840, 2600]]) {
  assert.equal(flowChapterTravel(tops[0] - 1000, tops), 0);
  tops.forEach((top, index) => assert.equal(flowChapterTravel(top, tops), index));
  const frames = new Map<number, number>();
  let previous = 0;
  for (let point = -100; point < 4000; point++) {
    const travel = flowChapterTravel(point, tops);
    assert.ok(travel >= previous && travel - previous < .01);
    frames.set(point, travel);
    previous = travel;
  }
  for (let point = 3999; point >= -100; point--) assert.equal(flowChapterTravel(point, tops), frames.get(point));
}
assert.equal(flowChapterTravel(1, []), 0);
console.log("Natural flow: unequal chapter heights, bounded travel and exact reverse positions passed.");
assert.equal(flowChapterTravel(-10, [100]), 0);
assert.equal(flowChapterTravel(101, [100]), 1);

const flowFrames = new Map<number, ReturnType<typeof flowPurchaseChoreography>>();
for (let index = 0; index <= 300; index++) {
  const frame = flowPurchaseChoreography(index / 100);
  flowFrames.set(index, frame);
  for (const value of Object.values(frame)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  if (frame["--handoff-bridge"] > 0) assert.equal(frame["--purchase-merge"], 1, "Wide row crosses the intervening caption");
  if (frame["--handoff-arrival"] > 0) assert.ok(frame["--handoff-bridge"] >= .8, "Purchase enters copy lane before reaching the report");
}
for (let index = 300; index >= 0; index--) assert.deepEqual(flowPurchaseChoreography(index / 100), flowFrames.get(index));
for (const position of [.75, .85, .95]) assert.equal(flowPurchaseChoreography(position)["--purchase-merge"], 0);
console.log("Flow purchase: readable row pause, collapse before travel, margin route and exact reversal passed.");

// One receipt must arrive at each declared dock exactly and reverse without drift.
const receiptPoints = [
  {at:0,x:1150,y:150,width:230,merge:0,opacity:1,rotate:5},
  {at:750,x:25,y:1000,width:230,merge:0,opacity:1,rotate:-4},
  {at:1100,x:25,y:1200,width:36,merge:1,opacity:1,rotate:0},
  {at:1300,x:25,y:1850,width:36,merge:1,opacity:1,rotate:0},
  {at:1550,x:280,y:1850,width:36,merge:1,opacity:1,rotate:0},
  {at:1750,x:292,y:1862,width:12,merge:1,opacity:0,rotate:0},
];
const receiptFrames = new Map<number, ReturnType<typeof receiptJourneyFrame>>();
receiptPoints.forEach(point=>assert.deepEqual(receiptJourneyFrame(point.at,receiptPoints),point));
for (let y=0;y<=2000;y++) {
  const frame=receiptJourneyFrame(y,receiptPoints)!;
  assert.ok(Object.values(frame).every(Number.isFinite));
  assert.ok(frame.merge>=0 && frame.merge<=1 && frame.opacity>=0 && frame.opacity<=1 && frame.width>=12);
  if (y>=1300 && y<=1550) assert.equal(frame.y,1850,"Logo crosses the caption before reaching the report lane");
  receiptFrames.set(y,frame);
}
for (let y=2000;y>=0;y--) assert.deepEqual(receiptJourneyFrame(y,receiptPoints),receiptFrames.get(y));
assert.equal(receiptJourneyFrame(0,[]),null);
console.log("Hero receipt: one reversible route, exact docks, report-lane crossing and absorption passed.");

const defaultAssignments=[[true,true,true],[true,true,false],[false,false,true]];
assert.deepEqual(sampleSplitShares([45000,45000,30000],defaultAssignments),[37500,37500,45000]);
assert.deepEqual(sampleSplitShares([45000,45000,30000],[[true,false,false],[false,true,false],[true,true,false]]),[60000,60000,0]);
assert.deepEqual(sampleSplitShares([10000],[[true,true,true]]),[3334,3333,3333]);
for (let mask=1;mask<8;mask++) {
  const assignments=Array.from({length:3},()=>[Boolean(mask&1),Boolean(mask&2),Boolean(mask&4)]);
  assert.equal(sampleSplitShares([45001,45002,30001],assignments).reduce((a,b)=>a+b,0),120004);
}
console.log("Split-bill sample: assignment changes, exact centavo totals and remainder preservation passed.");

// The detached brand follows a single straight segment from the printed mark.
const brandFlight={start:800,arrival:1400,end:1550,x0:75,y0:1000,x1:140,y1:1700,width:18};
const brandFrames=new Map<number,ReturnType<typeof merchantFlightFrame>>();
for(let scroll=0;scroll<=1700;scroll++) {
 const frame=merchantFlightFrame(scroll,brandFlight);
 assert.ok(Object.values(frame).every(Number.isFinite));
 assert.ok(frame.opacity>=0 && frame.opacity<=1 && frame.width>0);
 const cross=(frame.x-brandFlight.x0)*(brandFlight.y1-brandFlight.y0)-(frame.y-brandFlight.y0)*(brandFlight.x1-brandFlight.x0);
 assert.ok(Math.abs(cross)<1e-7,"Merchant logo bends away from its direct route");
 brandFrames.set(scroll,frame);
}
assert.equal(merchantFlightFrame(800,brandFlight).x,brandFlight.x0);
assert.equal(merchantFlightFrame(800,brandFlight).y,brandFlight.y0);
assert.equal(merchantFlightFrame(1400,brandFlight).x,brandFlight.x1);
assert.equal(merchantFlightFrame(1400,brandFlight).y,brandFlight.y1);
assert.equal(merchantFlightFrame(1550,brandFlight).opacity,0);
for(let scroll=1700;scroll>=0;scroll--) assert.deepEqual(merchantFlightFrame(scroll,brandFlight),brandFrames.get(scroll));
console.log("Merchant mark: printed-logo origin, straight-line travel, reversible absorption and bounded opacity passed.");
