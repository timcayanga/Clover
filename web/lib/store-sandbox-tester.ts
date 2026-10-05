import { clerkClient } from "@clerk/nextjs/server";

/** Explicit QA emails survive account recreation, but only after Clerk verifies
 * the new identity's primary email. This permits sandbox verification, never
 * grants a plan or transfers ownership of a purchase. */
export async function withStoreSandboxTester<T extends { sandbox: boolean; sandboxAppUserIds: string[] }>(config: T, appUserId: string): Promise<T> {
  if (config.sandbox || config.sandboxAppUserIds.includes(appUserId)) return config;
  const allowed = (process.env.REVENUECAT_SANDBOX_TESTER_EMAILS ?? "").split(/[\s,]+/).map(email => email.trim().toLowerCase()).filter(email => /^[^\s@*]+@[^\s@*]+\.[^\s@*]+$/.test(email));
  if (!allowed.length) return config;
  const user = await (await clerkClient()).users.getUser(appUserId);
  const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  if (user.id !== appUserId || primary?.verification?.status !== "verified" || !allowed.includes(primary.emailAddress.toLowerCase())) return config;
  return { ...config, sandboxAppUserIds: [...config.sandboxAppUserIds, appUserId] };
}
