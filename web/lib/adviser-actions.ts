import { prisma } from "@/lib/prisma";
import type { AdviserModelUsage } from "@/lib/adviser-model-usage";

export type AdviserCompletionGroup = "cashflow" | "behavior" | "goals" | "investments" | "cleanup";

export type AdviserActionCompletionPayload = {
  workspaceId: string;
  actorUserId: string;
  group: AdviserCompletionGroup;
  itemId: string;
  label: string;
  sourceAction: string;
  href?: string | null;
  pathname?: string | null;
};

export type AdviserChatQuestionPayload = {
  workspaceId: string;
  actorUserId: string;
  group: AdviserCompletionGroup;
  itemId: string;
  label: string;
  sourceAction: string;
  href?: string | null;
  pathname?: string | null;
  question?: string | null;
};

export type AdviserModelCallPayload = AdviserModelUsage & {
  workspaceId: string;
  actorUserId: string;
  questionSignature: string;
  httpStatus?: number | null;
  failureReason?: string | null;
};

export type AdviserLocalResponsePayload = {
  workspaceId: string;
  actorUserId: string;
  questionSignature: string;
  reason: string;
  intent?: string | null;
  confidence?: number | null;
  routingVersion?: string | null;
};

export const recordAdviserActionCompletion = async (payload: AdviserActionCompletionPayload) => {
  await prisma.auditLog.create({
    data: {
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: "adviser.action_completed",
      entity: "AdviserAction",
      entityId: payload.itemId,
      metadata: {
        kind: "completion",
        group: payload.group,
        itemId: payload.itemId,
        label: payload.label,
        sourceAction: payload.sourceAction,
        href: payload.href ?? null,
        pathname: payload.pathname ?? null,
      },
    },
  });
};

export const recordAdviserChatQuestion = async (payload: AdviserChatQuestionPayload) => {
  await prisma.auditLog.create({
    data: {
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: "adviser.chat_asked",
      entity: "AdviserChat",
      entityId: payload.itemId,
      metadata: {
        kind: "chat",
        group: payload.group,
        itemId: payload.itemId,
        label: payload.label,
        sourceAction: payload.sourceAction,
        href: payload.href ?? null,
        pathname: payload.pathname ?? null,
        question: payload.question?.slice(0, 240) ?? null,
      },
    },
  });
};

export const recordAdviserModelCall = async (payload: AdviserModelCallPayload) => {
  await prisma.auditLog.create({
    data: {
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: "adviser.model_call",
      entity: "AdviserChat",
      entityId: payload.questionSignature,
      metadata: {
        kind: "model_call",
        stage: payload.stage,
        status: payload.status,
        model: payload.model,
        responseId: payload.responseId,
        inputTokens: payload.inputTokens,
        cachedInputTokens: payload.cachedInputTokens,
        cacheWriteTokens: payload.cacheWriteTokens,
        outputTokens: payload.outputTokens,
        reasoningTokens: payload.reasoningTokens,
        totalTokens: payload.totalTokens,
        computeUnits: payload.computeUnits,
        latencyMs: payload.latencyMs,
        estimatedCostUsd: payload.estimatedCostUsd,
        pricingVersion: payload.pricingVersion,
        httpStatus: payload.httpStatus ?? null,
        failureReason: payload.failureReason?.slice(0, 160) ?? null,
      },
    },
  });
};

export const recordAdviserLocalResponse = async (payload: AdviserLocalResponsePayload) => {
  await prisma.auditLog.create({
    data: {
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: "adviser.local_response",
      entity: "AdviserChat",
      entityId: payload.questionSignature,
      metadata: {
        kind: "local_response",
        reason: payload.reason,
        intent: payload.intent ?? null,
        confidence: payload.confidence ?? null,
        routingVersion: payload.routingVersion ?? null,
        modelCalls: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      },
    },
  });
};
