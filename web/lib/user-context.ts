import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncClerkUser } from "@/lib/clerk";

export const getOrCreateCurrentUser = async (clerkUserId: string): Promise<User> => {
  const clerkUser = await syncClerkUser(clerkUserId);

  return prisma.user.upsert({
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
};

export const hasCompletedOnboarding = (user: Pick<User, "onboardingCompletedAt">) =>
  user.onboardingCompletedAt !== null;
