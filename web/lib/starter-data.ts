import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";
import { getOrCreateCurrentUser } from "@/lib/user-context";

type StarterWorkspaceUser = Pick<User, "id" | "clerkUserId" | "email" | "verified" | "dataWipedAt">;

const normalizeStarterCashAccount = async (workspaceId: string) => {
  await prisma.account.updateMany({
    where: {
      workspaceId,
      name: "Cash on hand",
      type: "cash",
    },
    data: {
      name: "Cash",
      institution: "Cash",
    },
  });
};

export const ensureStarterWorkspace = async (
  userOrClerkUserId: StarterWorkspaceUser | string,
  email?: string,
  verified?: boolean
) => {
  const user =
    typeof userOrClerkUserId === "string"
      ? await getOrCreateCurrentUser(userOrClerkUserId)
      : userOrClerkUserId;

  const existing = await prisma.workspace.findFirst({
    where: { userId: user.id },
    include: {
      accounts: true,
      categories: true,
    },
  });

  if (existing) {
    await normalizeStarterCashAccount(existing.id);

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
            name: "Cash",
            institution: "Cash",
            type: "cash",
            currency: "PHP",
            source: "manual",
            balance: 0,
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
  const categoryByName = new Map(existingCategories.map((category) => [category.name.trim().toLowerCase(), category]));
  for (const category of DEFAULT_CATEGORY_ROWS) {
    if (!categoryByName.has(category.name.trim().toLowerCase())) {
      await prisma.category.create({
        data: {
          workspaceId,
          name: category.name,
          type: category.type,
        },
      });
    }
  }

  const existingAccounts = await prisma.account.findMany({ where: { workspaceId } });
  if (existingAccounts.length === 0) {
    await prisma.account.createMany({
      data: [
        {
          workspaceId,
          name: "Cash",
          institution: "Cash",
          type: "cash",
          currency: "PHP",
          source: "manual",
          balance: 0,
        },
      ],
    });
  }

  await normalizeStarterCashAccount(workspaceId);
};
