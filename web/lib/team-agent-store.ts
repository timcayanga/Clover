import { createHash, randomUUID } from "node:crypto";
import { Prisma, type TeamAgentRun } from "@prisma/client";
import { prisma } from "./prisma";
import { assertTeamMediaStorage, saveGeneratedTeamImage } from "./team-media.server";
import { studioSchema, agentProfiles } from "./team-studio";
import {
  assignmentTransferSchema,
  type AssignmentTransfer,
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
    sourceAssignmentId: prompt.sourceAssignmentId,
    instructions: prompt.instructions,
    feedback: prompt.feedback,
    result: row.result,
    output: prompt.output,
    mediaId: prompt.output === "image" && await prisma.teamStudioMedia.findFirst({ where: { id: row.id, ownerId, ready: true } }) ? row.id : null,
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
  const rows = await prisma.teamAgentRun.findMany({
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
      prompt: true,
    },
  });
  return rows.map(({ prompt, ...row }) => ({
    ...row,
    brief: assignmentPromptSchema.parse(prompt).brief,
  }));
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
  const prompt = assignmentPromptSchema.parse(row.prompt);
  if (prompt.output === "image") {
    result.estimatedCostUsd = null;
    const image = response.output.find((item) => item.type === "image_generation_call" && item.result);
    if (response.status === "completed") {
      if (!image?.result) {
        status = "failed";
        error = "The provider returned no image. Review your brief before retrying; usage may have been incurred.";
      } else {
        try {
          await saveGeneratedTeamImage(row.ownerId, row.id, image.result);
          if (!result.result.trim()) result.result = "Generated image for owner review. Check visual accuracy, text, and brand fit before approval. Confidence requires owner review.";
        } catch (cause) {
          if (!(cause instanceof Error) || cause.message !== "INVALID_MEDIA") throw cause;
          status = "failed";
          error = "The provider returned an invalid image. Your earlier work is safe. Review the brief before retrying; usage may have been incurred.";
        }
      }
    }
  }
  if (status === "completed" && !result.result.trim()) {
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
        ...(input.action === "start" && input.output === "image" ? ["image"] : []),
      ]),
    )
    .digest("hex");
  const reserved = await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const existing = await tx.teamAgentRun.findUnique({
      where: { ownerId_triggerKey: { ownerId, triggerKey } },
    });
    if (existing) return { row: existing, created: false };
    if (input.action === "start") {
      const first = await tx.teamAgentRun.findFirst({ where: { ownerId, briefId: input.briefId, parentId: null }, orderBy: { createdAt: "asc" } });
      if (first) return { row: first, created: false };
    }
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
    const output = parent ? assignmentPromptSchema.parse(parent.prompt).output : input.output || "text";
    if (output === "image") {
      if (agent.id !== "creator") throw new Error("INVALID_ASSIGNMENT");
      assertTeamMediaStorage();
    }
    // One child per revision: concurrent tabs cannot fork conflicting revisions.
    if (parent) {
      const child = await tx.teamAgentRun.findFirst({
        where: { ownerId, parentId: parent.id },
      });
      if (child) throw new Error("ASSIGNMENT_SUPERSEDED");
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
    if (output === "image" && await tx.teamAgentRun.count({ where: { ownerId, createdAt: { gte: day }, prompt: { path: ["output"], equals: "image" } } }) >= 5) throw new Error("IMAGE_LIMIT");
    if (today >= 20 || busy >= 3) throw new Error("ASSIGNMENT_LIMIT");
    const source = brief.sourceAssignmentId
      ? await tx.teamAgentRun.findFirst({
          where: {
            id: brief.sourceAssignmentId,
            ownerId,
            status: "completed",
            reviewStatus: "approved",
          },
        })
      : null;
    if (brief.sourceAssignmentId && !source)
      throw new Error("SOURCE_NOT_APPROVED");
    const prompt =
      input.action === "retry" && parent
        ? assignmentPromptSchema.parse(parent.prompt)
        : {
            output,
            sourceAssignmentId: source?.id || "",
            sourceContext: source?.result.slice(0, 30000) || "",
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
    let responseConfirmed = false;
    try {
      const response = await createAgentResponse(
        model,
        reserved.row.agent,
        assignmentPromptSchema.parse(reserved.row.prompt),
      );
      // Save the provider ID before media persistence so a storage outage can
      // recover the same paid result without issuing another generation.
      await prisma.teamAgentRun.updateMany({ where: { id: reserved.row.id, responseId: null }, data: { responseId: response.id } });
      responseConfirmed = true;
      await applyResponse(reserved.row, response);
    } catch (error) {
      if (responseConfirmed) {
        await prisma.teamAgentEvent.create({ data: {
          runId: reserved.row.id,
          action: "result_save_delayed",
          note: "The provider accepted this run, but its result could not be saved yet. Refresh will retrieve the same result without starting another paid generation.",
        } });
        return getAssignment(ownerId, reserved.row.id);
      }
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
      await failAssignment(
        id,
        "Start confirmation was interrupted. No automatic retry was made. The provider may have incurred usage.",
        true,
      );
    return getAssignment(ownerId, id);
  }
  const claim = await prisma.teamAgentRun.updateMany({
    where: { id, status: active(), nextPollAt: { lte: new Date() } },
    data: { nextPollAt: new Date(Date.now() + 150000) },
  });
  if (!claim.count) return getAssignment(ownerId, id);
  try {
    // Retrieve first so a completion that won the cancel race is saved normally.
    let response = await retrieveAgentResponse(row.responseId);
    if (
      row.status === "canceling" &&
      ["queued", "in_progress"].includes(response.status)
    ) {
      try {
        response = await cancelAgentResponse(row.responseId);
      } catch (error) {
        if (
          !(error instanceof AgentProviderError) ||
          ![400, 409].includes(error.status || 0)
        )
          throw error;
        response = await retrieveAgentResponse(row.responseId);
      }
    }
    await applyResponse(row, response);
  } catch (error) {
    if (error instanceof AgentProviderError && error.status === 404) {
      await failAssignment(
        id,
        "The provider result is no longer available. No automatic retry was made.",
      );
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
export async function withdrawAssignmentApproval(ownerId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const row = await tx.teamAgentRun.findFirst({ where: { id, ownerId } });
    if (!row) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (row.status !== "completed" || row.reviewStatus === "changes_requested") throw new Error("INVALID_ASSIGNMENT");
    if (row.reviewStatus === "pending") return;
    await tx.teamAgentRun.update({ where: { id }, data: { reviewStatus: "pending" } });
    await tx.teamAgentEvent.create({ data: {
      runId: id, action: "approval_withdrawn",
      note: "Owner withdrew approval. New transfers and follow-up starts using this result are blocked until it is approved again. Existing drafts and running assignments retain their separate review history.",
    } });
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
  let checked = 0;
  const startedAt = Date.now();
  for (let i = 0; i < rows.length; i += 3) {
    if (Date.now() - startedAt > 150000) break;
    const batch = rows.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map((row) => refreshAssignment(row.ownerId, row.id)),
    );
    checked += batch.length;
    failures += results.filter((r) => r.status === "rejected").length;
  }
  return { checked, failures };
}

async function failAssignment(
  id: string,
  error: string,
  withoutResponse = false,
) {
  await prisma.$transaction(async (tx) => {
    const changed = await tx.teamAgentRun.updateMany({
      where: {
        id,
        status: active(),
        ...(withoutResponse ? { responseId: null } : {}),
      },
      data: { status: "failed", finishedAt: new Date(), error },
    });
    if (changed.count)
      await tx.teamAgentEvent.create({
        data: { runId: id, action: "failed", note: error },
      });
  });
}
export async function refreshOwnerAssignments(ownerId: string) {
  const rows = await prisma.teamAgentRun.findMany({
    where: { ownerId, status: active(), nextPollAt: { lte: new Date() } },
    take: 3,
    orderBy: { nextPollAt: "asc" },
    select: { id: true },
  });
  const results = await Promise.allSettled(
    rows.map((row) => refreshAssignment(ownerId, row.id)),
  );
  return {
    runs: await listAssignments(ownerId),
    failures: results.filter((r) => r.status === "rejected").length,
  };
}
export async function transferAssignment(
  ownerId: string,
  id: string,
  raw: AssignmentTransfer,
) {
  const input = assignmentTransferSchema.parse(raw);
  const artifactId = createHash("sha256")
    .update(JSON.stringify([id, input]))
    .digest("hex")
    .slice(0, 32);
  return prisma.$transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const run = await tx.teamAgentRun.findFirst({
      where: { id, ownerId, status: "completed", reviewStatus: "approved" },
    });
    if (
      !run ||
      (await tx.teamAgentRun.findFirst({ where: { ownerId, parentId: id } }))
    )
      throw new Error("SOURCE_NOT_APPROVED");
    const old = await tx.teamStudioState.findUnique({ where: { ownerId } });
    if (!old) throw new Error("INVALID_STATE");
    const state = studioSchema.parse(old.payload);
    const existing =
      input.kind === "brief"
        ? state.briefs.some((b) => b.id === artifactId)
        : state.drafts.some((d) => d.id === artifactId);
    const href =
      input.kind === "brief"
        ? `/team?agent=${input.agent}`
        : `/team?view=Content%20board&draft=${artifactId}`;
    if (existing) return { id: artifactId, href, kind: input.kind };
    const at = new Date().toISOString();
    if (input.kind === "brief") {
      if (state.briefs.length >= 200) throw new Error("STUDIO_CAPACITY");
      state.briefs.push({
        id: artifactId,
        agent: input.agent,
        text: input.text,
        at,
        sourceAssignmentId: id,
      });
    } else {
      if (state.drafts.length >= 200) throw new Error("STUDIO_CAPACITY");
      state.drafts.push({
        id: artifactId,
        title: input.title,
        caption: input.caption,
        channel: input.channel,
        format: input.format,
        agent: run.agent as "lead" | "creator" | "researcher",
        sourceAssignmentId: id,
        ...(assignmentPromptSchema.parse(run.prompt).output === "image" ? { mediaId: run.id, mediaType: "image" as const } : {}),
        status: "Draft",
        date: "",
        sample: false,
        visual: "sage",
        revision: 1,
        history: [],
      });
    }
    const payload = json(studioSchema.parse(state));
    const updated = await tx.teamStudioState.updateMany({
      where: { ownerId, revision: old.revision },
      data: { revision: old.revision + 1, payload },
    });
    if (!updated.count) throw new Error("CONFLICT");
    await tx.teamStudioAudit.create({
      data: { ownerId, revision: old.revision + 1, payload },
    });
    await tx.teamAgentEvent.create({
      data: {
        runId: id,
        action: input.kind === "brief" ? "handoff_created" : "draft_created",
        note:
          input.kind === "brief"
            ? `Owner created follow-up brief ${artifactId} for ${input.agent}. It has not been started.`
            : `Owner created content draft ${artifactId}. Draft requires its own review; nothing published.`,
      },
    });
    return { id: artifactId, href, kind: input.kind };
  });
}
