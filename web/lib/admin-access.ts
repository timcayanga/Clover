import { getEnv } from "@/lib/env";
import { syncClerkUser } from "@/lib/clerk";

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
    const user = await syncClerkUser(userId);
    return user.authoritative && user.emailAddresses.some((email) => adminEmails.has(email.toLowerCase()));
  } catch {
    return false;
  }
};
