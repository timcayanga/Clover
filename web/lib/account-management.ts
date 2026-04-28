import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const wipeLocalUserData = async (clerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!user) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
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
