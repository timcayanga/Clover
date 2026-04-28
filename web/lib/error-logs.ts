import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppBuildInfo } from "@/lib/build-info";

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
};

export type AppErrorLogInput = {
  message: string;
  name?: string | null;
  stack?: string | null;
  source: string;
  route?: string | null;
  url?: string | null;
  method?: string | null;
  statusCode?: number | null;
  buildId?: string | null;
  deploymentId?: string | null;
  environment?: string | null;
  userAgent?: string | null;
  clerkUserId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  occurredAt?: Date | string | null;
};

export type AppErrorLogListItem = {
  id: string;
  message: string;
  name: string | null;
  stack: string | null;
  source: string;
  route: string | null;
  url: string | null;
  method: string | null;
  statusCode: number | null;
  buildId: string;
  deploymentId: string | null;
  environment: string;
  userAgent: string | null;
  clerkUserId: string | null;
  userId: string | null;
  workspaceId: string | null;
  metadata: Prisma.JsonValue | null;
  occurredAt: string;
  createdAt: string;
};

type AppErrorLogRecord = {
  id: string;
  message: string;
  name: string | null;
  stack: string | null;
  source: string;
  route: string | null;
  url: string | null;
  method: string | null;
  statusCode: number | null;
  buildId: string;
  deploymentId: string | null;
  environment: string;
  userAgent: string | null;
  clerkUserId: string | null;
  userId: string | null;
  workspaceId: string | null;
  metadata: Prisma.JsonValue | null;
  occurredAt: Date;
  createdAt: Date;
};

type AppErrorLogDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<AppErrorLogRecord>;
};

const normalizeErrorText = (value: unknown, fallback: string) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  return fallback;
};

export const getErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: normalizeErrorText(error.message, "Unknown error"),
      stack: error.stack ?? null,
    };
  }

  if (error && typeof error === "object") {
    const errorLike = error as ErrorLike;
    return {
      name: normalizeErrorText(errorLike.name, "Error"),
      message: normalizeErrorText(errorLike.message, "Unknown error"),
      stack: typeof errorLike.stack === "string" ? errorLike.stack : null,
    };
  }

  return {
    name: "Error",
    message: normalizeErrorText(error, "Unknown error"),
    stack: null,
  };
};

export async function recordAppError(input: AppErrorLogInput) {
  const buildInfo = getAppBuildInfo();
  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt
      : input.occurredAt
        ? new Date(input.occurredAt)
        : new Date();

  const appErrorLog = (prisma as unknown as { appErrorLog?: AppErrorLogDelegate }).appErrorLog;

  if (!appErrorLog) {
    return null;
  }

  return appErrorLog.create({
    data: {
      message: input.message,
      name: input.name ?? null,
      stack: input.stack ?? null,
      source: input.source,
      route: input.route ?? null,
      url: input.url ?? null,
      method: input.method ?? null,
      statusCode: input.statusCode ?? null,
      buildId: input.buildId ?? buildInfo.buildId,
      deploymentId: input.deploymentId ?? buildInfo.deploymentId,
      environment: input.environment ?? buildInfo.environment,
      userAgent: input.userAgent ?? null,
      clerkUserId: input.clerkUserId ?? null,
      userId: input.userId ?? null,
      workspaceId: input.workspaceId ?? null,
      metadata: input.metadata ?? undefined,
      occurredAt,
    },
  });
}

export function normalizeCapturedError(error: unknown) {
  return getErrorDetails(error);
}
