import { timingSafeEqual } from "node:crypto";
import { runImportRecoverySweep } from "@/lib/import-recovery-sweep";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "sin1";

const tokensMatch = (provided: string, expected: string) => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!cronSecret || !tokensMatch(authorization, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await runImportRecoverySweep({
    importLimit: 1,
    enrichmentLimit: 2,
    workerId: `vercel-cron-import-recovery-${startedAt}`,
  });

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    ...result,
  });
}
