import { prisma } from "./prisma";
import { getDeploymentEnvironment } from "./deployment-environment";
import { erasePostHogData, eraseRevenueCatCustomer } from "./account-erasure-providers";
import type { Prisma } from "@prisma/client";

type Payload = { distinctIds?: string[]; personIds?: string[] };
/** Called inside the transaction deleting User, so provider intent cannot be lost. */
export async function queueAccountErasure(tx: Prisma.TransactionClient, user: { id: string; clerkUserId: string; environment: string }) {
  const tasks = [
    ...(process.env.NEXT_PUBLIC_POSTHOG_KEY ? [{ provider: "posthog", payload: { distinctIds: [`${user.environment}:${user.clerkUserId}`, `${user.environment}:${user.id}`] } }] : []),
    ...(process.env.REVENUECAT_SECRET_API_KEY ? [{ provider: "revenuecat", payload: {} }] : []),
  ];
  for (const task of tasks) await tx.accountErasureTask.upsert({
    where: { clerkUserId_provider: { clerkUserId: user.clerkUserId, provider: task.provider } },
    create: { ...task, clerkUserId: user.clerkUserId, environment: user.environment,
      // Let in-flight SDK logout/events settle; local erasure is immediate.
      retryAt: new Date(Date.now() + 60 * 60 * 1000) }, update: {},
  });
}

export async function runAccountErasureTasks(limit = 5, deadline = Date.now() + 120000) {
  const environment = getDeploymentEnvironment();
  const tasks = await prisma.accountErasureTask.findMany({ where: { environment, status: "pending", retryAt: { lte: new Date() } }, orderBy: { retryAt: "asc" }, take: limit });
  let completed = 0, pending = 0;
  for (const task of tasks) {
    if (Date.now() > deadline) break;
    const deleted = await prisma.clerkIdentityDeletion.findUnique({ where: { clerkUserId: task.clerkUserId } });
    if (!deleted?.completedAt || deleted.environment !== environment) { pending++; continue; }
    const claimed = await prisma.accountErasureTask.updateMany({ where: { id: task.id, status: "pending", retryAt: task.retryAt }, data: { retryAt: new Date(Date.now() + 15 * 60 * 1000), attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      const liveIdentity = (db: Pick<Prisma.TransactionClient, "user" | "clerkIdentityDeletion">) => async (alias: string) => {
        if (/^(production|staging):/.test(alias) && !alias.startsWith(`${environment}:`)) return true;
        const id = alias.replace(/^(production|staging):/, "");
        if (await db.user.findFirst({ where: { OR: [{ id }, { clerkUserId: id }] }, select: { id: true } })) return true;
        // Unknown Clerk identities are protected too, including login-only users.
        if (id.startsWith("user_")) return !(await db.clerkIdentityDeletion.findUnique({ where: { clerkUserId: id } }))?.completedAt;
        return false;
      };
      const isLiveIdentity = liveIdentity(prisma);
      let done = false;
      if (task.provider === "posthog") {
        const key = process.env.POSTHOG_ERASURE_API_KEY || process.env.POSTHOG_PERSONAL_API_KEY;
        const projectId = process.env.POSTHOG_PROJECT_ID;
        if (!key || !projectId) throw new Error("PostHog erasure API key/project is missing.");
        const payload = task.payload as Payload;
        const result = await erasePostHogData({
          origin: process.env.POSTHOG_APP_URL || "https://us.posthog.com", projectId, key,
          distinctIds: payload.distinctIds ?? [], personIds: payload.personIds ?? [], isLiveIdentity,
          checkpoint: async personIds => { await prisma.accountErasureTask.update({ where: { id: task.id }, data: { payload: { ...payload, personIds } } }); },
        });
        done = !result.pending;
      } else if (task.provider === "revenuecat") {
        const key = process.env.REVENUECAT_SECRET_API_KEY;
        const readKey = process.env.REVENUECAT_RECOVERY_API_KEY;
        if (!key || !readKey) throw new Error("RevenueCat erasure credentials are missing.");
        // The same source lock serializes recovery transfers against customer erasure.
        done = await prisma.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-recovery:${task.clerkUserId}`}))`;
          return eraseRevenueCatCustomer({ appUserId: task.clerkUserId, key, readKey, projectId: "c4469f47", isLiveIdentity: liveIdentity(tx) });
        }, { timeout: 60000 });
      } else throw new Error("Unknown account erasure provider.");
      await prisma.accountErasureTask.update({ where: { id: task.id }, data: {
        status: done ? "completed" : "pending", ...(done ? { payload: {} } : {}), lastError: null,
        retryAt: new Date(Date.now() + 60 * 60 * 1000),
      } });
      if (done) completed++; else pending++;
    } catch (error) {
      // Do not persist response bodies, credentials or a user's source data.
      const message = error instanceof Error && /^(PostHog|RevenueCat|Unknown account)/.test(error.message) ? error.message.slice(0,200) : "Provider cleanup could not complete. Retry scheduled.";
      await prisma.accountErasureTask.update({ where: { id: task.id }, data: { lastError: message, retryAt: new Date(Date.now() + Math.min(24, 2 ** Math.min(task.attempts, 5)) * 3600000) } });
      pending++;
    }
  }
  return { checked: tasks.length, completed, pending };
}
