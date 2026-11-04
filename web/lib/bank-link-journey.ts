import { prisma } from "./prisma";
import { capturePostHogServerEvent } from "./analytics-server";
type Stage = "started" | "authorized" | "selection_required" | "data_available" | "empty_result" | "failed" | "cancelled";
/** Operational milestones, once per connection/stage. No bank names, credentials, balances or transactions are sent to analytics. */
export async function recordBankLinkStage(connectionId: string, stage: Stage, counts: { accountCount?: number; transactionCount?: number } = {}) {
  try {
    const recorded = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "FinverseConnection" WHERE id = ${connectionId} FOR UPDATE`;
      const connection = await tx.finverseConnection.findUnique({ where: { id: connectionId }, select: { userId: true, workspaceId: true, createdAt: true, user: { select: { clerkUserId: true } } } });
      if (!connection) return null;
      const action = `bank_link.${stage}`;
      if (await tx.auditLog.findFirst({ where: { workspaceId: connection.workspaceId, entity: "BankLink", entityId: connectionId, action } })) return null;
      const properties = { stage, connection_id: connectionId, workspace_id: connection.workspaceId, ...counts,
        duration_ms: Math.max(0, Date.now() - connection.createdAt.getTime()), timing_boundary: "connection_created_to_observed_stage" };
      await tx.auditLog.create({ data: { workspaceId: connection.workspaceId, actorUserId: connection.userId, action, entity: "BankLink", entityId: connectionId, metadata: properties } });
      return { distinctId: connection.user.clerkUserId, properties };
    });
    if (recorded) await capturePostHogServerEvent("bank_link_stage", recorded.distinctId, recorded.properties);
  } catch { /* Diagnostics cannot turn a successful link into a retry or expose provider credentials. */ }
}
