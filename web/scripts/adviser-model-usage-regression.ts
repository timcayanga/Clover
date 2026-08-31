import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractAdviserModelUsage, summarizeAdviserUsageAuditLogs } from "@/lib/adviser-model-usage";

const usage = extractAdviserModelUsage({
  id: "resp_test",
  model: "gpt-4.1-mini-2025-04-14",
  usage: {
    input_tokens: 10_000,
    input_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 500 },
    output_tokens: 1_000,
    output_tokens_details: { reasoning_tokens: 250 },
    total_tokens: 11_000,
  },
}, { fallbackModel: "gpt-4.1-mini", stage: "final_response", latencyMs: 1250 });

assert.equal(usage.responseId, "resp_test");
assert.equal(usage.inputTokens, 10_000);
assert.equal(usage.cachedInputTokens, 6_000);
assert.equal(usage.cacheWriteTokens, 500);
assert.equal(usage.outputTokens, 1_000);
assert.equal(usage.reasoningTokens, 250);
assert.equal(usage.totalTokens, 11_000);
assert.equal(usage.estimatedCostUsd, 0.0038);
assert.equal(usage.latencyMs, 1250);

assert.equal(extractAdviserModelUsage({ model: "unknown-model", usage: {} }, {
  fallbackModel: "unknown-model",
  stage: "tool_selection",
  latencyMs: 5,
}).estimatedCostUsd, null);
assert.equal(extractAdviserModelUsage({ status: "incomplete", usage: { total_tokens: 50 } }, {
  fallbackModel: "gpt-4.1-mini",
  stage: "final_response",
  latencyMs: 5,
}).status, "failed");

const summary = summarizeAdviserUsageAuditLogs([
  { action: "adviser.chat_asked", entityId: "q1", metadata: {} },
  { action: "adviser.model_call", entityId: "q1", metadata: { ...usage, totalTokens: 4_000, estimatedCostUsd: 0.001 } },
  { action: "adviser.model_call", entityId: "q1", metadata: { ...usage, totalTokens: 7_000, estimatedCostUsd: 0.0028 } },
  { action: "adviser.chat_asked", entityId: "q2", metadata: {} },
  { action: "adviser.local_response", entityId: "q2", metadata: { totalTokens: 0 } },
]);
assert.equal(summary.questions, 2);
assert.equal(summary.modelBackedQuestions, 1);
assert.equal(summary.localOnlyQuestions, 1);
assert.equal(summary.modelCalls, 2);
assert.equal(summary.totalTokens, 11_000);
assert.equal(summary.averageTokensPerCall, 5_500);
assert.equal(summary.averageTokensPerQuestion, 5_500);
assert.equal(summary.averageTokensPerModelBackedQuestion, 11_000);
assert.equal(summary.estimatedCostUsd, 0.0038);

const routeSource = readFileSync(new URL("../app/api/adviser/chat/route.ts", import.meta.url), "utf8");
assert.match(routeSource, /recordModelUsage\(toolSelectionPayload, "tool_selection"/);
assert.match(routeSource, /"response\.completed", "response\.incomplete", "response\.failed"/);
assert.match(routeSource, /recordModelUsage\(data\.response, "final_response"/);
assert.match(routeSource, /recordModelUsage\(finalPayload, "final_response"/);
assert.match(routeSource, /recordLocalResponse\("openai_not_configured"\)/);
assert.match(routeSource, /crypto\.randomUUID\(\)/);

const usageRouteSource = readFileSync(new URL("../app/api/adviser/usage/route.ts", import.meta.url), "utf8");
assert.match(usageRouteSource, /summarizeAdviserUsageAuditLogs/);
assert.match(usageRouteSource, /"adviser\.model_call"/);

console.log("Adviser exact model usage regression passed.");
