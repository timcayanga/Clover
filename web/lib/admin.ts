import { prisma } from "@/lib/prisma";
import { canAdmin, type AdminPermission, type AdminRole } from "@/lib/admin-permissions";
import { auth } from "@clerk/nextjs/server";
import { isLocalDevHost } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { isConfiguredAdminEmail } from "@/lib/admin-access";

const normalizeList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const getAdminUserIds = () => new Set(normalizeList(getEnv().ADMIN_USER_IDS));

// Admin is Clover's production control plane, even when opened from staging or local development.
export const getAdminDataEnvironment = () => "production" as const;

export const isAdminUserId = (userId: string | null | undefined) => {
  if (!userId) {
    return false;
  }

  return getAdminUserIds().has(userId);
};

export const requireAdminAuth = async (permission: AdminPermission = "read") => {
  if (process.env.NODE_ENV !== "production" || (await isLocalDevHost())) {
    return { userId: "local-admin", role: "owner" as AdminRole };
  }

  const session = await auth().catch(() => null);

  if (!session?.userId) {
    throw new Error("UNAUTHORIZED");
  }

  // Explicit assignments override bootstrap allowlists, including revocation.
  const member = await prisma.adminMember.findUnique({ where: { clerkUserId: session.userId } });
  const role = member
    ? (member.active ? member.role : null)
    : (isAdminUserId(session.userId) || await isConfiguredAdminEmail(session.userId)) ? "owner" : null;
  if (!role || !canAdmin(role, permission)) throw new Error("FORBIDDEN");
  return { ...session, role: role as AdminRole };
};
