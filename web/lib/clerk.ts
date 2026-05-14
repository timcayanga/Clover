import { clerkClient } from "@clerk/nextjs/server";

export type SyncedClerkUser = {
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  verified: boolean;
};

const stagingGuestUserId = "staging-guest";
const syntheticUserIds = new Set([stagingGuestUserId, "local-admin", "seed-demo-user"]);

export const syncClerkUser = async (clerkUserId: string): Promise<SyncedClerkUser> => {
  const fallback: SyncedClerkUser = {
    clerkUserId,
    email: `${clerkUserId}@placeholder.local`,
    firstName: null as string | null,
    lastName: null as string | null,
    imageUrl: null,
    verified: false,
  };

  if (syntheticUserIds.has(clerkUserId)) {
    return fallback;
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return fallback;
  }

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? fallback.email;

    return {
      clerkUserId,
      email,
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
      imageUrl: clerkUser.imageUrl ?? null,
      verified: clerkUser.emailAddresses.some((entry) => entry.verification?.status === "verified"),
    };
  } catch (error) {
    const errorStatus = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;

    if (errorStatus === 404) {
      throw error;
    }

    console.warn("Falling back to placeholder Clerk user data.", {
      clerkUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
};
