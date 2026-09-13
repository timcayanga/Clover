import { deleteImportObject } from "@/lib/s3-delete";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { deleteWorkspaceTransactions } from "@/lib/account-deletion";
import {
  BillingProvider,
  BillingSubscriptionStatus,
  type Prisma,
} from "@prisma/client";
import { cancelPayPalSubscription } from "@/lib/paypal-billing";
import { cancelPaddleSubscription } from "@/lib/paddle-billing";

export const shouldCancelBillingSubscription = (
  subscription:
    | {
        provider: BillingProvider;
        providerSubscriptionId: string | null;
        status: BillingSubscriptionStatus;
      }
    | null
    | undefined,
) =>
  Boolean(
    subscription?.providerSubscriptionId &&
    subscription.status !== BillingSubscriptionStatus.cancelled &&
    subscription.status !== BillingSubscriptionStatus.expired,
  );

export const wipeLocalUserData = async (
  clerkUserId: string,
  options?: {
    reseedStarterWorkspace?: boolean;
  },
) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      verified: true,
      dataWipedAt: true,
    },
  });

  if (!user) {
    return false;
  }

  await prisma.$transaction(async (tx: any) => {
    const workspaces = await tx.workspace.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const workspaceIds = workspaces.map(
      (workspace: { id: string }) => workspace.id,
    );

    if (workspaceIds.length > 0) {
      await deleteWorkspaceTransactions(tx, {
        workspaceId: { in: workspaceIds },
      });
    }

    await tx.workspace.deleteMany({
      where: { userId: user.id },
    });

    await tx.splitBill.deleteMany({
      where: { userId: user.id },
    });

    await tx.splitBillGroup.deleteMany({
      where: { userId: user.id },
    });

    await tx.splitBillPerson.deleteMany({
      where: { userId: user.id },
    });

    await tx.goalSetting.deleteMany({
      where: { userId: user.id },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        dataWipedAt:
          options?.reseedStarterWorkspace !== false ? null : new Date(),
      },
    });
  });

  if (options?.reseedStarterWorkspace !== false) {
    await ensureStarterWorkspace(user);
  }

  return true;
};

export const assertUserErasureScope = async (
  clerkUserId: string,
  db: Pick<Prisma.TransactionClient, "user" | "circle"> = prisma,
) => {
  const user = await db.user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });
  if (!user) return;
  const sharedCircle = await db.circle.findFirst({
    where: {
      ownerUserId: user.id,
      OR: [
        { memberships: { some: { userId: { not: user.id } } } },
        { contributions: { some: { contributedByUserId: { not: user.id } } } },
        { sharedTransactions: { some: { sharedByUserId: { not: user.id } } } },
        { investmentShares: { some: { sharedByUserId: { not: user.id } } } },
      ],
    },
    select: { id: true },
  });
  if (sharedCircle)
    throw new Error(
      "Transfer ownership of shared Circles before erasing this user; other members' financial records must be preserved.",
    );
};

export const deleteLocalUserAccount = async (clerkUserId: string) => {
  await assertUserErasureScope(clerkUserId);
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: {
      id: true,
      billingSubscription: {
        select: { provider: true, providerSubscriptionId: true, status: true },
      },
    },
  });

  if (!user) {
    return false;
  }

  const subscription = user.billingSubscription;
  if (shouldCancelBillingSubscription(subscription)) {
    if (subscription!.provider === BillingProvider.paddle) {
      await cancelPaddleSubscription(subscription!.providerSubscriptionId!);
    } else {
      await cancelPayPalSubscription({
        subscriptionId: subscription!.providerSubscriptionId!,
        reason: "Clover account deleted by the subscriber.",
      });
    }
  }

  if (shouldCancelBillingSubscription(subscription)) {
    await prisma.billingSubscription.updateMany({
      where: { userId: user.id },
      data: { status: BillingSubscriptionStatus.cancelled },
    });
  }

  // Do not leave raw statements or restorable financial snapshots after erasure.
  const files = await prisma.importFile.findMany({
    where: { workspace: { userId: user.id }, storageKey: { not: "" } },
    select: { id: true, storageKey: true },
    orderBy: { id: "asc" },
  });
  for (const file of files) {
    await deleteImportObject(file.storageKey);
    // Persist progress so a function timeout on a large account resumes with remaining files.
    await prisma.importFile.updateMany({ where: { id: file.id, storageKey: file.storageKey }, data: { storageKey: "" } });
  }
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Circle" WHERE "ownerUserId" = ${user.id} FOR UPDATE`;
    await assertUserErasureScope(clerkUserId, tx);
    await tx.adminDataSnapshot.deleteMany({
      where: { targetClerkUserId: clerkUserId },
    });
    await tx.billingEvent.deleteMany({ where: { userId: user.id } });
    await tx.circleContribution.deleteMany({
      where: {
        OR: [
          { contributedByUserId: user.id },
          { sourceTransaction: { workspace: { userId: user.id } } },
        ],
      },
    });
    await tx.circleActivity.deleteMany({ where: { actorUserId: user.id } });
    await tx.circleMembership.deleteMany({ where: { userId: user.id } });
    await tx.user.deleteMany({ where: { id: user.id } });
  });

  return true;
};
