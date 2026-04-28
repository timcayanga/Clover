import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { captureAppError } from "@/lib/admin-error-logs";
import { getErrorDetails } from "@/lib/error-logs";

export const dynamic = "force-dynamic";

const schema = z.object({
  message: z.string().min(1),
  name: z.string().optional().nullable(),
  stack: z.string().optional().nullable(),
  source: z.string().min(1),
  route: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  statusCode: z.number().int().optional().nullable(),
  buildId: z.string().optional().nullable(),
  deploymentId: z.string().optional().nullable(),
  environment: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  clerkUserId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  metadata: z.unknown().optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userAgent = request.headers.get("user-agent") ?? null;
    const payload = schema.parse(await request.json());
    const details = getErrorDetails({
      name: payload.name ?? undefined,
      message: payload.message,
      stack: payload.stack ?? undefined,
    });
    const metadata =
      payload.metadata === undefined
        ? undefined
        : payload.metadata === null
          ? null
          : (payload.metadata as Prisma.InputJsonValue);

    const log = await captureAppError({
      ...details,
      source: payload.source,
      route: payload.route ?? null,
      url: payload.url ?? null,
      method: payload.method ?? null,
      statusCode: payload.statusCode ?? null,
      buildId: payload.buildId ?? null,
      deploymentId: payload.deploymentId ?? null,
      environment: payload.environment ?? null,
      userAgent: payload.userAgent ?? userAgent,
      clerkUserId: payload.clerkUserId ?? session.userId ?? null,
      userId: payload.userId ?? null,
      workspaceId: payload.workspaceId ?? null,
      metadata,
      occurredAt: payload.occurredAt ?? undefined,
    });

    return NextResponse.json({ ok: true, log });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to record error" },
      { status: 400 }
    );
  }
}
