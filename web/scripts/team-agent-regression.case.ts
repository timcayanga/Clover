import { saveGeneratedTeamImage, teamMediaReadUrl } from "../lib/team-media.server";
import { objects } from "./fixtures/team-s3";
import { formatAssignmentTime } from "../lib/team-agent-contract";
import { loadTeamStudio, saveTeamStudio } from "../lib/team-studio-store";
import { canonicalStudioState } from "../lib/team-studio-server-state";
import { TeamAssignmentResult } from "../components/team-assignment-result";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixture } from "./fixtures/team-clerk";
import { GET, POST } from "../app/api/team/assignments/route";
import {
  GET as getRun,
  POST as updateRun,
} from "../app/api/team/assignments/[runId]/route";
import { GET as cron } from "../app/api/cron/team-assignments/route";
import { initialStudio } from "../lib/team-studio";
import { prisma } from "../lib/prisma";
import {
  transferAssignment,
  refreshOwnerAssignments,
  startAssignment,
  refreshAssignment,
  approveAssignment,
  cancelAssignment,
  syncPendingAssignments,
} from "../lib/team-agent-store";
import {
  createAgentResponse,
  extractAgentResult,
  defaultTeamModel,
} from "../lib/team-agent-provider";

const owner = `agent-test-${randomUUID()}`;
const ids = Array.from({ length: 30 }, () => randomUUID());
const responses = new Map<string, any>();
const captured: any[] = [];
let failure: "network" | "reject" | null = null;
let creates = 0;
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = String(input);
  assert(url.startsWith("https://api.openai.com/v1/responses"));
  if (url.endsWith("/responses") && init?.method === "POST") {
    creates++;
    captured.push(JSON.parse(String(init.body)));
    if (failure === "network") throw new Error("network interrupted");
    if (failure === "reject")
      return new Response("private provider diagnostics", { status: 400 });
    const id = `resp_${randomUUID()}`;
    const response = { id, status: "queued", output: [] };
    responses.set(id, response);
    return Response.json(response);
  }
  const id = url.split("/").at(url.endsWith("/cancel") ? -2 : -1)!;
  const response = responses.get(id);
  if (!response) return new Response("not found", { status: 404 });
  if (url.endsWith("/cancel")) response.status = "cancelled";
  return Response.json(response);
};
const req = (body?: unknown, origin = "https://team.clover.ph") =>
  new Request(
    "https://team.clover.ph/api/team/assignments",
    body
      ? {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
const context = (id: string) => ({ params: Promise.resolve({ runId: id }) });
const start = (briefId: string, rest = {}) =>
  startAssignment(owner, { briefId, action: "start", feedback: "", ...rest });
async function due(id: string) {
  await prisma.teamAgentRun.update({
    where: { id },
    data: { nextPollAt: new Date(0) },
  });
}
async function complete(id: string) {
  const row = await prisma.teamAgentRun.findUniqueOrThrow({ where: { id } });
  responses.set(row.responseId!, {
    id: row.responseId,
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "Unpublished proposal. Confidence: medium.",
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 200 },
  });
  await due(id);
  return refreshAssignment(owner, id);
}
async function main() {
  const savedTimezone = process.env.TZ;
  process.env.TZ = "UTC";
  const utcDisplay = formatAssignmentTime("2026-09-28T13:27:04.000Z");
  process.env.TZ = "Asia/Manila";
  assert.equal(formatAssignmentTime("2026-09-28T13:27:04.000Z"), utcDisplay);
  assert.equal(utcDisplay, "2026-09-28 21:27 PHT");
  if (savedTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = savedTimezone;
  process.env.OPENAI_API_KEY = "disposable-test-value";
  process.env.CRON_SECRET = "disposable-cron-test";
  assert.equal((await GET(req())).status, 401);
  assert.equal((await POST(req({ briefId: ids[0] }))).status, 401);
  assert.equal((await getRun(req(), context(randomUUID()))).status, 401);
  fixture.user = {
    id: owner,
    emailAddresses: [
      {
        emailAddress: "hello@clover.ph",
        verification: { status: "unverified" },
      },
    ],
  };
  assert.equal((await GET(req())).status, 403);
  fixture.user.emailAddresses[0].verification.status = "verified";
  assert.equal(
    (await POST(req({ briefId: ids[0] }, "https://evil.test"))).status,
    403,
  );
  assert.equal(
    (await POST(req({ briefId: ids[0], feedback: "x".repeat(21000) }))).status,
    413,
  );
  assert.equal((await cron(req())).status, 401);
  const state = {
    ...initialStudio(),
    drafts: [],
    briefs: ids.map((id) => ({
      id,
      agent: "lead",
      text: `Synthetic brief ${id}`,
      at: new Date().toISOString(),
    })),
  };
  await prisma.teamStudioState.create({
    data: { ownerId: owner, payload: state, revision: 1 },
  });
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => start(ids[0])),
  );
  assert.equal(new Set(concurrent.map((r) => r.id)).size, 1);
  assert.equal(creates, 1);
  const first = concurrent[0];
  assert.equal(captured[0].background, true);
  assert.equal(captured[0].store, true);
  assert.equal(captured[0].tools, undefined);
  assert.equal(
    JSON.parse(captured[0].input).instructions,
    state.instructions.lead,
  );
  const got = await getRun(req(), context(first.id));
  assert.equal(got.headers.get("cache-control"), "private, no-store");
  fixture.user.id = "other-owner";
  assert.equal((await getRun(req(), context(first.id))).status, 404);
  fixture.user.id = owner;
  const completed = await complete(first.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.reviewStatus, "pending");
  assert(completed.estimatedCostUsd! > 0);
  assert.equal(
    (await approveAssignment(owner, first.id)).reviewStatus,
    "approved",
  );
  const revision = await start(ids[0], {
    parentId: first.id,
    action: "revise",
    feedback: "Make it shorter",
  });
  assert.equal(creates, 2);
  assert.equal(revision.feedback, "Make it shorter");
  assert.equal(
    captured[1] && JSON.parse(captured[1].input).previousResult,
    completed.result,
  );
  assert.equal(
    (await getRun(req(), context(first.id)).then((r) => r.json())).reviewStatus,
    "changes_requested",
  );
  await assert.rejects(
    approveAssignment(owner, first.id),
    /INVALID_ASSIGNMENT/,
  );
  await assert.rejects(
    start(ids[0], {
      parentId: first.id,
      action: "revise",
      feedback: "A concurrent different edit",
    }),
    /ASSIGNMENT_SUPERSEDED/,
  );
  assert.equal(
    (
      await start(ids[0], {
        parentId: first.id,
        action: "revise",
        feedback: "Make it shorter",
      })
    ).id,
    revision.id,
  );
  assert.equal(creates, 2);
  assert.equal((await cancelAssignment(owner, revision.id)).status, "canceled");
  assert.equal((await complete(revision.id)).status, "canceled"); // late provider completion cannot replace a terminal state
  const retry = await start(ids[0], { parentId: revision.id, action: "retry" });
  assert.equal(creates, 3);
  assert.equal(retry.feedback, "Make it shorter");
  assert.equal(JSON.parse(captured[2].input).previousResult, completed.result);
  await due(retry.id);
  await complete(retry.id);
  const history = await GET(
    new Request(
      `https://team.clover.ph/api/team/assignments?briefId=${ids[0]}`,
    ),
  ).then((r) => r.json());
  assert.equal(history.runs.length, 3);
  const summaries = await GET(req()).then((r) => r.json());
  assert.equal(summaries.runs.length, 1);
  assert.equal(summaries.runs[0].id, retry.id);
  failure = "network";
  const ambiguous = await start(ids[1]);
  assert.equal(ambiguous.status, "failed");
  assert(ambiguous.error?.includes("may have incurred"));
  const before = creates;
  await start(ids[1]);
  await refreshAssignment(owner, ambiguous.id);
  assert.equal(creates, before);
  failure = "reject";
  const rejected = await start(ids[2]);
  assert.equal(rejected.status, "failed");
  assert(!JSON.stringify(rejected).includes("private provider"));
  failure = null;
  const busy = await Promise.all(
    ids.slice(3, 7).map((id) => start(id).catch((e) => e.message)),
  );
  assert.equal(busy.filter((r) => r === "ASSIGNMENT_LIMIT").length, 1);
  for (const run of busy)
    if (typeof run !== "string") {
      await complete(run.id);
    }
  // A run left without a provider ID expires safely and is never automatically resubmitted.
  const stale = await prisma.teamAgentRun.create({
    data: {
      id: randomUUID(),
      ownerId: owner,
      briefId: ids[7],
      agent: "lead",
      triggerKey: randomUUID(),
      model: defaultTeamModel,
      prompt: {
        brief: "test",
        instructions: "test",
        role: "lead",
        feedback: "",
        previousResult: "",
      },
      createdAt: new Date(Date.now() - 180000),
    },
  });
  const beforeSync = creates;
  await syncPendingAssignments();
  assert.equal(
    (await prisma.teamAgentRun.findUniqueOrThrow({ where: { id: stale.id } }))
      .status,
    "failed",
  );
  assert.equal(creates, beforeSync);
  // Only approved outputs can produce next steps; appending is idempotent and preserves CAS.
  const draftInput = {
    kind: "draft" as const,
    title: "Approved copy",
    caption: "A reviewed excerpt",
    channel: "Instagram" as const,
    format: "Text" as const,
  };
  await assert.rejects(
    transferAssignment(owner, retry.id, draftInput),
    /SOURCE_NOT_APPROVED/,
  );
  await approveAssignment(owner, retry.id);
  const oldState = await loadTeamStudio(owner);
  const exported = await Promise.all([
    transferAssignment(owner, retry.id, draftInput),
    transferAssignment(owner, retry.id, draftInput),
  ]);
  assert.equal(exported[0].id, exported[1].id);
  const afterExport = await loadTeamStudio(owner);
  assert.equal(afterExport.revision, oldState.revision + 1);
  assert.equal(afterExport.state.drafts.length, 1);
  assert.equal(afterExport.state.drafts[0].status, "Draft");
  assert.equal(afterExport.state.drafts[0].sourceAssignmentId, retry.id);
  await assert.rejects(saveTeamStudio(owner, oldState), /CONFLICT/);
  await assert.rejects(
    transferAssignment("foreign-owner", retry.id, draftInput),
    /SOURCE_NOT_APPROVED/,
  );
  const forged = structuredClone(afterExport.state);
  forged.drafts[0].sourceAssignmentId = first.id;
  assert.throws(
    () => canonicalStudioState(afterExport.state, forged),
    /INVALID_STATE/,
  );
  const handoff = await transferAssignment(owner, retry.id, {
    kind: "brief",
    agent: "creator",
    text: "Write a caption from this approved proposal",
  });
  const afterHandoff = await loadTeamStudio(owner);
  assert(
    afterHandoff.state.briefs.some(
      (b) => b.id === handoff.id && b.sourceAssignmentId === retry.id,
    ),
  );
  const followup = await start(handoff.id);
  assert.equal(followup.agent, "creator");
  assert.equal(followup.sourceAssignmentId, retry.id);
  assert.equal(
    JSON.parse(captured.at(-1).input).sourceContext,
    completed.result,
  );
  await complete(followup.id);
  await prisma.teamAgentRun.update({
    where: { id: retry.id },
    data: { reviewStatus: "changes_requested" },
  });
  await assert.rejects(
    start(handoff.id, {
      action: "revise",
      parentId: followup.id,
      feedback: "Change tone",
    }),
    /SOURCE_NOT_APPROVED/,
  );
  // A cancel request arriving after provider completion returns the completed proposal.
  const racing = await start(ids[10]);
  const racingRow = await prisma.teamAgentRun.findUniqueOrThrow({
    where: { id: racing.id },
  });
  responses.set(racingRow.responseId!, {
    id: racingRow.responseId,
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: "Completed before cancellation" },
        ],
      },
    ],
  });
  assert.equal((await cancelAssignment(owner, racing.id)).status, "completed");
  assert.equal((await refreshOwnerAssignments(owner)).failures, 0);
  assert((await refreshOwnerAssignments("foreign-owner")).runs.length === 0);
  const markup = renderToStaticMarkup(
    createElement(TeamAssignmentResult, {
      run: {
        result:
          "# Heading\n**Bold**\n- List item\n<script>alert(1)</script>\n[bad](javascript:alert(1))\n[good](https://example.com)",
        sources: [],
      },
    }),
  );
  assert(markup.includes("<h3>Heading</h3>"));
  assert(markup.includes("<strong>Bold</strong>"));
  assert(markup.includes("<ul>"));
  assert(!markup.includes("<script>"));
  assert(!markup.includes('href="javascript:'));
  assert(markup.includes('href="https://example.com/"'));
  // Image runs use the same owner/approval boundary and survive storage outages.
  await assert.rejects(start(ids[22], { output: "image" }), /INVALID_ASSIGNMENT/);
  const imageState = await loadTeamStudio(owner);
  const imageBrief = { id: ids[23], agent: "creator", text: "Synthetic original Clover image", at: new Date().toISOString() };
  imageState.state.briefs = imageState.state.briefs.map((b) => b.id === ids[23] ? imageBrief : b);
  // Fixture setup bypasses append-only UI restrictions in the isolated test DB.
  await prisma.teamStudioState.update({ where: { ownerId: owner }, data: { payload: imageState.state } });
  process.env.R2_ACCOUNT_ID = "fixture";
  process.env.R2_ACCESS_KEY_ID = "fixture";
  process.env.R2_SECRET_ACCESS_KEY = "fixture";
  process.env.CLOVER_TEAM_MEDIA_BUCKET = "private-fixture";
  const imageRun = await start(ids[23], { output: "image" });
  assert.equal(imageRun.output, "image");
  assert.equal(captured.at(-1).max_tool_calls, 1);
  assert.equal(captured.at(-1).tools[0].type, "image_generation");
  assert.equal(captured.at(-1).tools[0].model, "gpt-image-1.5");
  assert.equal((await start(ids[23], { output: "text" })).id, imageRun.id, "Changing mode cannot duplicate a paid start");
  const imageRow = await prisma.teamAgentRun.findUniqueOrThrow({ where: { id: imageRun.id } });
  const png = Buffer.from([137,80,78,71,13,10,26,10]);
  responses.set(imageRow.responseId!, { id: imageRow.responseId, status: "completed", output: [{ type: "image_generation_call", result: png.toString("base64") }] });
  delete process.env.R2_ACCESS_KEY_ID;
  await due(imageRun.id);
  await assert.rejects(refreshAssignment(owner, imageRun.id), /AGENT_REFRESH_FAILED/);
  assert.equal((await prisma.teamAgentRun.findUniqueOrThrow({ where: { id: imageRun.id } })).responseId, imageRow.responseId);
  process.env.R2_ACCESS_KEY_ID = "fixture";
  await due(imageRun.id);
  const finishedImage = await refreshAssignment(owner, imageRun.id);
  assert.equal(finishedImage.status, "completed");
  assert.equal(finishedImage.mediaId, imageRun.id);
  assert.equal(finishedImage.estimatedCostUsd, null, "Do not show text-only pricing for images");
  assert(!JSON.stringify(finishedImage).includes(png.toString("base64")), "Never send base64 through assignment JSON");
  await assert.rejects(teamMediaReadUrl("other", imageRun.id), /MEDIA_NOT_FOUND/);
  const imageMedia = await prisma.teamStudioMedia.findUniqueOrThrow({ where: { id: imageRun.id } });
  await saveGeneratedTeamImage(owner, imageRun.id, Buffer.concat([png, Buffer.from("changed")]).toString("base64"));
  assert.deepEqual(objects.get(imageMedia.storageKey)?.bytes, png, "Saved result bytes are immutable");
  await approveAssignment(owner, imageRun.id);
  const imageDraft = await transferAssignment(owner, imageRun.id, { kind: "draft", title: "Image fixture", caption: "Unpublished", channel: "Instagram", format: "Image" });
  const savedImageDraft = (await loadTeamStudio(owner)).state.drafts.find((d) => d.id === imageDraft.id)!;
  assert.equal(savedImageDraft.mediaId, imageRun.id);
  assert.equal(savedImageDraft.status, "Draft");
  await assert.rejects(saveGeneratedTeamImage(owner, randomUUID(), Buffer.from("not an image").toString("base64")), /INVALID_MEDIA/);
  for (let i = 0; i < 4; i++) await prisma.teamAgentRun.create({ data: { id: randomUUID(), ownerId: owner, briefId: ids[24], agent: "creator", triggerKey: randomUUID(), model: defaultTeamModel, status: "failed", prompt: { brief: "image cap fixture", role: "creator", instructions: "", previousResult: "", feedback: "", output: "image" } } });
  await assert.rejects(start(ids[23], { action: "revise", parentId: imageRun.id, feedback: "Try another color" }), /IMAGE_LIMIT/);
  console.log("PASS: image mode, bounded tool use, duplicate-mode protection, storage recovery without regeneration, private immutable image, and draft attachment.");
  const createsBeforeCap = creates;
  // Daily cap includes terminal runs; denied requests never contact the provider.
  const count = await prisma.teamAgentRun.count({ where: { ownerId: owner } });
  for (let i = count; i < 20; i++)
    await prisma.teamAgentRun.create({
      data: {
        id: randomUUID(),
        ownerId: owner,
        briefId: ids[8],
        agent: "lead",
        triggerKey: randomUUID(),
        model: defaultTeamModel,
        status: "failed",
        prompt: {
          brief: "test",
          instructions: "test",
          role: "lead",
          feedback: "",
          previousResult: "",
        },
      },
    });
  await assert.rejects(start(ids[9]), /ASSIGNMENT_LIMIT/);
  assert.equal(creates, createsBeforeCap);
  await createAgentResponse(defaultTeamModel, "researcher", {
    brief: "Research public posting rules",
    instructions: "Cite sources",
    role: "Community researcher",
    feedback: "",
    previousResult: "",
  });
  assert.deepEqual(captured.at(-1).tools, [
    { type: "web_search", search_context_size: "low" },
  ]);
  const result = extractAgentResult(
    {
      id: "resp_fixture",
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Source",
              annotations: [
                {
                  type: "url_citation",
                  url: "javascript:alert(1)",
                  start_index: 0,
                  end_index: 6,
                },
                {
                  type: "url_citation",
                  url: "https://example.com",
                  title: "Source",
                  start_index: 0,
                  end_index: 6,
                },
              ],
            },
          ],
        },
      ],
    },
    defaultTeamModel,
  );
  assert.equal(result.sources.length, 1);
  const roles = await prisma.$queryRaw<
    { relname: string; relrowsecurity: boolean }[]
  >`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('TeamAgentRun','TeamAgentEvent')`;
  assert(roles.every((r) => r.relrowsecurity));
  console.log(
    "PASS: owner-only APIs, origins, payload limits, duplicate/concurrent starts, prompt snapshots, saved results, approvals, immutable revisions, cancellation, ambiguous failure without paid retries, concurrency/daily caps, background recovery, citations, researcher tools, approved handoffs with context, content-draft creation, provenance, stale studio edits, safe Markdown, cancellation races, and RLS. Real PostgreSQL; Clerk and OpenAI simulated.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    global.fetch = originalFetch;
    await prisma.teamAgentRun.deleteMany({ where: { ownerId: owner } });
    await prisma.teamStudioMedia.deleteMany({ where: { ownerId: owner } });
    await prisma.teamStudioAudit.deleteMany({ where: { ownerId: owner } });
    await prisma.teamStudioState.deleteMany({ where: { ownerId: owner } });
    await prisma.$disconnect();
  });
