import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";

export const wipeLocalUserData = async (
  clerkUserId: string,
  options?: {
    reseedStarterWorkspace?: boolean;
  }
) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, clerkUserId: true, email: true, verified: true, dataWipedAt: true },
  });

  if (!user) {
    return false;
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.workspace.deleteMany({
      where: { userId: user.id },
    });

    await tx.goalSetting.deleteMany({
      where: { userId: user.id },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        primaryGoal: null,
        goalTargetAmount: null,
        goalTargetSource: null,
        goalPlan: Prisma.DbNull,
        dataWipedAt: new Date(),
      },
    });
  });

  if (options?.reseedStarterWorkspace !== false) {
    await ensureStarterWorkspace(user);
  }

  return true;
};

export const deleteLocalUserAccount = async (clerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) {
    return false;
  }

  await prisma.user.delete({
    where: { id: user.id },
  });

  return true;
};
