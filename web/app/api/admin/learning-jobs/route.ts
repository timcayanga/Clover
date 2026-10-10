import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth, getAdminDataEnvironment } from "@/lib/admin";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { retryLearningJob } from "@/lib/learning-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const scope = () => ({ workspace: { user: { environment: getAdminDataEnvironment() } } });
const listQuery = z.object({ status: z.enum(["all", "queued", "running", "failed", "completed", "cancelled"]).default("all"), cursor: z.string().max(200).optional() });
const retryInput = z.object({ id: z.string().min(1).max(200) }).strict();
const summarySelect = {
  id: true, workspaceId: true, source: true, sourceId: true, version: true, status: true,
  totalItems: true, nextIndex: true, appliedItems: true, skippedItems: true, attempts: true,
  errorCode: true, errorMessage: true, createdAt: true, updatedAt: true, completedAt: true, lockedUntil: true,
  runs: { orderBy: { attempt: "desc" as const }, take: 5, select: { attempt: true, status: true, startIndex: true, endIndex: true, errorCode: true, errorMessage: true, startedAt: true, finishedAt: true } },
} as const;
const errorResponse = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED" || message === "FORBIDDEN") return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden" }, { status: message === "UNAUTHORIZED" ? 401 : 403 });
  if (message === "Untrusted request origin.") return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid learning job request." }, { status: 400 });
  return NextResponse.json({ error: "Learning jobs are unavailable. Check the database connection and release migration." }, { status: 503 });
};

export async function GET(request: Request) {
  try {
    await requireAdminAuth();
    const query = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    const jobs = await prisma.learningJob.findMany({
      where: { ...scope(), ...(query.status !== "all" ? { status: query.status } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), select: summarySelect,
    });
    const counts = await prisma.learningJob.groupBy({ by: ["status"], where: scope(), _count: { _all: true } });
    return NextResponse.json({ jobs: jobs.slice(0, 50), nextCursor: jobs.length > 50 ? jobs[49].id : null, counts: Object.fromEntries(counts.map(row => [row.status, row._count._all])) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth("operate");
    const { id } = retryInput.parse(await request.json());
    const job = await prisma.learningJob.findFirst({ where: { id, ...scope() }, select: { id: true, workspaceId: true, status: true } });
    if (!job) return NextResponse.json({ error: "Learning job not found." }, { status: 404 });
    await prisma.auditLog.create({ data: { workspaceId: job.workspaceId, actorUserId: admin.userId, action: "learning.retry_requested", entity: "LearningJob", entityId: id, metadata: { previousStatus: job.status } } });
    await retryLearningJob(id, job.workspaceId);
    return NextResponse.json({ job: await prisma.learningJob.findFirst({ where: { id, ...scope() }, select: summarySelect }) });
  } catch (error) { return errorResponse(error); }
}
