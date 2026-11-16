import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { captureAppError } from "@/lib/admin-error-logs";
import { getErrorDetails } from "@/lib/error-logs";
import { assertContentLengthWithin, assertTrustedRequestOrigin, getRequestClientIp } from "@/lib/request-security";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ERROR_LOG_MAX_BODY_BYTES = 64 * 1024;
const ERROR_LOG_MAX_MESSAGE_LENGTH = 2_000;
const ERROR_LOG_MAX_NAME_LENGTH = 120;
const ERROR_LOG_MAX_STACK_LENGTH = 12_000;
const ERROR_LOG_MAX_SOURCE_LENGTH = 120;
const ERROR_LOG_MAX_ROUTE_LENGTH = 255;
const ERROR_LOG_MAX_URL_LENGTH = 2_048;
const ERROR_LOG_MAX_METHOD_LENGTH = 16;
const ERROR_LOG_MAX_ENVIRONMENT_LENGTH = 32;
const ERROR_LOG_MAX_USER_AGENT_LENGTH = 255;

const schema = z.object({
  message: z.string().min(1).max(ERROR_LOG_MAX_MESSAGE_LENGTH),
  name: z.string().max(ERROR_LOG_MAX_NAME_LENGTH).optional().nullable(),
  stack: z.string().max(ERROR_LOG_MAX_STACK_LENGTH).optional().nullable(),
  source: z.string().min(1).max(ERROR_LOG_MAX_SOURCE_LENGTH),
  route: z.string().max(ERROR_LOG_MAX_ROUTE_LENGTH).optional().nullable(),
  url: z.string().max(ERROR_LOG_MAX_URL_LENGTH).optional().nullable(),
  method: z.string().max(ERROR_LOG_MAX_METHOD_LENGTH).optional().nullable(),
  statusCode: z.number().int().optional().nullable(),
  buildId: z.string().max(120).optional().nullable(),
  deploymentId: z.string().max(120).optional().nullable(),
  environment: z.string().max(ERROR_LOG_MAX_ENVIRONMENT_LENGTH).optional().nullable(),
  userAgent: z.string().max(ERROR_LOG_MAX_USER_AGENT_LENGTH).optional().nullable(),
  workspaceId: z.string().max(120).optional().nullable(),
  metadata: z.unknown().optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, ERROR_LOG_MAX_BODY_BYTES);
    assertRateLimit(`error-log:${getRequestClientIp(request)}`, 30, 60_000);

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
      clerkUserId: session.userId ?? null,
      userId: null,
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
