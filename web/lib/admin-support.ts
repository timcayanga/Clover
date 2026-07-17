import { prisma } from "@/lib/prisma";
import { getAdminDataEnvironment } from "@/lib/admin";

export type SupportActionInput = {
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  targetClerkUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordAdminSupportAction(input: SupportActionInput) {
  return prisma.adminSupportAction.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetUserId: input.targetUserId ?? null,
      targetClerkUserId: input.targetClerkUserId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function getAdminSupportNotes(targetUserId: string) {
  return prisma.adminSupportNote.findMany({
    where: { targetUserId },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });
}

export async function createAdminDataSnapshot(targetUserId: string, actorUserId: string) {
  const environment = getAdminDataEnvironment();
  const user = await prisma.user.findFirst({
    where: { id: targetUserId, environment },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      firstName: true,
      lastName: true,
      verified: true,
      planTier: true,
      planTierLocked: true,
      financialExperience: true,
      primaryGoal: true,
      goalTargetAmount: true,
      goalTargetSource: true,
      onboardingCompletedAt: true,
      workspaces: {
        include: {
          accounts: true,
          categories: true,
          transactions: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const payload = JSON.parse(JSON.stringify(user));
  const snapshot = await prisma.adminDataSnapshot.create({
    data: {
      targetUserId: user.id,
      targetClerkUserId: user.clerkUserId,
      snapshotType: "pre_wipe_core_financial_data",
      payload,
      createdBy: actorUserId,
    },
    select: { id: true, createdAt: true, snapshotType: true },
  });

  return snapshot;
}

const asDate = (value: unknown) => (typeof value === "string" ? new Date(value) : value instanceof Date ? value : null);

export async function restoreAdminDataSnapshot(snapshotId: string, actorUserId: string) {
  const snapshot = await prisma.adminDataSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new Error("Snapshot not found");
  if (snapshot.restoredAt) throw new Error("Snapshot was already restored");

  const payload = snapshot.payload as {
    id: string;
    workspaces?: Array<{
      id: string;
      name: string;
      type: string;
      accounts?: Array<Record<string, unknown>>;
      categories?: Array<Record<string, unknown>>;
      transactions?: Array<Record<string, unknown>>;
    }>;
  };
  const existingWorkspace = await prisma.workspace.findFirst({ where: { userId: snapshot.targetUserId ?? "" }, select: { id: true } });
  if (existingWorkspace) throw new Error("User already has data. Wipe the current workspace before restoring.");

  await prisma.$transaction(async (tx) => {
    for (const workspace of payload.workspaces ?? []) {
      await tx.workspace.create({
        data: {
          id: workspace.id,
          userId: snapshot.targetUserId ?? payload.id,
          name: workspace.name,
          type: workspace.type as never,
        },
      });

      for (const category of workspace.categories ?? []) {
        await tx.category.create({ data: { ...category, workspaceId: workspace.id } as never });
      }

      for (const account of workspace.accounts ?? []) {
        await tx.account.create({ data: { ...account, workspaceId: workspace.id } as never });
      }

      for (const transaction of workspace.transactions ?? []) {
        await tx.transaction.create({
          data: {
            ...transaction,
            workspaceId: workspace.id,
            // Raw import files are not included in support snapshots, so avoid orphaned FK references.
            importFileId: null,
            date: asDate(transaction.date) ?? new Date(),
            createdAt: asDate(transaction.createdAt) ?? new Date(),
            updatedAt: asDate(transaction.updatedAt) ?? new Date(),
          } as never,
        });
      }
    }

    await tx.adminDataSnapshot.update({ where: { id: snapshot.id }, data: { restoredAt: new Date(), restoredBy: actorUserId } });
    await tx.user.update({ where: { id: snapshot.targetUserId ?? payload.id }, data: { dataWipedAt: null } });
  });

  return { restored: true, snapshotId: snapshot.id };
}
