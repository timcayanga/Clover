import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertLearningVerificationEnvironment, startLearningVerification, prepareLearningVerificationCheckpoints, repairLearningVerificationReference, inspectLearningVerification } from "@/lib/staging-learning-verification";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const input = z.object({ runId: z.string().uuid(), action: z.enum(["start", "inspect", "prepare-checkpoints", "repair-reference"]) }).strict();
export async function POST(request: Request) {
  try {
    assertLearningVerificationEnvironment();
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth("operate");
    const { runId, action } = input.parse(await request.json());
    const result = action === "start" ? await startLearningVerification(runId, admin.userId)
      : action === "prepare-checkpoints" ? await prepareLearningVerificationCheckpoints(runId, admin.userId)
      : action === "repair-reference" ? await repairLearningVerificationReference(runId, admin.userId)
      : await inspectLearningVerification(runId, admin.userId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "VERIFICATION_UNAVAILABLE" || code === "VERIFICATION_NOT_FOUND" ? 404
      : code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "Untrusted request origin." ? 403 : error instanceof z.ZodError ? 400 : 503;
    const message = /^(VERIFICATION_[A-Z_]+|UNAUTHORIZED|FORBIDDEN)$/.test(code) ? code : "Staging verification could not complete. Existing records were not reset.";
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
