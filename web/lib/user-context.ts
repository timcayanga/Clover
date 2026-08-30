import { Prisma, type User } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncClerkUser, type SyncedClerkUser } from "@/lib/clerk";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { reconcileBillingPlanTier } from "@/lib/paypal-billing";
import { getCurrentUserEnvironment, resolvePersistedUserEnvironment } from "@/lib/user-environment";

export const getOrCreateCurrentUser = async (clerkUserId: string): Promise<User> => {
  const [clerkUser, existing]: [SyncedClerkUser, User | null] = await Promise.all([
    syncClerkUser(clerkUserId),
    prisma.user.findUnique({
      where: { clerkUserId },
    }),
  ]);
  const currentEnvironment = getCurrentUserEnvironment();
  const isLocalEnvironment = currentEnvironment === "local";
  const syncedEmail = clerkUser.authoritative ? clerkUser.email : existing?.email ?? clerkUser.email;
  const syncedFirstName = clerkUser.authoritative ? clerkUser.firstName : existing?.firstName ?? clerkUser.firstName;
  const syncedLastName = clerkUser.authoritative ? clerkUser.lastName : existing?.lastName ?? clerkUser.lastName;
  const syncedVerified = clerkUser.authoritative ? clerkUser.verified : existing?.verified ?? clerkUser.verified;

  try {
    const resolvedEnvironment = resolvePersistedUserEnvironment(
      currentEnvironment,
      existing?.environment
    );
    const user = existing
      ? existing.email !== syncedEmail ||
          existing.firstName !== syncedFirstName ||
          existing.lastName !== syncedLastName ||
          existing.verified !== syncedVerified ||
          existing.environment !== resolvedEnvironment ||
          (isLocalEnvironment && existing.planTier !== "pro")
        ? await prisma.user.update({
            where: { id: existing.id },
            data: {
              email: syncedEmail,
              firstName: syncedFirstName,
              lastName: syncedLastName,
              verified: syncedVerified,
              environment: resolvedEnvironment,
              ...(isLocalEnvironment ? { planTier: "pro" } : {}),
            },
          })
        : existing
      : await prisma.user.create({
          data: {
            clerkUserId: clerkUser.clerkUserId,
            email: syncedEmail,
            firstName: syncedFirstName,
            lastName: syncedLastName,
            verified: syncedVerified,
            environment: currentEnvironment,
            planTier: isLocalEnvironment ? "pro" : "free",
          },
        });

    if (!existing) {
      void capturePostHogServerEvent("signup_completed", clerkUser.clerkUserId, {
        email_verified: syncedVerified,
      });
      void capturePostHogServerEvent("first_login", clerkUser.clerkUserId, {
        email_verified: syncedVerified,
      });
    }

    if (!isLocalEnvironment && !user.planTierLocked) {
      after(async () => {
        await reconcileBillingPlanTier(user.id).catch(() => null);
      });
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
      where: { email: syncedEmail },
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
