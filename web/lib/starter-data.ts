import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";

export const ensureStarterWorkspace = async (userId: string, email: string, verified: boolean) => {
  const user = await prisma.user.upsert({
    where: { clerkUserId: userId },
    update: { email, verified },
    create: { clerkUserId: userId, email, verified },
  });

  const existing = await prisma.workspace.findFirst({
    where: { userId: user.id },
    include: {
      accounts: true,
      categories: true,
    },
  });

  if (existing) {
    return existing;
  }

  const workspace = await prisma.workspace.create({
    data: {
      userId: user.id,
      name: "Personal",
      type: "personal",
      accounts: {
        create: [
          {
            name: "Imported transactions",
            institution: "Source upload",
            type: "bank",
            currency: "PHP",
            source: "upload",
          },
        ],
      },
      categories: {
        create: DEFAULT_CATEGORY_ROWS.map((category) => ({
          name: category.name,
          type: category.type,
        })),
      },
    },
    include: {
      accounts: true,
      categories: true,
    },
  });

  return workspace;
};

export const seedWorkspaceDefaults = async (workspaceId: string) => {
  const existingCategories = await prisma.category.findMany({ where: { workspaceId } });
  if (existingCategories.length === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORY_ROWS.map((category) => ({
        workspaceId,
        name: category.name,
        type: category.type,
      })),
    });
  }

  const existingAccounts = await prisma.account.findMany({ where: { workspaceId } });
  if (existingAccounts.length === 0) {
    await prisma.account.create({
      data: {
        workspaceId,
        name: "Imported transactions",
        institution: "Source upload",
        type: "bank",
        currency: "PHP",
        source: "upload",
      },
    });
  }
};
