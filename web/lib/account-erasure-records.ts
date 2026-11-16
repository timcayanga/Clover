import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

/** Explicitly remove records that have no user FK or use SET NULL.
 * Never remove another member's financial history or earned referral reward. */
export async function eraseDetachedUserRecords(tx: Prisma.TransactionClient, user: {
  id: string; clerkUserId: string; email: string; verified: boolean; environment: string;
}, workspaceIds: string[]) {
  const ids = [user.id, user.clerkUserId];
  await tx.appErrorLog.deleteMany({ where: { OR: [{ userId: user.id }, { clerkUserId: user.clerkUserId }, { workspaceId: { in: workspaceIds } }] } });
  await tx.adminSupportAction.deleteMany({ where: { OR: [{ targetUserId: user.id }, { targetClerkUserId: user.clerkUserId }] } });
  await tx.adminApproval.deleteMany({ where: { targetUserId: { in: ids } } });
  await tx.notificationEmailDelivery.deleteMany({ where: { environment: user.environment, userId: { in: ids } } });
  // A dispatch cursor is an opaque pagination position, not a user record.
  await tx.notificationDispatchCursor.updateMany({ where: { environment: user.environment, userId: { in: ids } }, data: { userId: "" } });
  await tx.growthAudit.deleteMany({ where: { targetId: { in: ids } } });
  await tx.referralCheckout.deleteMany({ where: { userId: user.id, environment: user.environment } });
  await tx.referralCheckout.updateMany({ where: { referrerId: user.id, environment: user.environment }, data: { referrerId: null, code: null } });
  await tx.referralReward.deleteMany({ where: { referrerId: user.id } });
  const rewards = await tx.referralReward.findMany({ where: { referredId: user.id }, select: { id: true } });
  for (const reward of rewards) {
    // Preserve transaction identifiers needed to reverse another user’s reward on refund.
    const anonymous = `erased:${randomUUID()}`;
    await tx.referralReward.update({ where: { id: reward.id }, data: { referredId: anonymous, reason: null } });
  }
  await tx.growthPayment.deleteMany({ where: { userId: user.id } });
  await tx.brankasStatementNotificationEvent.deleteMany({ where: { brankasStatementSession: { workspaceId: { in: workspaceIds } } } });
  if (user.verified) await tx.contactInquiry.deleteMany({ where: { email: { equals: user.email, mode: "insensitive" }, environment: user.environment } });
  // Shared-workspace audit payloads may contain the departing user's raw input.
  // Keep the underlying shared financial records, but erase personal audit payloads.
  await tx.auditLog.updateMany({ where: { actorUserId: { in: ids }, workspaceId: { notIn: workspaceIds } }, data: { actorUserId: "deleted-user", metadata: Prisma.DbNull } });
}
