import { clerkClient } from "@clerk/nextjs/server";

export const syncClerkUser = async (clerkUserId: string) => {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@placeholder.local`;

  return {
    clerkUserId,
    email,
    verified: clerkUser.emailAddresses.some((entry) => entry.verification?.status === "verified"),
  };
};
