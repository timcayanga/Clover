import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncClerkUser, type SyncedClerkUser } from "@/lib/clerk";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { reconcileBillingPlanTier } from "@/lib/paypal-billing";
import { getCurrentUserEnvironment, resolvePersistedUserEnvironment } from "@/lib/user-environment";

export const getOrCreateCurrentUser = async (clerkUserId: string): Promise<User> => {
  const clerkUser: SyncedClerkUser = await syncClerkUser(clerkUserId);
  const currentEnvironment = getCurrentUserEnvironment();
  const isLocalEnvironment = currentEnvironment === "local";
  const existing = await prisma.user.findUnique({
    where: { clerkUserId: clerkUser.clerkUserId },
  });
  const syncedFirstName = clerkUser.firstName ?? existing?.firstName ?? null;
  const syncedLastName = clerkUser.lastName ?? existing?.lastName ?? null;

  try {
    const resolvedEnvironment = resolvePersistedUserEnvironment(
      currentEnvironment,
      existing?.environment
    );
    const user = existing
      ? existing.email !== clerkUser.email ||
          existing.firstName !== syncedFirstName ||
          existing.lastName !== syncedLastName ||
          existing.verified !== clerkUser.verified ||
          existing.environment !== resolvedEnvironment ||
          (isLocalEnvironment && existing.planTier !== "pro")
        ? await prisma.user.update({
            where: { id: existing.id },
            data: {
              email: clerkUser.email,
              firstName: syncedFirstName,
              lastName: syncedLastName,
              verified: clerkUser.verified,
              environment: resolvedEnvironment,
              ...(isLocalEnvironment ? { planTier: "pro" } : {}),
            },
          })
        : existing
      : await prisma.user.create({
          data: {
            clerkUserId: clerkUser.clerkUserId,
            email: clerkUser.email,
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
            verified: clerkUser.verified,
            environment: currentEnvironment,
            planTier: isLocalEnvironment ? "pro" : "free",
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

    if (!isLocalEnvironment && !user.planTierLocked) {
      await reconcileBillingPlanTier(user.id).catch(() => null);
    }

    return user;
  } catch (error) {
    const isUniqueConflict =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

    if (!isUniqueConflict) {
      throw error;
    }

    // A concurrent first request may have created this same Clerk identity.
    const racedUser = await prisma.user.findUnique({
      where: { clerkUserId: clerkUser.clerkUserId },
    });
    if (racedUser) {
      return racedUser;
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: clerkUser.email },
    });

    if (!existingByEmail) {
      throw error;
    }

    console.error("Clerk identity conflicts with an existing email", {
      currentEnvironment,
      existingUserEnvironment: existingByEmail.environment,
      existingUserId: existingByEmail.id,
    });
    void capturePostHogServerEvent("identity_environment_conflict", clerkUser.clerkUserId, {
      environment: currentEnvironment,
      existing_user_environment: existingByEmail.environment,
    });
    throw new Error("IDENTITY_ENVIRONMENT_CONFLICT");
  }
};

export const hasCompletedOnboarding = (user: Pick<User, "onboardingCompletedAt">) =>
  user.onboardingCompletedAt !== null;
