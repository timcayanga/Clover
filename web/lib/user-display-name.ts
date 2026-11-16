import type { User } from "@prisma/client";

export const getUserDisplayName = (user: Pick<User, "firstName" | "lastName" | "email">) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email.split("@")[0] || "Account";
