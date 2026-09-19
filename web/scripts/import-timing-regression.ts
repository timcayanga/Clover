import assert from "node:assert/strict";
import { startImportTiming, measureImportTiming } from "../lib/import-timing";

async function main() {
  const logs: Array<Record<string, unknown>> = [];
  const info = console.info;
  const originalNow = Date.now;
  try {
    console.info = (_prefix, payload) => logs.push(JSON.parse(payload));
    const finish = startImportTiming("synthetic", "commit");
    // A wall-clock correction must not make elapsed duration negative.
    Date.now = () => originalNow() - 60_000;
    finish();
    finish();
    assert.equal(logs.length, 2, "Repeated finish must not duplicate a completion");
    assert.ok(Number(logs[1].durationMs) >= 0);
    assert.equal(logs[0].spanId, logs[1].spanId);
    const value = { privatePayload: "must never enter timing logs" };
    assert.equal(await measureImportTiming("synthetic", "extract", async () => value), value);
    const failure = new Error("sensitive failure details");
    await assert.rejects(measureImportTiming("synthetic", "extract", async () => { throw failure; }), e => e === failure);
    assert.equal(logs.at(-1)?.outcome, "failed");
    assert.ok(!JSON.stringify(logs).includes("privatePayload"));
    assert.ok(!JSON.stringify(logs).includes("sensitive failure"));
  } finally {
    Date.now = originalNow;
    console.info = info;
  }
  console.log("Import timing regression passed: monotonic, correlated, idempotent, privacy-safe and result/error preserving.");
}
void main();
