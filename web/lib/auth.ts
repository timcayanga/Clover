import { auth } from "@clerk/nextjs/server";

export const requireAuth = async () => {
  const session = await auth();
  if (!session.userId) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
};
