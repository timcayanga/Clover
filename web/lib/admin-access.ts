import { clerkClient } from "@clerk/nextjs/server";
import { getEnv } from "@/lib/env";

const normalizeList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const getAdminEmailSet = () => new Set(normalizeList(getEnv().ADMIN_EMAILS));

export const getAdminOnlyUserIds = () => new Set(normalizeList(getEnv().ADMIN_ONLY_USER_IDS));

export const isAdminOnlyUserId = (userId: string | null | undefined) => {
  if (!userId) {
    return false;
  }

  return getAdminOnlyUserIds().has(userId.toLowerCase());
};

export const isConfiguredAdminEmail = async (userId: string) => {
  const adminEmails = getAdminEmailSet();
  if (adminEmails.size === 0) {
    return false;
  }

  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return user.emailAddresses.some((entry) => adminEmails.has(entry.emailAddress.toLowerCase()));
  } catch {
    return false;
  }
};
