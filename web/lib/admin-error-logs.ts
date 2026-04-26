import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAppError } from "@/lib/error-logs";

export type AdminErrorLogFilters = {
  query?: string;
  page?: number;
  pageSize?: number;
};

export type AdminErrorLogItem = {
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

export type AdminErrorLogListResponse = {
  logs: AdminErrorLogItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

type AdminErrorLogRecord = Prisma.AppErrorLogGetPayload<{
  select: {
    id: true;
    message: true;
    name: true;
    stack: true;
    source: true;
    route: true;
    url: true;
    method: true;
    statusCode: true;
    buildId: true;
    deploymentId: true;
    environment: true;
    userAgent: true;
    clerkUserId: true;
    userId: true;
    workspaceId: true;
    metadata: true;
    occurredAt: true;
    createdAt: true;
  };
}>;

function mapLog(log: AdminErrorLogRecord): AdminErrorLogItem {
  return {
    id: log.id,
    message: log.message,
    name: log.name,
    stack: log.stack,
    source: log.source,
    route: log.route,
    url: log.url,
    method: log.method,
    statusCode: log.statusCode,
    buildId: log.buildId,
    deploymentId: log.deploymentId,
    environment: log.environment,
    userAgent: log.userAgent,
    clerkUserId: log.clerkUserId,
    userId: log.userId,
    workspaceId: log.workspaceId,
    metadata: log.metadata,
    occurredAt: log.occurredAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
  };
}

export async function getAdminErrorLogs(filters: AdminErrorLogFilters = {}): Promise<AdminErrorLogListResponse> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(filters.page ?? 1, 1);
  const skip = (page - 1) * pageSize;
  const query = filters.query?.trim() ?? "";

  const where: Prisma.AppErrorLogWhereInput = query
    ? {
        OR: [
          { message: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { source: { contains: query, mode: "insensitive" } },
          { route: { contains: query, mode: "insensitive" } },
          { buildId: { contains: query, mode: "insensitive" } },
          { deploymentId: { contains: query, mode: "insensitive" } },
          { environment: { contains: query, mode: "insensitive" } },
          { clerkUserId: { contains: query, mode: "insensitive" } },
          { userId: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const [totalCount, logs] = await Promise.all([
    prisma.appErrorLog.count({ where }),
    prisma.appErrorLog.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return {
    logs: logs.map(mapLog),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
  };
}

export async function captureAppError(input: Parameters<typeof recordAppError>[0]) {
  return recordAppError(input);
}
