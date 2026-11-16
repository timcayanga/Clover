import { z } from "zod";
import { prisma } from "./prisma";
import { getAdminDataEnvironment } from "./admin";
import { getImportQueue } from "./import-queue";
const selection = {
  id: true,
  fileName: true,
  status: true,
  processingPhase: true,
  updatedAt: true,
  confirmedAt: true,
  confirmedTransactionsCount: true,
  rawPurgedAt: true,
  rawExpiresAt: true,
  storageKey: true,
  statementCheckpoint: { select: { id: true } },
  _count: { select: { transactions: true } },
  workspace: { select: { user: { select: { id: true, clerkUserId: true } } } },
} as const;
function problem(file: {
  status: string;
  confirmedAt: Date | null;
  confirmedTransactionsCount: number;
  rawPurgedAt: Date | null;
  rawExpiresAt: Date | null;
  storageKey: string;
  processingPhase: string | null;
  statementCheckpoint: unknown;
  _count: { transactions: number };
}) {
  if (file.status !== "failed") return "Only failed imports can be retried.";
  if (
    file.confirmedAt ||
    file.confirmedTransactionsCount ||
    file._count.transactions ||
    file.statementCheckpoint
  )
    return "Financial records already exist; use the user-guided review flow.";
  if (
    file.rawPurgedAt ||
    (file.rawExpiresAt && file.rawExpiresAt <= new Date()) ||
    !file.storageKey
  )
    return "Original source is unavailable or expired.";
  if (/password|non_financial/.test(file.processingPhase ?? ""))
    return "Requires the user's input or a different financial document.";
  return null;
}
export async function listAdminRetryFiles(ids?: string[]) {
  const files = await prisma.importFile.findMany({
    where: {
      ...(ids ? { id: { in: ids } } : { status: "failed" }),
      workspace: { user: { environment: getAdminDataEnvironment() } },
    },
    select: selection,
    orderBy: { updatedAt: "desc" },
    take: ids ? 25 : 100,
  });
  return files.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    status: file.status,
    version: file.updatedAt.toISOString(),
    problem: problem(file),
  }));
}
export async function previewAdminRetry(actorId: string, raw: unknown) {
  const input = z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(25),
      reason: z.string().trim().min(10).max(1000),
    })
    .strict()
    .parse(raw);
  const ids = [...new Set(input.ids)];
  const found = await listAdminRetryFiles(ids);
  const items = ids.map(
    (id) =>
      found.find((file) => file.id === id) ?? {
        id,
        fileName: "Unavailable",
        status: "missing",
        version: "",
        problem: "Import not found in the Admin environment.",
      },
  );
  const preview = await prisma.adminSupportAction.create({
    data: {
      actorUserId: actorId,
      action: "bulk_retry_preview",
      reason: input.reason,
      metadata: { items },
    },
  });
  return { previewId: preview.id, items };
}
export async function executeAdminRetry(
  actorId: string,
  previewId: string,
  queueFactory = getImportQueue,
) {
  const preview = await prisma.adminSupportAction.findFirst({
    where: {
      id: previewId,
      actorUserId: actorId,
      action: "bulk_retry_preview",
      createdAt: { gt: new Date(Date.now() - 600000) },
    },
  });
  if (!preview)
    throw new Error(
      "Preview expired or already used. Review the selection again.",
    );
  const items = (
    preview.metadata as {
      items: { id: string; version: string; problem: string | null }[];
    }
  ).items;
  const claimed = await prisma.adminSupportAction.updateMany({
    where: { id: preview.id, action: "bulk_retry_preview" },
    data: { action: "bulk_retry_started" },
  });
  if (claimed.count !== 1)
    throw new Error("This preview has already been used.");
  const results: { id: string; status: string; detail: string }[] = [];
  for (const item of items) {
    try {
      if (item.problem) {
        results.push({ id: item.id, status: "skipped", detail: item.problem });
        continue;
      }
      const file = await prisma.importFile.findFirst({
        where: {
          id: item.id,
          workspace: { user: { environment: getAdminDataEnvironment() } },
        },
        select: selection,
      });
      const conflict = file ? problem(file) : "Import no longer exists.";
      if (!file || conflict || file.updatedAt.toISOString() !== item.version) {
        results.push({
          id: item.id,
          status: "skipped",
          detail: conflict ?? "Import changed after preview.",
        });
        continue;
      }
      const queue = queueFactory(getAdminDataEnvironment(), true);
      if ((await queue.getWorkers()).length === 0) {
        results.push({
          id: item.id,
          status: "failed",
          detail:
            "The guarded support retry worker is offline. Start the updated import worker before retrying.",
        });
        continue;
      }
      const jobId = `admin-retry-${file.id}`;
      let blocked = false;
      for (const candidate of [file.id, jobId]) {
        const existing = await (
          candidate === file.id
            ? queueFactory(getAdminDataEnvironment())
            : queue
        ).getJob(candidate);
        if (existing) {
          if (
            [
              "active",
              "delayed",
              "waiting",
              "prioritized",
              "waiting-children",
            ].includes(await existing.getState())
          ) {
            blocked = true;
            break;
          }
          if (candidate === jobId) await existing.remove();
        }
      }
      if (blocked) {
        results.push({
          id: item.id,
          status: "skipped",
          detail: "A processing job already exists.",
        });
        continue;
      }
      await queue.add(
        "process-import",
        {
          importFileId: file.id,
          actorUserId: file.workspace.user.clerkUserId,
          adminRetry: { requestedBy: actorId, version: item.version },
        },
        { jobId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
      );
      results.push({
        id: item.id,
        status: "queued",
        detail:
          "Queued for the production import worker. Eligibility is checked again before processing.",
      });
    } catch {
      results.push({
        id: item.id,
        status: "failed",
        detail:
          "Could not queue this import. Inspect queue status before trying again.",
      });
    }
  }
  await prisma.adminSupportAction.update({
    where: { id: preview.id },
    data: { action: "bulk_retry_completed", metadata: { items, results } },
  });
  return { results };
}
// The worker rechecks immediately before processing, so a delayed job cannot
// blindly retry a file that the user has since reviewed or confirmed.
export async function claimAdminRetry(importFileId: string, version: string) {
  const result = await prisma.importFile.updateMany({
    where: {
      id: importFileId,
      updatedAt: new Date(version),
      status: "failed",
      confirmedAt: null,
      confirmedTransactionsCount: 0,
      rawPurgedAt: null,
      OR: [{ rawExpiresAt: null }, { rawExpiresAt: { gt: new Date() } }],
      transactions: { none: {} },
      statementCheckpoint: { is: null },
      workspace: { user: { environment: "production" } },
    },
    data: {
      status: "processing",
      processingPhase: "admin_retry",
      processingMessage: "Retry requested by Clover support.",
    },
  });
  return result.count === 1;
}
