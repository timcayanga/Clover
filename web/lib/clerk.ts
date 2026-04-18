import { clerkClient } from "@clerk/nextjs/server";

export const syncClerkUser = async (clerkUserId: string) => {
  const fallback = {
    clerkUserId,
    email: `${clerkUserId}@placeholder.local`,
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
