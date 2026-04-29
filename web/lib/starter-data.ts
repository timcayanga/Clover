import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";
import { getOrCreateCurrentUser } from "@/lib/user-context";

type StarterWorkspaceUser = Pick<User, "id" | "clerkUserId" | "email" | "verified" | "dataWipedAt">;

const starterAccountSelect = {
  id: true,
  workspaceId: true,
  name: true,
  institution: true,
  investmentSubtype: true,
  investmentSymbol: true,
  investmentQuantity: true,
  investmentCostBasis: true,
  investmentPrincipal: true,
  investmentStartDate: true,
  investmentMaturityDate: true,
  investmentInterestRate: true,
  investmentMaturityValue: true,
  type: true,
  currency: true,
  source: true,
  balance: true,
  createdAt: true,
  updatedAt: true,
} as const;

const starterCategorySelect = {
  id: true,
  workspaceId: true,
  name: true,
  type: true,
  parentCategoryId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const starterWorkspaceSelect = {
  id: true,
  userId: true,
  name: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  accounts: {
    select: starterAccountSelect,
  },
  categories: {
    select: starterCategorySelect,
  },
} as const;

const ensureStarterCashAccount = async (workspaceId: string) => {
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

  const existingCashAccount = await prisma.account.findFirst({
    where: {
      workspaceId,
      type: "cash",
    },
    select: { id: true },
  });

  if (!existingCashAccount) {
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
    select: starterWorkspaceSelect,
  });

  if (existing) {
    await ensureStarterCashAccount(existing.id);

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
  });

  const createdWorkspace = await prisma.workspace.findUnique({
    where: { id: workspace.id },
    select: starterWorkspaceSelect,
  });

  return createdWorkspace ?? workspace;
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

  await ensureStarterCashAccount(workspaceId);
};
