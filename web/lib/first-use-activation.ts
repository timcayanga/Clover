import { capturePostHogServerEvent } from "@/lib/analytics-server";
import { prisma } from "@/lib/prisma";
import { activationState, type FirstUseActivation } from "../../shared/first-use-activation";

export const activationTransactionWhere = (workspaceId: string) => ({
  workspaceId, deletedAt: null, isExcluded: false, amount: { not: 0 },
  reviewStatus: { notIn: ["rejected", "duplicate_skipped"] as ("rejected" | "duplicate_skipped")[] },
});

/** Read-only. All entry methods qualify; a failed/empty upload does not. Never infer a balance from one expense. */
export async function getFirstUseActivation(workspaceId: string, actorUserId: string): Promise<FirstUseActivation> {
  const [transaction, acknowledged] = await Promise.all([
    prisma.transaction.findFirst({ where: activationTransactionWhere(workspaceId), orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, merchantClean: true, merchantRaw: true, amount: true, currency: true, date: true, type: true, reviewStatus: true, createdAt: true, category: { select: { name: true } } } }),
    prisma.auditLog.findFirst({ where: { workspaceId, actorUserId, action: "activation.result_acknowledged" }, select: { id: true } }),
  ]);
  const state = activationState(Boolean(transaction), transaction?.createdAt ?? null, Boolean(acknowledged));
  return { state, workspaceId, ...(state === "result" && transaction ? { transaction: {
    id: transaction.id, name: transaction.merchantClean || transaction.merchantRaw,
    amount: transaction.amount.toString(), currency: transaction.currency, date: transaction.date.toISOString(), type: transaction.type,
    category: transaction.category?.name ?? null, needsReview: transaction.reviewStatus === "pending_review" || transaction.reviewStatus === "suggested",
  } } : {}) };
}

/** Audit only; never updates the transaction or entitlements. Scope and current result are revalidated server-side. */
export async function recordActivationResult(user: { id: string; clerkUserId: string }, workspaceId: string, transactionId: string, action: "view" | "displayed" | "acknowledge") {
  const snapshot = await getFirstUseActivation(workspaceId, user.id);
  if (snapshot.state !== "result" || snapshot.transaction?.id !== transactionId) return false;
  const auditAction = action === "displayed" ? "activation.result_displayed"
    : action === "view" ? "activation.result_viewed" : "activation.result_acknowledged";
  const created = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
    const exists = await tx.auditLog.findFirst({ where: { workspaceId, actorUserId: user.id, action: auditAction } });
    if (exists) return false;
    await tx.auditLog.create({ data: { workspaceId, actorUserId: user.id, action: auditAction, entity: "Activation", entityId: transactionId } });
    return true;
  });
  if (created && action === "displayed") {
    const displayedAt = Date.now();
    const [transaction, owner] = await Promise.all([
      prisma.transaction.findUnique({ where: { id: transactionId }, select: { createdAt: true, importFileId: true } }),
      prisma.user.findUnique({ where: { id: user.id }, select: { createdAt: true } }),
    ]);
    const elapsed = transaction && owner ? transaction.createdAt.getTime() - owner.createdAt.getTime() : null;
    const displayElapsed = owner ? Math.max(0, displayedAt - owner.createdAt.getTime()) : null;
    await capturePostHogServerEvent("activation_first_result_rendered", user.clerkUserId, {
      workspace_id: workspaceId, entry_method: transaction?.importFileId ? "import" : "non_file",
      time_to_first_transaction_ms: elapsed !== null && elapsed >= 0 ? elapsed : null,
      first_transaction_within_24h: elapsed !== null && elapsed >= 0 && elapsed <= 86400000,
      time_to_first_result_displayed_ms: displayElapsed,
      first_result_displayed_within_24h: displayElapsed !== null && displayElapsed <= 86400000,
      measurement_version: "first_use_v2", timing_boundary: "account_created_to_client_display_report_received",
    });
  }
  return true;
}
