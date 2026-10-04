import { timingSafeEqual } from "node:crypto";
import { runAccountErasureTasks } from "@/lib/account-erasure-tasks";
import { deleteClerkIdentity } from "@/lib/clerk-identity-lifecycle";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (!process.env.CRON_SECRET || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const deadline = Date.now() + 240000;
  const pending = await prisma.clerkIdentityDeletion.findMany({ where: { environment: getDeploymentEnvironment(), completedAt: null }, take: 2, orderBy: { updatedAt: "asc" } });
  let resumed = 0;
  for (const item of pending) {
    if (Date.now() > deadline) break;
    try { await deleteClerkIdentity(item.clerkUserId); resumed++; }
    catch { /* Tombstone and data remain for retry; never report complete. */ }
  }
  const providers = await runAccountErasureTasks(3, deadline);
  return Response.json({ resumed, localPending: pending.length - resumed, providers }, { headers: { "Cache-Control": "no-store" } });
}
