import "server-only";
import Redis from "ioredis";
import { auth } from "@clerk/nextjs/server";
import { isAdminOnlyUserId, isConfiguredAdminEmail } from "@/lib/admin-access";
import { digest } from "@/lib/unionbank-sandbox";

export const stateCookie = "__Host-clover-ub-state";
export const reportCookie = "__Host-clover-ub-report";
export const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
let redis: Redis | undefined;
export function sandboxStore() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_REQUIRED");
  if (!redis || redis.status === "end") {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000, retryStrategy: () => null });
    redis.on("error", () => {}); // Routes handle failures without logging secrets.
  }
  return redis;
}
export async function sandboxActor() {
  // Require a current Clerk session; staging's shared guest fallback cannot link banks.
  const { userId } = await auth();
  if (!userId || isAdminOnlyUserId(userId) || await isConfiguredAdminEmail(userId)) throw new Error("UNAUTHORIZED");
  return userId;
}
export const stateKey = (state: string) => `clover:unionbank:sandbox:state:${digest(state)}`;
export const reportKey = (id: string) => `clover:unionbank:sandbox:report:${digest(id)}`;
export const binding = (userId: string, browserNonce: string) => digest(JSON.stringify([userId, browserNonce]));
export const consumeStateScript = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('DEL', KEYS[1])
    return 1
  end
  return 0
`;
