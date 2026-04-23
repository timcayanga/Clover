import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncClerkUser } from "@/lib/clerk";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const getOrCreateCurrentUser = async (clerkUserId: string): Promise<User> => {
  const clerkUser = await syncClerkUser(clerkUserId);
  const existing = await prisma.user.findUnique({
    where: { clerkUserId: clerkUser.clerkUserId },
  });

  try {
    const user = await prisma.user.upsert({
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

    if (!existing) {
      void capturePostHogServerEvent("signup_completed", clerkUser.clerkUserId, {
        email_verified: clerkUser.verified,
      });
      void capturePostHogServerEvent("first_login", clerkUser.clerkUserId, {
        email_verified: clerkUser.verified,
      });
    }

    return user;
  } catch (error) {
    const isUniqueConflict =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

    if (!isUniqueConflict) {
      throw error;
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: clerkUser.email },
    });

    if (!existingByEmail) {
      throw error;
    }

    const updated = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        clerkUserId: clerkUser.clerkUserId,
        verified: clerkUser.verified,
      },
    });

    return updated;
  }
};

export const hasCompletedOnboarding = (user: Pick<User, "onboardingCompletedAt">) =>
  user.onboardingCompletedAt !== null;
