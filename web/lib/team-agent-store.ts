import { createHash, randomUUID } from "node:crypto";
import { Prisma, type TeamAgentRun } from "@prisma/client";
import { prisma } from "./prisma";
import { studioSchema, agentProfiles } from "./team-studio";
import {
  activeRunStatuses,
  startAssignmentSchema,
  type AssignmentView,
  type StartAssignment,
} from "./team-agent-contract";
import {
  AgentProviderError,
  assignmentPromptSchema,
  cancelAgentResponse,
  createAgentResponse,
  defaultTeamModel,
  extractAgentResult,
  retrieveAgentResponse,
  type AgentResponse,
} from "./team-agent-provider";

const active = () => ({ in: activeRunStatuses });
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function lockOwner(tx: Prisma.TransactionClient, ownerId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 731))::text`;
}
export async function getAssignment(
  ownerId: string,
  id: string,
): Promise<AssignmentView> {
  const row = await prisma.teamAgentRun.findFirst({
    where: { id, ownerId },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) throw new Error("ASSIGNMENT_NOT_FOUND");
  const prompt = assignmentPromptSchema.parse(row.prompt);
  return {
    id: row.id,
    briefId: row.briefId,
    agent: row.agent,
    parentId: row.parentId,
    status: row.status,
    reviewStatus: row.reviewStatus,
    model: row.model,
    brief: prompt.brief,
    instructions: prompt.instructions,
    feedback: prompt.feedback,
    result: row.result,
    sources: row.sources as AssignmentView["sources"],
    error: row.error,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    searchCalls: row.searchCalls,
    estimatedCostUsd: row.estimatedCostUsd,
    createdAt: row.createdAt.toISOString(),
    events: row.events.map((e) => ({
      action: e.action,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
export async function listAssignments(ownerId: string, briefId?: string) {
  return prisma.teamAgentRun.findMany({
    where: { ownerId, ...(briefId ? { briefId } : {}) },
    orderBy: { createdAt: "desc" },
    take: briefId ? 100 : 200,
    ...(briefId ? {} : { distinct: ["briefId" as const] }),
    select: {
      id: true,
      briefId: true,
      agent: true,
      parentId: true,
      status: true,
      reviewStatus: true,
      createdAt: true,
    },
  });
}
async function applyResponse(row: TeamAgentRun, response: AgentResponse) {
  if (row.responseId && row.responseId !== response.id)
    throw new Error("AGENT_PROVIDER_FAILURE");
  const result = extractAgentResult(response, row.model);
  let status = (
    {
      queued: "queued",
      in_progress: "running",
      completed: "completed",
      failed: "failed",
      cancelled: "canceled",
      incomplete: "failed",
    } as const
  )[response.status];
  let error: string | null = null;
  if (response.status === "completed" && !result.result.trim()) {
    status = "failed";
    error = "The agent returned no usable text. You can retry this assignment.";
  }
  if (response.status === "incomplete")
    error =
      "The response reached its limit. Partial work is saved; create a new assignment with a narrower brief.";
  if (response.status === "failed")
    error =
      "The provider could not finish this assignment. You can retry; nothing was published.";
  await prisma.$transaction(async (tx) => {
    const current = await tx.teamAgentRun.findUnique({ where: { id: row.id } });
    if (!current || !activeRunStatuses.includes(current.status)) return;
    const terminal = !["queued", "running"].includes(status);
    const nextStatus =
      current.status === "canceling" && !terminal ? "canceling" : status;
    const changed = await tx.teamAgentRun.updateMany({
      where: { id: row.id, status: current.status },
      data: {
        responseId: response.id,
        status: nextStatus,
        error,
        ...(terminal
          ? { ...result, sources: json(result.sources), finishedAt: new Date() }
          : {}),
        nextPollAt: new Date(Date.now() + 5000),
      },
    });
    if (changed.count && terminal)
      await tx.teamAgentEvent.create({
        data: {
          runId: row.id,
          action: nextStatus,
          note:
            nextStatus === "completed"
              ? "Result saved for owner review. Nothing published."
              : error || "Assignment canceled.",
        },
      });
  });
}
export async function startAssignment(ownerId: string, raw: StartAssignment) {
  const input = startAssignmentSchema.parse(raw);
  if (
    input.action === "start"
      ? Boolean(input.parentId || input.feedback)
      : !input.parentId
  )
    throw new Error("INVALID_ASSIGNMENT");
  if (input.action === "revise" && !input.feedback)
    throw new Error("INVALID_ASSIGNMENT");
  if (
    !process.env.OPENAI_API_KEY?.trim() ||
    process.env.CLOVER_TEAM_AGENTS_ENABLED === "false"
  )
    throw new Error("AGENT_UNAVAILABLE");
  const model = process.env.CLOVER_TEAM_AGENT_MODEL?.trim() || defaultTeamModel;
  const triggerKey = createHash("sha256")
    .update(
      JSON.stringify([
        input.briefId,
        input.action,
        input.parentId || "",
        input.feedback,
      ]),
    )
    .digest("hex");
  const reserved = await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const existing = await tx.teamAgentRun.findUnique({
      where: { ownerId_triggerKey: { ownerId, triggerKey } },
    });
    if (existing) return { row: existing, created: false };
    const state = await tx.teamStudioState.findUnique({ where: { ownerId } });
    const payload = state && studioSchema.parse(state.payload);
    const brief = payload?.briefs.find((b) => b.id === input.briefId);
    const agent = agentProfiles.find((a) => a.id === brief?.agent);
    if (!brief || !agent || !brief.text.trim())
      throw new Error("INVALID_ASSIGNMENT");
    const parent = input.parentId
      ? await tx.teamAgentRun.findFirst({
          where: { id: input.parentId, ownerId, briefId: brief.id },
        })
      : null;
    if (
      input.action !== "start" &&
      (!parent ||
        (input.action === "revise"
          ? parent.status !== "completed"
          : !["failed", "canceled"].includes(parent.status)))
    )
      throw new Error("INVALID_ASSIGNMENT");
    // One child per revision: concurrent tabs cannot fork conflicting revisions.
    if (parent) {
      const child = await tx.teamAgentRun.findFirst({
        where: { ownerId, parentId: parent.id },
      });
      if (child) return { row: child, created: false };
    }
    const running = await tx.teamAgentRun.findFirst({
      where: { ownerId, briefId: brief.id, status: active() },
    });
    if (running) return { row: running, created: false };
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const [today, busy] = await Promise.all([
      tx.teamAgentRun.count({ where: { ownerId, createdAt: { gte: day } } }),
      tx.teamAgentRun.count({ where: { ownerId, status: active() } }),
    ]);
    if (today >= 20 || busy >= 3) throw new Error("ASSIGNMENT_LIMIT");
    const prompt =
      input.action === "retry" && parent
        ? assignmentPromptSchema.parse(parent.prompt)
        : {
            brief: brief.text,
            instructions: payload!.instructions[agent.id] || agent.instructions,
            role: agent.name,
            feedback: input.feedback,
            previousResult: parent?.result.slice(0, 30000) || "",
          };
    const row = await tx.teamAgentRun.create({
      data: {
        id: randomUUID(),
        ownerId,
        briefId: brief.id,
        agent: agent.id,
        parentId: parent?.id,
        triggerKey,
        model,
        prompt: json(prompt),
        events: {
          create: {
            action: input.action,
            note: input.feedback || "Owner started this assignment.",
          },
        },
      },
    });
    if (parent && input.action === "revise") {
      await tx.teamAgentRun.update({
        where: { id: parent.id },
        data: { reviewStatus: "changes_requested" },
      });
      await tx.teamAgentEvent.create({
        data: {
          runId: parent.id,
          action: "changes_requested",
          note: input.feedback,
        },
      });
    }
    return { row, created: true };
  });
  if (reserved.created) {
    try {
      const response = await createAgentResponse(
        model,
        reserved.row.agent,
        assignmentPromptSchema.parse(reserved.row.prompt),
      );
      await applyResponse(reserved.row, response);
    } catch (error) {
      // Never automatically repeat a paid POST after an ambiguous timeout.
      const note =
        error instanceof AgentProviderError && error.definitive
          ? `The provider rejected the request${error.status ? ` (${error.status})` : ""}. Check the connection before retrying.`
          : "Could not confirm the provider request. It may have incurred usage. No automatic retry was made; check before retrying.";
      await prisma.$transaction([
        prisma.teamAgentRun.updateMany({
          where: {
            id: reserved.row.id,
            status: { in: ["starting", "canceling"] },
            responseId: null,
          },
          data: { status: "failed", error: note, finishedAt: new Date() },
        }),
        prisma.teamAgentEvent.create({
          data: { runId: reserved.row.id, action: "start_error", note },
        }),
      ]);
    }
  }
  return getAssignment(ownerId, reserved.row.id);
}
export async function refreshAssignment(ownerId: string, id: string) {
  const row = await prisma.teamAgentRun.findFirst({ where: { id, ownerId } });
  if (!row) throw new Error("ASSIGNMENT_NOT_FOUND");
  if (!activeRunStatuses.includes(row.status))
    return getAssignment(ownerId, id);
  if (!row.responseId) {
    if (Date.now() - row.createdAt.getTime() > 120000)
      await prisma.teamAgentRun.updateMany({
        where: { id, status: active(), responseId: null },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error:
            "Start confirmation was interrupted. No automatic retry was made. The provider may have incurred usage.",
        },
      });
    return getAssignment(ownerId, id);
  }
  const claim = await prisma.teamAgentRun.updateMany({
    where: { id, status: active(), nextPollAt: { lte: new Date() } },
    data: { nextPollAt: new Date(Date.now() + 30000) },
  });
  if (!claim.count) return getAssignment(ownerId, id);
  try {
    const response =
      row.status === "canceling"
        ? await cancelAgentResponse(row.responseId)
        : await retrieveAgentResponse(row.responseId);
    await applyResponse(row, response);
  } catch (error) {
    if (error instanceof AgentProviderError && error.status === 404) {
      await prisma.teamAgentRun.updateMany({
        where: { id, status: active() },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error:
            "The provider result is no longer available. No automatic retry was made.",
        },
      });
    } else throw new Error("AGENT_REFRESH_FAILED");
  }
  return getAssignment(ownerId, id);
}
export async function cancelAssignment(ownerId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const changed = await tx.teamAgentRun.updateMany({
      where: { id, ownerId, status: { in: ["starting", "queued", "running"] } },
      data: { status: "canceling", nextPollAt: new Date() },
    });
    if (changed.count)
      await tx.teamAgentEvent.create({
        data: {
          runId: id,
          action: "cancel_requested",
          note: "Owner requested cancellation. Work already generated may still incur usage.",
        },
      });
  });
  return refreshAssignment(ownerId, id);
}
export async function approveAssignment(ownerId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const row = await tx.teamAgentRun.findFirst({ where: { id, ownerId } });
    if (!row) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (
      row.status !== "completed" ||
      row.reviewStatus === "changes_requested" ||
      (await tx.teamAgentRun.findFirst({ where: { ownerId, parentId: id } }))
    )
      throw new Error("INVALID_ASSIGNMENT");
    if (row.reviewStatus === "approved") return;
    await tx.teamAgentRun.update({
      where: { id },
      data: { reviewStatus: "approved" },
    });
    await tx.teamAgentEvent.create({
      data: {
        runId: id,
        action: "approved",
        note: "Owner approved this exact result. No publishing or delegation was triggered.",
      },
    });
  });
  return getAssignment(ownerId, id);
}
export async function syncPendingAssignments() {
  const rows = await prisma.teamAgentRun.findMany({
    where: { status: active(), nextPollAt: { lte: new Date() } },
    orderBy: { nextPollAt: "asc" },
    take: 30,
    select: { id: true, ownerId: true },
  });
  let failures = 0;
  for (let i = 0; i < rows.length; i += 3) {
    const results = await Promise.allSettled(
      rows.slice(i, i + 3).map((row) => refreshAssignment(row.ownerId, row.id)),
    );
    failures += results.filter((r) => r.status === "rejected").length;
  }
  return { checked: rows.length, failures };
}
