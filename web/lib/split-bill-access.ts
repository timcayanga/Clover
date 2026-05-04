import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import type { User } from "@prisma/client";

export const getSplitBillCurrentUser = async (): Promise<User> => {
  if (await isLocalDevHost()) {
    return getOrCreateCurrentUser("local-admin");
  }

  const { userId } = await requireAuth();
  return getOrCreateCurrentUser(userId);
};
