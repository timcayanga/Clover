import { clerkClient } from "@clerk/nextjs/server";
import { unstable_cache } from "next/cache";

export type SyncedClerkUser = {
  clerkUserId: string;
  email: string;
  emailAddresses: string[];
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  verified: boolean;
  authoritative: boolean;
};

const stagingGuestUserId = "staging-guest";
const syntheticUserIds = new Set([stagingGuestUserId, "local-admin", "seed-demo-user"]);

const loadClerkUser = unstable_cache(
  async (clerkUserId: string): Promise<SyncedClerkUser> => {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@placeholder.local`;

    return {
      clerkUserId,
      email,
      emailAddresses: clerkUser.emailAddresses.map((entry) => entry.emailAddress),
      firstName: clerkUser.firstName ?? null,
      lastName: clerkUser.lastName ?? null,
      imageUrl: clerkUser.imageUrl ?? null,
      verified: clerkUser.emailAddresses.some((entry) => entry.verification?.status === "verified"),
      authoritative: true,
    };
  },
  ["clover-clerk-user-v1"],
  { revalidate: 300 },
);

export const syncClerkUser = async (clerkUserId: string): Promise<SyncedClerkUser> => {
  const fallback: SyncedClerkUser = {
    clerkUserId,
    email: `${clerkUserId}@placeholder.local`,
    emailAddresses: [`${clerkUserId}@placeholder.local`],
    firstName: null as string | null,
    lastName: null as string | null,
    imageUrl: null,
    verified: false,
    authoritative: false,
  };

  if (syntheticUserIds.has(clerkUserId)) {
    return fallback;
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return fallback;
  }

  try {
    return await loadClerkUser(clerkUserId);
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
