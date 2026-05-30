import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { rememberedSessionIdKey } from "@/lib/clerk-session-persistence";

const stagingHosts = new Set(["staging.clover.ph", "clover-stage.vercel.app"]);
const localDevHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const stagingGuestUserId = "staging-guest";

const isKnownStagingHost = (hostname: string) => {
  if (!hostname) {
    return false;
  }

  if (stagingHosts.has(hostname)) {
    return true;
  }

  return hostname.startsWith("clover-stage-") && hostname.endsWith(".vercel.app");
};

const getHostname = async () => {
  try {
    const headerList = await headers();
    const rawHost = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
    return rawHost.split(",")[0].split(":")[0].toLowerCase();
  } catch {
    return "";
  }
};

const getRememberedSessionId = async () => {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(rememberedSessionIdKey)?.value ?? "";
  } catch {
    return "";
  }
};

const resolveStagingUserIdFromRememberedSession = async () => {
  const sessionId = await getRememberedSessionId();

  if (!sessionId) {
    return "";
  }

  try {
    const client = await clerkClient();
    const session = await client.sessions.getSession(sessionId);
    return session.userId ?? "";
  } catch {
    return "";
  }
};

export const isStagingHost = async () => isKnownStagingHost(await getHostname());

export const isLocalDevHost = async () => {
  const hostname = await getHostname();
  return localDevHosts.has(hostname);
};

export const getSessionContext = async () => {
  const hostname = await getHostname();
  const localDevHost = localDevHosts.has(hostname);
  const stagingHost = isKnownStagingHost(hostname);

  if (localDevHost) {
    return { userId: stagingGuestUserId, isGuest: true };
  }

  const session = await auth().catch(() => null);

  if (!session?.userId) {
    if (stagingHost) {
      const rememberedUserId = await resolveStagingUserIdFromRememberedSession();
      if (rememberedUserId) {
        return { userId: rememberedUserId, isGuest: false };
      }

      return { userId: stagingGuestUserId, isGuest: true };
    }
    throw new Error("UNAUTHORIZED");
  }

  return { userId: session.userId, isGuest: false };
};

export const requireAuth = getSessionContext;
