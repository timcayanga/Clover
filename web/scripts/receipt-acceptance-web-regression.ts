import assert from "node:assert/strict";
import { browserContext, setTelemetrySink, type TelemetryProperties } from "../../shared/analytics";
import { beginFirstReceiptScan } from "../../shared/receipt-first-attempt";
import { finishWebReceiptAttempt, noticeWebImportCommit, observeWebImportRows, observeWebReceiptReviewPrompt, rememberImportUpload } from "../lib/pdf-visibility-client";

let notify: (entries: IntersectionObserverEntry[]) => void;
const watch = new Set<Element>();
class TestObserver {
  constructor(callback: typeof notify) { notify = callback; }
  observe(node: Element) { watch.add(node); }
  unobserve(node: Element) { watch.delete(node); }
  disconnect() { watch.clear(); }
}
const page = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
Object.assign(globalThis, { window: new EventTarget(), document: page, IntersectionObserver: TestObserver });

for (const [platform, userAgent] of [["desktop_web", "Macintosh Chrome/140"], ["mobile_web", "iPhone Mobile Safari"]]) {
  const events: TelemetryProperties[] = [];
  setTelemetrySink((name, data) => {
    if (name === "receipt_first_attempt" || name === "receipt_review_prompt_shown") events.push({ ...browserContext(userAgent), ...data, name });
  });
  const workspace = "profile";
  const importId = platform;
  const scan = beginFirstReceiptScan(Date.now(), "web_receipt_selected");
  rememberImportUpload(workspace, importId, false, scan);
  const node = { parentElement: null } as HTMLElement;
  const rows = [{ id: "row", importFileId: importId }];
  const nodes = new Map([["row", node]]);
  const compact = platform === "mobile_web";
  assert.equal(observeWebImportRows("wrong-profile", rows, nodes, compact, () => {}), undefined);
  const disconnect = observeWebImportRows(workspace, rows, nodes, compact, () => {});
  assert(watch.has(node));
  const visibility = (ratio: number, ms: number) => notify([{
    target: node, isIntersecting: true, intersectionRatio: ratio, time: scan.acceptedAt + ms - performance.timeOrigin,
  } as IntersectionObserverEntry]);
  visibility(1, 100);
  assert.equal(events.length, 1, "A provisional row is not a committed receipt");
  noticeWebImportCommit(workspace, importId, "poll");
  page.visibilityState = "hidden";
  visibility(1, 200);
  page.visibilityState = "visible";
  visibility(0.2, 300);
  assert.equal(events.length, 1);
  visibility(1, 10_000);
  visibility(1, 10_100);
  finishWebReceiptAttempt(workspace, importId, "failed");
  assert.equal(events.length, 2);
  assert.equal(events[0].timing_boundary, "web_receipt_selected");
  assert.equal(events[1].platform, platform);
  assert.equal(events[1].operation_id, events[0].operation_id);
  assert.equal(events[1].duration_ms, 10_000);
  assert.equal(events[1].outcome, "visible");
  assert.equal(events[1].within_target, true);
  disconnect?.();

  const review = beginFirstReceiptScan(Date.now() - 250, "web_receipt_selected");
  rememberImportUpload(workspace, importId + "-review", false, review);
  finishWebReceiptAttempt(workspace, importId + "-review", "review_required", review.acceptedAt + 100, "receipt_details_needed");
  page.visibilityState = "hidden";
  observeWebReceiptReviewPrompt(importId + "-review", ["date", "total"]);
  assert.equal(events.length, 4);
  page.visibilityState = "visible";
  observeWebReceiptReviewPrompt(importId + "-review", ["date", "total"]);
  observeWebReceiptReviewPrompt(importId + "-review", ["date"]);
  assert.equal(events.length, 5);
  assert.equal(events[4].name, "receipt_review_prompt_shown");
  assert.equal(events[4].operation_id, review.id);
  assert.equal(events[4].reason_code, "date+total");
  assert(Number(events[4].duration_ms) >= 250);
  assert.equal(events[3].reason_code, "receipt_details_needed");

  const failure = beginFirstReceiptScan(Date.now(), "web_receipt_selected");
  rememberImportUpload(workspace, importId + "-failure", false, failure);
  finishWebReceiptAttempt(workspace, importId + "-failure", "failed", failure.acceptedAt + 75, "I-108");
  assert.equal(events[6].duration_ms, 75);
  assert.equal(events[6].reason_code, "I-108");
  assert.equal(events[6].within_target, false);

}
console.log("PASS desktop and mobile web acceptance, committed row visibility, and single terminal event.");
