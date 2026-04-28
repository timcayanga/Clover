import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { isLocalDevHost, isStagingHost } from "@/lib/auth";
import { getEnv } from "@/lib/env";

const normalizeList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const getAdminUserIds = () => new Set(normalizeList(getEnv().ADMIN_USER_IDS));

export const isAdminUserId = (userId: string | null | undefined) => {
  if (!userId) {
    return false;
  }

  return getAdminUserIds().has(userId);
};

export const hasStagingAccess = async () => {
  if (!(await isStagingHost())) {
    return false;
  }

  const cookieStore = await cookies();
  return cookieStore.get("clover_staging_access")?.value === "1";
};

export const requireAdminAuth = async () => {
  if (process.env.NODE_ENV !== "production" || (await isLocalDevHost())) {
    return { userId: "local-admin" };
  }

  let session;

  try {
    session = await auth();
  } catch {
    return { userId: "local-admin" };
  }

  if (!session.userId) {
    throw new Error("UNAUTHORIZED");
  }

  if (!isAdminUserId(session.userId) && !(await hasStagingAccess())) {
    throw new Error("FORBIDDEN");
  }

  return session;
};
