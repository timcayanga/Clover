import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";

const stagingHosts = new Set(["staging.clover.ph"]);
const stagingGuestUserId = "staging-guest";

const getHostname = async () => {
  const headerList = await headers();
  const rawHost = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  return rawHost.split(",")[0].split(":")[0].toLowerCase();
};

export const isStagingHost = async () => stagingHosts.has(await getHostname());

export const getSessionContext = async (options?: { preferGuestOnStaging?: boolean }) => {
  const session = await auth();
  const stagingHost = await isStagingHost();

  if (!session.userId) {
    if (stagingHost) {
      return { userId: stagingGuestUserId, isGuest: true };
    }

    throw new Error("UNAUTHORIZED");
  }

  if (stagingHost && options?.preferGuestOnStaging) {
    return { userId: stagingGuestUserId, isGuest: true };
  }

  return { userId: session.userId, isGuest: false };
};

export const requireAuth = getSessionContext;
