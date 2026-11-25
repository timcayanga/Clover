import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { learningVerificationResponse } from "@/lib/learning-verification-response.server";
import { previewPreservationHashPage, stagingManifestTables, assertLearningVerificationEnvironment, startLearningVerification, prepareLearningVerificationCheckpoints, repairLearningVerificationReference, inspectLearningVerification, inspectLearningVerificationStatus, inspectLearningVerificationDigest, repairVerificationBpiCheckpoint, previewLearningBatchPreservation, startLearningVerificationBatch } from "@/lib/staging-learning-verification";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const input = z.object({ runId: z.string().uuid(), action: z.enum(["start", "start-batch", "start-version-batch", "inspect", "inspect-status", "inspect-digest", "inspect-own", "inspect-own-digest", "prepare-checkpoints", "repair-reference", "preview-bpi-checkpoint", "repair-bpi-checkpoint", "preview-batch-preservation", "preview-batch-preservation-table", "preview-preservation-page"]), after: z.string().min(1).max(200).optional(), pageSize: z.number().int().min(1).max(512).optional(), table: z.enum(stagingManifestTables).optional(), runIds: z.array(z.string().uuid()).min(1).max(32).optional(), expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().superRefine((value, context) => {
  if ((["start-batch", "start-version-batch", "preview-batch-preservation", "preview-batch-preservation-table", "preview-preservation-page"].includes(value.action)) !== Boolean(value.runIds) || (value.runIds && new Set(value.runIds).size !== value.runIds.length)) context.addIssue({ code: "custom", message: "Only batch actions accept unique staging run IDs." });
  if ((["preview-batch-preservation-table", "preview-preservation-page"].includes(value.action)) !== Boolean(value.table)) context.addIssue({ code: "custom", message: "Single-table preservation requires a supported table." });
  if ((value.after || value.pageSize) && value.action !== "preview-preservation-page") context.addIssue({ code: "custom", message: "Only hash pages accept a cursor." });
  if ((value.action === "repair-bpi-checkpoint") !== Boolean(value.expectedPlanHash)) context.addIssue({ code: "custom", message: "Only checkpoint repair requires the reviewed plan hash." });
});
export async function POST(request: Request) {
  const startedAt = Date.now();
  let requestedAction = "unparsed";
  try {
    assertLearningVerificationEnvironment();
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth("operate");
    const { runId, action, expectedPlanHash, runIds, table, after, pageSize } = input.parse(await request.json());
    requestedAction = action;
    const result = action === "start-version-batch" ? await startLearningVerificationBatch(runIds!, admin.userId, true) : action === "start-batch" ? await startLearningVerificationBatch(runIds!, admin.userId) : action === "preview-preservation-page" ? await previewPreservationHashPage(runIds!, admin.userId, table!, after, pageSize) : action === "preview-batch-preservation-table" ? await previewLearningBatchPreservation(runIds!, admin.userId, table) : action === "preview-batch-preservation" ? await previewLearningBatchPreservation(runIds!, admin.userId) : action === "start" ? await startLearningVerification(runId, admin.userId)
      : action === "prepare-checkpoints" ? await prepareLearningVerificationCheckpoints(runId, admin.userId)
      : action === "repair-reference" ? await repairLearningVerificationReference(runId, admin.userId)
      : action === "preview-bpi-checkpoint" || action === "repair-bpi-checkpoint" ? await repairVerificationBpiCheckpoint(runId, admin.userId, expectedPlanHash)
      : action === "inspect-status" ? await inspectLearningVerificationStatus(runId, admin.userId)
      : action === "inspect-own" ? await inspectLearningVerification(runId, admin.userId, true)
      : action === "inspect-own-digest" ? await inspectLearningVerificationDigest(runId, admin.userId, true)
      : action === "inspect-digest" ? await inspectLearningVerificationDigest(runId, admin.userId)
      : await inspectLearningVerification(runId, admin.userId);
    const response = learningVerificationResponse(result, request.headers.get("accept-encoding"));
    console.info("[staging-learning-verification]", { action, durationMs: Date.now() - startedAt });
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "VERIFICATION_UNAVAILABLE" || code === "VERIFICATION_NOT_FOUND" ? 404
      : code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "Untrusted request origin." ? 403 : error instanceof z.ZodError ? 400 : 503;
    const message = /^(VERIFICATION_[A-Z_]+|UNAUTHORIZED|FORBIDDEN)$/.test(code) ? code : "Staging verification could not complete. Existing records were not reset.";
    const databaseCode = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
    const databaseState = (error as { meta?: { code?: unknown } })?.meta?.code;
    const sqlState = databaseCode === "P2010" && typeof databaseState === "string" && /^[A-Z0-9]{5}$/.test(databaseState) ? databaseState : undefined;
    console.error("[staging-learning-verification]", { action: requestedAction, durationMs: Date.now() - startedAt, code: /^P\d{4}$/.test(databaseCode) ? databaseCode : status, ...(sqlState ? { sqlState } : {}) });
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
