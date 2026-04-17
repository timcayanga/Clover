import { prisma } from "@/lib/prisma";

export const assertWorkspaceAccess = async (clerkUserId: string, workspaceId: string) => {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      user: {
        clerkUserId,
      },
    },
  });

  if (!workspace) {
    throw new Error("WORKSPACE_NOT_FOUND");
  }

  return workspace;
};
