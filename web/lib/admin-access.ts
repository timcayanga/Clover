import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { clerkClient } from "@clerk/nextjs/server";

const normalizeList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const getAdminEmailSet = () => new Set(["hello@clover.ph", ...normalizeList(getEnv().ADMIN_EMAILS)]);

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
    return user.emailAddresses.some((entry) => entry.verification?.status === "verified" && adminEmails.has(entry.emailAddress.toLowerCase()));
  } catch {
    return false;
  }
};

export async function isAssignedAdmin(userId: string) {
  const member = await prisma.adminMember.findUnique({ where: { clerkUserId: userId }, select: { active: true } });
  return member?.active === true;
}
