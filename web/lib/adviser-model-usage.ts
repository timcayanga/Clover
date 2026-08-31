export type AdviserModelCallStage = "tool_selection" | "final_response";
export type AdviserModelCallStatus = "completed" | "failed" | "aborted";

export type AdviserModelUsage = {
  responseId: string | null;
  model: string;
  stage: AdviserModelCallStage;
  status: AdviserModelCallStatus;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  computeUnits: number;
  latencyMs: number;
  estimatedCostUsd: number | null;
  pricingVersion: string | null;
};

export type AdviserUsageAuditLog = {
  action: string;
  entityId: string | null;
  metadata: unknown;
};

export type AdviserUsageSummary = {
  questions: number;
  modelBackedQuestions: number;
  localOnlyQuestions: number;
  modelCalls: number;
  completedModelCalls: number;
  failedModelCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  averageTokensPerCall: number;
  averageTokensPerQuestion: number;
  averageTokensPerModelBackedQuestion: number;
  estimatedCostUsd: number;
  averageEstimatedCostUsdPerQuestion: number;
  models: Array<{ model: string; calls: number; totalTokens: number; estimatedCostUsd: number }>;
};

type Pricing = {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

const PRICING_VERSION = "openai-model-pricing-2026-08-31";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asNonNegativeInteger = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

export const getAdviserModelPricing = (model: string): Pricing | null => {
  const normalized = model.trim().toLowerCase();
  if (normalized === "gpt-4.1-mini" || normalized.startsWith("gpt-4.1-mini-")) {
    return { inputPerMillionUsd: 0.4, cachedInputPerMillionUsd: 0.1, outputPerMillionUsd: 1.6 };
  }
  if (normalized === "gpt-4.1" || normalized.startsWith("gpt-4.1-")) {
    return { inputPerMillionUsd: 2, cachedInputPerMillionUsd: 0.5, outputPerMillionUsd: 8 };
  }
  return null;
};

export const extractAdviserModelUsage = (
  payload: unknown,
  options: {
    fallbackModel: string;
    stage: AdviserModelCallStage;
    latencyMs: number;
    status?: AdviserModelCallStatus;
  },
): AdviserModelUsage => {
  const response = asRecord(payload) ?? {};
  const usage = asRecord(response.usage) ?? {};
  const inputDetails = asRecord(usage.input_tokens_details) ?? {};
  const outputDetails = asRecord(usage.output_tokens_details) ?? {};
  const model = typeof response.model === "string" && response.model.trim() ? response.model : options.fallbackModel;
  const inputTokens = asNonNegativeInteger(usage.input_tokens);
  const cachedInputTokens = Math.min(inputTokens, asNonNegativeInteger(inputDetails.cached_tokens));
  const cacheWriteTokens = asNonNegativeInteger(inputDetails.cache_write_tokens);
  const outputTokens = asNonNegativeInteger(usage.output_tokens);
  const reasoningTokens = asNonNegativeInteger(outputDetails.reasoning_tokens);
  const totalTokens = asNonNegativeInteger(usage.total_tokens) || inputTokens + outputTokens;
  const computeUnits = asNonNegativeInteger(usage.compute_units);
  const pricing = getAdviserModelPricing(model);
  const responseStatus = typeof response.status === "string" ? response.status.toLowerCase() : "";
  const status = options.status
    ?? (responseStatus === "failed" || responseStatus === "incomplete" || responseStatus === "cancelled" ? "failed" : "completed");
  const estimatedCostUsd = pricing
    ? Number((
        ((inputTokens - cachedInputTokens) * pricing.inputPerMillionUsd
          + cachedInputTokens * pricing.cachedInputPerMillionUsd
          + outputTokens * pricing.outputPerMillionUsd) / 1_000_000
      ).toFixed(8))
    : null;

  return {
    responseId: typeof response.id === "string" ? response.id : null,
    model,
    stage: options.stage,
    status,
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    computeUnits,
    latencyMs: Math.max(0, Math.round(options.latencyMs)),
    estimatedCostUsd,
    pricingVersion: pricing ? PRICING_VERSION : null,
  };
};

export const summarizeAdviserUsageAuditLogs = (logs: AdviserUsageAuditLog[]): AdviserUsageSummary => {
  const questionIds = new Set<string>();
  const modelQuestionIds = new Set<string>();
  const localQuestionIds = new Set<string>();
  const modelTotals = new Map<string, { calls: number; totalTokens: number; estimatedCostUsd: number }>();
  let modelCalls = 0;
  let completedModelCalls = 0;
  let failedModelCalls = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;

  for (const log of logs) {
    const questionId = log.entityId ?? "";
    if (log.action === "adviser.chat_asked") {
      if (questionId) questionIds.add(questionId);
      continue;
    }
    if (log.action === "adviser.local_response") {
      if (questionId) localQuestionIds.add(questionId);
      continue;
    }
    if (log.action !== "adviser.model_call") continue;

    const metadata = asRecord(log.metadata) ?? {};
    if (questionId) modelQuestionIds.add(questionId);
    modelCalls += 1;
    if (metadata.status === "completed") completedModelCalls += 1;
    else failedModelCalls += 1;
    const callInput = asNonNegativeInteger(metadata.inputTokens);
    const callCachedInput = asNonNegativeInteger(metadata.cachedInputTokens);
    const callCacheWrite = asNonNegativeInteger(metadata.cacheWriteTokens);
    const callOutput = asNonNegativeInteger(metadata.outputTokens);
    const callReasoning = asNonNegativeInteger(metadata.reasoningTokens);
    const callTotal = asNonNegativeInteger(metadata.totalTokens);
    const callCost = Number(metadata.estimatedCostUsd ?? 0);
    inputTokens += callInput;
    cachedInputTokens += callCachedInput;
    cacheWriteTokens += callCacheWrite;
    outputTokens += callOutput;
    reasoningTokens += callReasoning;
    totalTokens += callTotal;
    if (Number.isFinite(callCost) && callCost > 0) estimatedCostUsd += callCost;

    const model = typeof metadata.model === "string" && metadata.model ? metadata.model : "unknown";
    const currentModel = modelTotals.get(model) ?? { calls: 0, totalTokens: 0, estimatedCostUsd: 0 };
    currentModel.calls += 1;
    currentModel.totalTokens += callTotal;
    if (Number.isFinite(callCost) && callCost > 0) currentModel.estimatedCostUsd += callCost;
    modelTotals.set(model, currentModel);
  }

  const modelBackedQuestions = modelQuestionIds.size;
  const localOnlyQuestions = [...localQuestionIds].filter((id) => !modelQuestionIds.has(id)).length;
  const questions = questionIds.size;
  const roundedCost = Number(estimatedCostUsd.toFixed(8));
  return {
    questions,
    modelBackedQuestions,
    localOnlyQuestions,
    modelCalls,
    completedModelCalls,
    failedModelCalls,
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    averageTokensPerCall: modelCalls > 0 ? Math.round(totalTokens / modelCalls) : 0,
    averageTokensPerQuestion: questions > 0 ? Math.round(totalTokens / questions) : 0,
    averageTokensPerModelBackedQuestion: modelBackedQuestions > 0 ? Math.round(totalTokens / modelBackedQuestions) : 0,
    estimatedCostUsd: roundedCost,
    averageEstimatedCostUsdPerQuestion: questions > 0 ? Number((roundedCost / questions).toFixed(8)) : 0,
    models: [...modelTotals.entries()]
      .map(([model, totals]) => ({
        model,
        calls: totals.calls,
        totalTokens: totals.totalTokens,
        estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(8)),
      }))
      .sort((left, right) => right.totalTokens - left.totalTokens),
  };
};
