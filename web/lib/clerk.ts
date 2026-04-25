import { clerkClient } from "@clerk/nextjs/server";

type SyncedClerkUser = {
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  verified: boolean;
};

export const syncClerkUser = async (clerkUserId: string): Promise<SyncedClerkUser> => {
  const fallback: SyncedClerkUser = {
    clerkUserId,
    email: `${clerkUserId}@placeholder.local`,
    firstName: null as string | null,
    lastName: null as string | null,
    verified: false,
  };

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
      verified: clerkUser.emailAddresses.some((entry) => entry.verification?.status === "verified"),
    };
  } catch (error) {
    console.warn("Falling back to placeholder Clerk user data.", {
      clerkUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
};
