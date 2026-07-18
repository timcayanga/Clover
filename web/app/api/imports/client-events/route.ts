import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { assertContentLengthWithin, assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const schema = z.object({
  stage: z.string().min(1).max(80),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, 8 * 1024);
    const { userId } = await requireAuth();
    const payload = schema.parse(await request.json());

    console.info("[import-client-stage]", {
      stage: payload.stage,
      userId,
      details: payload.details ?? {},
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.warn("[import-client-stage] rejected", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Unable to record import stage." }, { status: 400 });
  }
}
