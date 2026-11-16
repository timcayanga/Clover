import { cookies, headers } from "next/headers";
import { matchesNewSignup, parseSignupAttribution, SIGNUP_ATTRIBUTION_COOKIE, signupProperties } from "../../shared/web-signup-attribution";
import { ensureSignupTrial } from "./signup-trial";
import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncClerkUser, type SyncedClerkUser } from "@/lib/clerk";
import { capturePostHogServerEvent } from "@/lib/analytics-server";
import { refreshProAccess } from "@/lib/pro-access";
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
  // Explicit administrator plan locks also apply in local development.
  const applyLocalProOverride = isLocalEnvironment && !existing?.planTierLocked;
  const syncedEmail = clerkUser.authoritative ? clerkUser.email : existing?.email ?? clerkUser.email;
  const syncedFirstName = clerkUser.authoritative ? clerkUser.firstName : existing?.firstName ?? clerkUser.firstName;
  const syncedLastName = clerkUser.authoritative ? clerkUser.lastName : existing?.lastName ?? clerkUser.lastName;
  const syncedVerified = clerkUser.authoritative ? clerkUser.verified : existing?.verified ?? clerkUser.verified;

  try {
    const resolvedEnvironment = resolvePersistedUserEnvironment(
      currentEnvironment,
      existing?.environment
    );
    const { user, created } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clerk-identity:${clerkUserId}`}))`;
      if (await tx.clerkIdentityDeletion.findUnique({ where: { clerkUserId } })) throw new Error("UNAUTHORIZED");
      const freshExisting = await tx.user.findUnique({ where: { clerkUserId } });
      const result = freshExisting
      ? freshExisting.email !== syncedEmail ||
          freshExisting.firstName !== syncedFirstName ||
          freshExisting.lastName !== syncedLastName ||
          freshExisting.verified !== syncedVerified ||
          freshExisting.environment !== resolvedEnvironment ||
          (applyLocalProOverride && freshExisting.planTier !== "pro")
        ? await tx.user.update({
            where: { id: freshExisting.id },
            data: {
              email: syncedEmail,
              firstName: syncedFirstName,
              lastName: syncedLastName,
              verified: syncedVerified,
              environment: resolvedEnvironment,
              ...(applyLocalProOverride ? { planTier: "pro" } : {}),
            },
          })
        : freshExisting
      : await tx.user.create({
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

      if (!result.signupTrialEvaluatedAt) await ensureSignupTrial(tx, result.id, clerkUser.accountCreatedAt);
      return { user: result, created: !freshExisting };
    });

    try {
      const platform = (await headers()).get("x-clover-platform");
      const raw = (await cookies()).get(SIGNUP_ATTRIBUTION_COOKIE)?.value;
      const attribution = parseSignupAttribution(raw?.startsWith("%") ? decodeURIComponent(raw) : raw);
      if (platform !== "ios" && platform !== "android" && attribution && matchesNewSignup(attribution, clerkUser.accountCreatedAt)) {
        const properties = { ...signupProperties(attribution), email_verified: syncedVerified };
        // Delivery runs after the response and can finish out of order.
        const recordedAt = Math.max(user.createdAt.getTime(), attribution.startedAt);
        if (syncedVerified) void capturePostHogServerEvent("web_signup_verified", clerkUser.clerkUserId, properties, new Date(recordedAt));
        void capturePostHogServerEvent("web_signup_account_created", clerkUser.clerkUserId, properties, new Date(recordedAt + 1));
      }
    } catch { /* Browser attribution is optional and must not block signup. */ }
    if (created) {
      void capturePostHogServerEvent("signup_completed", clerkUser.clerkUserId, {
        email_verified: syncedVerified,
      });
      void capturePostHogServerEvent("first_login", clerkUser.clerkUserId, {
        email_verified: syncedVerified,
      });
    }

    if (!isLocalEnvironment && !user.planTierLocked) {
      user.planTier = await refreshProAccess(user.id);
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
      where: { email_environment: { email: syncedEmail, environment: resolvePersistedUserEnvironment(currentEnvironment, existing?.environment) } },
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
