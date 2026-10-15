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

// A model migration must keep all request stages and accounting compatible.
import { DEFAULT_ADVISER_MODEL, DEFAULT_CONTENT_MODEL, DEFAULT_IMPORT_TEXT_MODEL, openAIInteractiveOptions } from "../lib/openai-model-policy";
assert.equal(DEFAULT_ADVISER_MODEL, "gpt-6-luna");
assert.equal(DEFAULT_CONTENT_MODEL, "gpt-6-luna");
assert.equal(DEFAULT_IMPORT_TEXT_MODEL, "gpt-5.4-mini");
assert.deepEqual(openAIInteractiveOptions("gpt-6-luna"), { reasoning: { effort: "none" }, temperature: 0.2 });
assert.deepEqual(openAIInteractiveOptions("gpt-4.1-mini"), { temperature: 0.2 });
assert.deepEqual(openAIInteractiveOptions("gpt-6.1-sol"), { reasoning: { effort: "low" } });
const luna = extractAdviserModelUsage({ model: "gpt-6-luna", usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 }, output_tokens: 100 } }, { fallbackModel: "gpt-6-luna", stage: "final_response", latencyMs: 1000 });
assert.equal(luna.estimatedCostUsd, 0.0001345);
const route = readFileSync(new URL("../app/api/adviser/chat/route.ts", import.meta.url), "utf8");
assert.equal((route.match(/openAIInteractiveOptions\(model\)/g) ?? []).length, 3, "Tool selection, streaming and ordinary replies must all disable reasoning explicitly");
const editorial = readFileSync(new URL("../lib/knowledge-ai.ts", import.meta.url), "utf8");
assert.match(editorial, /openAIInteractiveOptions\(model\)/);
assert.match(editorial, /DEFAULT_CONTENT_MODEL/);

import { extractFinalOpenAIText, createOpenAIFinalTextStream } from "../lib/openai-response-text";
const phased = { output_text: "Checking…Final answer", output: [
  { type: "message", phase: "commentary", content: [{ type: "output_text", text: "Checking…" }] },
  { type: "message", phase: "final_answer", content: [{ type: "output_text", text: "PHP " }, { type: "output_text", text: "6,000" }] },
] };
const beforePhases = JSON.stringify(phased);
assert.equal(extractFinalOpenAIText(phased), "PHP 6,000");
assert.equal(JSON.stringify(phased), beforePhases, "Provider phase/state must survive upstream replay intact");
assert.equal(extractFinalOpenAIText({ output_text: "Checking…", output: [phased.output[0]] }), null);
assert.equal(extractFinalOpenAIText({ output_text: " legacy " }), "legacy");
assert.equal(extractFinalOpenAIText({ output: [{ content: [{ type: "output_text", text: "legacy" }] }] }), "legacy");
const filter = createOpenAIFinalTextStream();
assert.equal(filter({ type: "response.output_item.added", output_index: 0, item: { id: "pre", phase: "commentary" } }), null);
assert.equal(filter({ type: "response.output_text.delta", item_id: "pre", output_index: 0, delta: "Checking…" }), null);
assert.equal(filter({ type: "response.output_item.added", output_index: 1, item: { id: "final", phase: "final_answer" } }), null);
assert.equal(filter({ type: "response.output_text.delta", item_id: "final", output_index: 1, delta: "PHP 6,000" }), "PHP 6,000");
assert.equal(filter({ type: "response.output_text.delta", output_index: 0, delta: "Still checking…" }), null);
assert.equal(createOpenAIFinalTextStream()({ type: "response.output_text.delta", delta: "legacy" }), "legacy");
assert.match(route, /message\.role === "assistant" \? \{ phase: "final_answer" \}/);
assert.match(route, /createOpenAIFinalTextStream\(\)/);
