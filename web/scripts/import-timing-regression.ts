import assert from "node:assert/strict";
import { startImportTiming, measureImportTiming, withImportTimingAttempt, getImportStageDurations, recordImportWork, getImportWork } from "../lib/import-timing";

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
    await Promise.all(["a", "b"].map(attemptId => withImportTimingAttempt("synthetic", attemptId, async () => {
      await measureImportTiming("synthetic", "text_extraction", async () => {});
      assert.ok(getImportStageDurations("synthetic").text_extraction >= 0);
      assert.deepEqual(getImportStageDurations("other-file"), {});
    })));
    assert.deepEqual(logs.filter(log => log.stage === "text_extraction").map(log => log.attemptId).sort(), ["a", "a", "b", "b"]);
    await Promise.all(["reader-a", "reader-b"].map((attemptId, index) =>
      withImportTimingAttempt("synthetic", attemptId, async () => {
        recordImportWork("source_storage_read");
        await Promise.resolve();
        recordImportWork("text_cache_hit_in_flight");
        if (index === 0) recordImportWork("text_extraction_skipped_preflight");
        assert.deepEqual(getImportWork("synthetic"), {
          source_storage_read: 1, text_cache_hit_in_flight: 1,
          ...(index === 0 ? { text_extraction_skipped_preflight: 1 } : {}),
        });
        assert.deepEqual(getImportWork("other-file"), {});
      })
    ));
    recordImportWork("source_storage_read", "before-claim");
    assert.deepEqual(logs.at(-1), { importFileId: "before-claim", work: "source_storage_read" });
    withImportTimingAttempt("synthetic", "cancel-test", () => {
      const stop = startImportTiming("synthetic", "backup_structured_extraction");
      stop("cancelled", "local_result_selected");
      stop("completed");
      const durations = getImportStageDurations("synthetic");
      assert.equal(durations.backup_structured_extraction, undefined);
      assert.ok(durations.backup_structured_extraction_cancelled >= 0);
      assert.equal(logs.at(-1)?.outcome, "cancelled");
      assert.equal(logs.at(-1)?.reason, "local_result_selected");
    });
    assert.ok(!JSON.stringify(logs).includes("privatePayload"));
    assert.ok(!JSON.stringify(logs).includes("sensitive failure"));
  } finally {
    Date.now = originalNow;
    console.info = info;
  }
  console.log("Import timing regression passed: monotonic, correlated, idempotent, privacy-safe and result/error preserving.");
}
void main();
