import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncClerkUser } from "@/lib/clerk";

export const getOrCreateCurrentUser = async (clerkUserId: string): Promise<User> => {
  const clerkUser = await syncClerkUser(clerkUserId);

  try {
    return await prisma.user.upsert({
      where: { clerkUserId: clerkUser.clerkUserId },
      update: {
        email: clerkUser.email,
        verified: clerkUser.verified,
      },
      create: {
        clerkUserId: clerkUser.clerkUserId,
        email: clerkUser.email,
        verified: clerkUser.verified,
        planTier: "free",
      },
    });
  } catch (error) {
    const isUniqueConflict = typeof error === "object" && error !== null && "code" in error && String((error as { code?: unknown }).code ?? "") === "P2002";

    if (!isUniqueConflict) {
      throw error;
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: clerkUser.email },
    });

    if (!existingByEmail) {
      throw error;
    }

    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        clerkUserId: clerkUser.clerkUserId,
        verified: clerkUser.verified,
      },
    });
  }
};

export const hasCompletedOnboarding = (user: Pick<User, "onboardingCompletedAt">) =>
  user.onboardingCompletedAt !== null;
