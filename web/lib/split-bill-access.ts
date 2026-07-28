import { isLocalDevHost, requireAuth } from "@/lib/auth";
import type { PageSessionContext } from "@/lib/page-auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import type { User } from "@prisma/client";

export const getSplitBillCurrentUser = async (pageSession?: PageSessionContext): Promise<User> => {
  if (await isLocalDevHost()) {
    return getOrCreateCurrentUser("local-admin");
  }

  const { userId } = pageSession ?? (await requireAuth());
  return getOrCreateCurrentUser(userId);
};
