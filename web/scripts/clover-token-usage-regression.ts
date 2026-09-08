import assert from "node:assert/strict";
import {
  calculateModelCloverTokens,
  calculateUsageParts,
  CLOVER_TOKEN_LIMITS,
  getManilaMonthWindow,
} from "@/lib/clover-token-usage";

assert.deepEqual(CLOVER_TOKEN_LIMITS.free, { monthly: 100_000, rolling24h: 30_000 });
assert.deepEqual(CLOVER_TOKEN_LIMITS.pro, { monthly: 1_000_000, rolling24h: 250_000 });

const month = getManilaMonthWindow(new Date("2026-09-30T16:30:00.000Z"));
assert.equal(month.startsAt.toISOString(), "2026-09-30T16:00:00.000Z");
assert.equal(month.resetsAt.toISOString(), "2026-10-31T16:00:00.000Z");

assert.equal(calculateModelCloverTokens({
  model: "gpt-4.1-mini",
  inputTokens: 1_000,
  cachedInputTokens: 0,
  outputTokens: 100,
  totalTokens: 1_100,
}), 747);

const startsAt = new Date("2026-09-01T00:00:00.000Z");
const parts = calculateUsageParts([
  {
    action: "import.parser_usage",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    metadata: { localParser: { estimatedTokens: 900 } },
  },
  {
    action: "import.openai_model_call",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    metadata: { model: "unknown", inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  },
  {
    action: "adviser.model_call",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    metadata: { model: "unknown", inputTokens: 200, outputTokens: 30, totalTokens: 230 },
  },
], startsAt);

assert.deepEqual(parts, { localParserTokens: 250, backupParserTokens: 120, adviserTokens: 230 });
console.log("[PASS] Clover token weights, monthly reset, and shared usage aggregation are stable.");
