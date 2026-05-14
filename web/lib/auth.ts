import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";

const stagingHosts = new Set(["staging.clover.ph", "clover-stage.vercel.app"]);
const localDevHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const stagingGuestUserId = "staging-guest";

const getHostname = async () => {
  try {
    const headerList = await headers();
    const rawHost = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
    return rawHost.split(",")[0].split(":")[0].toLowerCase();
  } catch {
    return "";
  }
};

export const isStagingHost = async () => stagingHosts.has(await getHostname());

export const isLocalDevHost = async () => {
  const hostname = await getHostname();
  return localDevHosts.has(hostname);
};

export const getSessionContext = async () => {
  const hostname = await getHostname();
  const localDevHost = localDevHosts.has(hostname);
  let session;

  try {
    session = await auth();
  } catch {
    if (localDevHost) {
      return { userId: stagingGuestUserId, isGuest: true };
    }

    throw new Error("UNAUTHORIZED");
  }

  if (!session.userId) {
    if (localDevHost) {
      return { userId: stagingGuestUserId, isGuest: true };
    }

    throw new Error("UNAUTHORIZED");
  }

  return { userId: session.userId, isGuest: false };
};

export const requireAuth = getSessionContext;
