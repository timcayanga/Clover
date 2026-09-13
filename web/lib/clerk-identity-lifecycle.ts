import { revalidateTag } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getAdminDataEnvironment } from "@/lib/admin";
import {
  assertUserErasureScope,
  deleteLocalUserAccount,
} from "@/lib/account-management";

const invalidateIdentityCache = () => {
  // Standalone reconciliation has no Next cache context. Authentication also checks tombstones.
  try {
    revalidateTag("clover-clerk-user");
  } catch {
    /* No request cache to invalidate. */
  }
};

const isMissing = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  error.status === 404;
export async function assertClerkIdentityEnvironment() {
  const environment = getAdminDataEnvironment();
  const prefix = environment === "staging" ? "sk_test_" : "sk_live_";
  if (!process.env.CLERK_SECRET_KEY?.startsWith(prefix))
    throw new Error(
      `Clerk ${environment === "staging" ? "Development" : "Production"} credentials are required for this Admin environment.`,
    );
  const markers = await prisma.$queryRaw<
    { environment: string }[]
  >`SELECT environment FROM "CloverDeploymentEnvironment" WHERE id = 'primary'`;
  if (markers[0]?.environment !== environment)
    throw new Error("Clerk synchronization database environment mismatch.");
  return environment;
}

// Read fresh provider state under the same lock used by login and deletion.
// Delayed updates therefore cannot overwrite newer names/emails or resurrect identities.
export async function syncClerkIdentity(clerkUserId: string) {
  const environment = await assertClerkIdentityEnvironment();
  const user = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clerk-identity:${clerkUserId}`}))`;
      if (await tx.clerkIdentityDeletion.findUnique({ where: { clerkUserId } }))
        return null;
      const provider = await clerkClient();
      const source = await provider.users.getUser(clerkUserId);
      const primary =
        source.emailAddresses.find(
          (email) => email.id === source.primaryEmailAddressId,
        ) ?? source.emailAddresses[0];
      // Keep phone-only users visible without merging identities by email.
      const email =
        primary?.emailAddress ?? `${clerkUserId}@clerk-user.invalid`;
      const existing = await tx.user.findUnique({ where: { clerkUserId } });
      if (existing && existing.environment !== environment)
        throw new Error(
          "Identity belongs to another Clover environment; no data was reassigned.",
        );
      const data = {
        email,
        firstName: source.firstName,
        lastName: source.lastName,
        verified: primary?.verification?.status === "verified",
      };
      return tx.user.upsert({
        where: { clerkUserId },
        update: data,
        create: { ...data, clerkUserId, environment, planTier: "free" },
      });
    },
    { timeout: 20000 },
  );
  invalidateIdentityCache();
  return user;
}

export async function deleteClerkIdentity(
  clerkUserId: string,
  providerAlreadyDeleted = false,
) {
  const environment = await assertClerkIdentityEnvironment();
  const client = await clerkClient();
  if (!providerAlreadyDeleted) await assertUserErasureScope(clerkUserId);
  if (providerAlreadyDeleted) {
    // A signature alone must never allow an endpoint for the wrong instance to erase data.
    try {
      await client.users.getUser(clerkUserId);
      throw new Error(
        "Clerk user still exists; deletion event was not applied.",
      );
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clerk-identity:${clerkUserId}`}))`;
    const user = await tx.user.findUnique({
      where: { clerkUserId },
      select: { environment: true },
    });
    const tombstone = await tx.clerkIdentityDeletion.findUnique({
      where: { clerkUserId },
    });
    if (
      (user && user.environment !== environment) ||
      (tombstone && tombstone.environment !== environment)
    )
      throw new Error(
        "Identity belongs to another Clover environment; nothing was deleted.",
      );
    await tx.clerkIdentityDeletion.upsert({
      where: { clerkUserId },
      update: {},
      create: { clerkUserId, environment },
    });
  });
  invalidateIdentityCache();
  // Keep the tombstone if any stage fails. A webhook retry or Admin sync resumes cleanup.
  if (!providerAlreadyDeleted) {
    try {
      await client.users.deleteUser(clerkUserId);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  await deleteLocalUserAccount(clerkUserId);
  await prisma.adminMember.updateMany({
    where: { clerkUserId },
    data: { active: false },
  });
  await prisma.clerkIdentityDeletion.update({
    where: { clerkUserId },
    data: { completedAt: new Date() },
  });
}

export async function reconcileClerkUsers(offset = 0) {
  const environment = await assertClerkIdentityEnvironment();
  const client = await clerkClient();
  const page = await client.users.getUserList({
    limit: 25,
    offset,
    orderBy: "+created_at",
  });
  let synced = 0;
  const errors: { clerkUserId: string; error: string }[] = [];
  for (const source of page.data) {
    try {
      if (await syncClerkIdentity(source.id)) synced++;
    } catch {
      errors.push({
        clerkUserId: source.id,
        error:
          "Unable to sync identity. Check duplicate email or environment conflicts.",
      });
    }
  }
  const pending = await prisma.clerkIdentityDeletion.findMany({
    where: { environment, completedAt: null },
    take: 10,
  });
  for (const item of pending) {
    try {
      await deleteClerkIdentity(item.clerkUserId);
    } catch {
      errors.push({
        clerkUserId: item.clerkUserId,
        error:
          "Permanent deletion is still pending. Retry sync after resolving provider/storage errors or shared Circle ownership.",
      });
    }
  }
  return {
    environment,
    synced,
    errors,
    nextOffset:
      offset + page.data.length < page.totalCount
        ? offset + page.data.length
        : null,
  };
}
