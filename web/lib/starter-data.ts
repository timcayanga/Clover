import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { isCryptoAssetCurrencyCode } from "@/lib/financial-identity-detection";
import { normalizeRegionalPreferences } from "@/lib/regional-preferences";
import type { Prisma } from "@prisma/client";

type StarterWorkspaceUser = Pick<
  User,
  "id" | "clerkUserId" | "email" | "verified" | "dataWipedAt"
> & {
  regionalPreferences?: Prisma.JsonValue | null;
};

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
  isSystem: true,
  isArchived: true,
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

const STARTER_PROFILE_RACE_WINDOW_MS = 10_000;
const STARTER_PROFILE_REPAIR_MIN_AGE_MS = 60_000;
const starterWorkspaceLockKey = (userId: string) => `starter-workspace:${userId}`;
const workspaceDefaultsLockKey = (workspaceId: string) => `workspace-defaults:${workspaceId}`;

type TransactionClient = Prisma.TransactionClient;

const normalizeStarterCurrency = (currency: unknown) => {
  const requestedCurrency = String(currency || "PHP").trim().toUpperCase() || "PHP";
  return isCryptoAssetCurrencyCode(requestedCurrency) ? "PHP" : requestedCurrency;
};

const getUserStarterCurrency = (
  regionalPreferences: Prisma.JsonValue | null | undefined,
  fallbackCurrency = "PHP"
) =>
  regionalPreferences
    ? normalizeStarterCurrency(normalizeRegionalPreferences(regionalPreferences).baseCurrency)
    : normalizeStarterCurrency(fallbackCurrency);

const lockTransaction = async (tx: TransactionClient, key: string) => {
  // A frozen/default-seeding request must not hold an upload behind the
  // database's much longer statement timeout. Roll back and let the caller
  // retry, instead of expiring the transaction while it waits for this lock.
  await tx.$queryRaw`SELECT set_config('lock_timeout', '1500ms', true)`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS locked`;
};

const ensureWorkspaceCashAccountWithClient = async (
  tx: TransactionClient,
  workspaceId: string,
  normalizedCurrency: string
) => {
  await tx.account.updateMany({
    where: {
      workspaceId,
      name: "Cash on hand",
      type: "cash",
      currency: normalizedCurrency,
    },
    data: {
      name: "Cash",
      institution: "Cash",
    },
  });

  const existingCashAccount = await tx.account.findFirst({
    where: {
      workspaceId,
      type: "cash",
      currency: normalizedCurrency,
    },
    select: { id: true },
  });

  if (!existingCashAccount) {
    await tx.account.create({
      data: {
        workspaceId,
        name: "Cash",
        institution: "Cash",
        type: "cash",
        currency: normalizedCurrency,
        source: "manual",
        balance: 0,
      },
    });
  }
};

export const ensureWorkspaceCashAccount = async (workspaceId: string, currency = "PHP") => {
  const normalizedCurrency = normalizeStarterCurrency(currency);

  // Most imports already have a Cash account. A read is sufficient in that
  // case: do not acquire the shared defaults lock or run a no-op UPDATE for
  // every bank/wallet row group. Creation still rechecks inside the lock.
  const existingCashAccount = await prisma.account.findFirst({
    where: { workspaceId, type: "cash", currency: normalizedCurrency },
    select: { id: true, name: true },
  });
  if (existingCashAccount && existingCashAccount.name !== "Cash on hand") return;

  await prisma.$transaction(async (tx) => {
    await lockTransaction(tx, workspaceDefaultsLockKey(workspaceId));
    await ensureWorkspaceCashAccountWithClient(tx, workspaceId, normalizedCurrency);
  });
};

const starterCashAccountRelations = {
  transactions: true,
  importFiles: true,
  documentImports: true,
  statementCheckpoints: true,
  financialCommitments: true,
  accountRules: true,
  investmentPurchases: true,
  investmentDividends: true,
  receiptDocuments: true,
  investmentSnapshots: true,
  investmentHoldings: true,
  recurringPatterns: true,
  budgets: true,
  circleInvestmentShares: true,
} as const;

const alignWorkspaceStarterCashCurrencyWithClient = async (
  tx: TransactionClient,
  workspaceId: string,
  currency: string
) => {
  const normalizedCurrency = normalizeStarterCurrency(currency);
  const existingPreferredCash = await tx.account.findFirst({
    where: { workspaceId, type: "cash", currency: normalizedCurrency },
    select: { id: true },
  });
  if (existingPreferredCash) return existingPreferredCash.id;

  const starterCashCandidates = await tx.account.findMany({
    where: {
      workspaceId,
      type: "cash",
      source: "manual",
      name: { in: ["Cash", "Cash on hand"] },
      institution: "Cash",
      nameCustomized: false,
      institutionCustomized: false,
      logoCustomized: false,
    },
    select: {
      id: true,
      balance: true,
      finverseAccountLink: { select: { id: true } },
      _count: { select: starterCashAccountRelations },
    },
    orderBy: { createdAt: "asc" },
  });
  const pristineCash = starterCashCandidates.find(
    (account) =>
      Number(account.balance ?? 0) === 0 &&
      !account.finverseAccountLink &&
      Object.values(account._count).every((count) => count === 0)
  );

  if (pristineCash) {
    await tx.account.update({
      where: { id: pristineCash.id },
      data: {
        name: "Cash",
        institution: "Cash",
        currency: normalizedCurrency,
      },
    });
    return pristineCash.id;
  }

  await ensureWorkspaceCashAccountWithClient(tx, workspaceId, normalizedCurrency);
  const created = await tx.account.findFirst({
    where: { workspaceId, type: "cash", currency: normalizedCurrency },
    select: { id: true },
  });
  return created?.id ?? null;
};

export const alignUserStarterCashCurrencyWithClient = async (
  tx: TransactionClient,
  userId: string,
  currency: string
) => {
  const workspaces = await tx.workspace.findMany({
    where: { userId, type: "personal" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (workspaces[0]) {
    await lockTransaction(tx, workspaceDefaultsLockKey(workspaces[0].id));
    await alignWorkspaceStarterCashCurrencyWithClient(tx, workspaces[0].id, currency);
  }
};

const duplicateStarterWorkspaceSelect = {
  id: true,
  createdAt: true,
  accounts: {
    select: {
      name: true,
      institution: true,
      type: true,
      currency: true,
      source: true,
      balance: true,
      nameCustomized: true,
      institutionCustomized: true,
      logoCustomized: true,
    },
  },
  categories: { select: { isSystem: true } },
  _count: {
    select: {
      accountTombstones: true,
      transactions: true,
      importFiles: true,
      importFileExtractionCaches: true,
      importEnrichmentJobs: true,
      documentImports: true,
      statementCheckpoints: true,
      financialCommitments: true,
      financialCommitmentOccurrences: true,
      auditLogs: true,
      statementTemplates: true,
      merchantRules: true,
      accountRules: true,
      trainingSignals: true,
      dataQaRuns: true,
      dataQaFindings: true,
      brankasStatementSessions: true,
      finverseConnections: true,
      finverseAccountLinks: true,
      receiptDocuments: true,
      investmentSnapshots: true,
      investmentHoldings: true,
      recurringPatterns: true,
      budgets: true,
      tags: true,
    },
  },
} as const;

const isPristineStarterWorkspace = (workspace: {
  accounts: Array<{
    name: string;
    institution: string | null;
    type: string;
    currency: string;
    source: string;
    balance: { toString(): string } | null;
    nameCustomized: boolean;
    institutionCustomized: boolean;
    logoCustomized: boolean;
  }>;
  categories: Array<{ isSystem: boolean }>;
  _count: Record<string, number>;
}) => {
  const cash = workspace.accounts[0];
  const hasOnlyDefaultCash =
    workspace.accounts.length === 1 &&
    cash?.name === "Cash" &&
    cash.institution === "Cash" &&
    cash.type === "cash" &&
    /^[A-Z]{3}$/.test(cash.currency) &&
    cash.source === "manual" &&
    Number(cash.balance ?? 0) === 0 &&
    !cash.nameCustomized &&
    !cash.institutionCustomized &&
    !cash.logoCustomized;
  const hasOnlySystemCategories = workspace.categories.every((category) => category.isSystem);
  const hasNoDependentData = Object.values(workspace._count).every((count) => count === 0);
  return hasOnlyDefaultCash && hasOnlySystemCategories && hasNoDependentData;
};

const repairDuplicateStarterWorkspacesWithClient = async (tx: TransactionClient, userId: string) => {
  const matching = await tx.workspace.findMany({
    where: { userId, type: "personal", name: "Personal" },
    orderBy: { createdAt: "asc" },
    select: duplicateStarterWorkspaceSelect,
  });
  if (matching.length < 2) return 0;

  const firstCreatedAt = matching[0]!.createdAt.getTime();
  const raceCluster = matching.filter(
    (workspace) => workspace.createdAt.getTime() - firstCreatedAt <= STARTER_PROFILE_RACE_WINDOW_MS
  );
  if (raceCluster.length < 2 || Date.now() - firstCreatedAt < STARTER_PROFILE_REPAIR_MIN_AGE_MS) return 0;

  const meaningful = raceCluster.filter((workspace) => !isPristineStarterWorkspace(workspace));
  if (meaningful.length > 1) return 0;
  const canonicalId = meaningful[0]?.id ?? raceCluster[0]!.id;
  const duplicateIds = raceCluster
    .filter((workspace) => workspace.id !== canonicalId && isPristineStarterWorkspace(workspace))
    .map((workspace) => workspace.id);
  if (duplicateIds.length === 0) return 0;

  const result = await tx.workspace.deleteMany({ where: { id: { in: duplicateIds }, userId } });
  return result.count;
};

export const repairDuplicateStarterWorkspaces = async (userId: string) =>
  prisma.$transaction(async (tx) => {
    await lockTransaction(tx, starterWorkspaceLockKey(userId));
    return repairDuplicateStarterWorkspacesWithClient(tx, userId);
  });

export const ensureStarterWorkspace = async (
  userOrClerkUserId: StarterWorkspaceUser | string,
  email?: string,
  verified?: boolean,
  preferredCurrency?: string
) => {
  const user =
    typeof userOrClerkUserId === "string"
      ? await getOrCreateCurrentUser(userOrClerkUserId)
      : userOrClerkUserId;
  const starterCurrency = getUserStarterCurrency(
    user.regionalPreferences,
    preferredCurrency ?? "PHP"
  );

  const ensured = await prisma.$transaction(async (tx) => {
    await lockTransaction(tx, starterWorkspaceLockKey(user.id));
    await repairDuplicateStarterWorkspacesWithClient(tx, user.id);
    const existingPersonal = await tx.workspace.findFirst({
      where: { userId: user.id, type: "personal" },
      orderBy: { createdAt: "asc" },
      select: starterWorkspaceSelect,
    });
    if (existingPersonal) return { workspace: existingPersonal, created: false };

    const workspace = await tx.workspace.create({
      data: {
        userId: user.id,
        name: "Personal",
        type: "personal",
        accounts: {
          create: [{ name: "Cash", institution: "Cash", type: "cash", currency: starterCurrency, source: "manual", balance: 0 }],
        },
        categories: {
          create: DEFAULT_CATEGORY_ROWS.map((category) => ({ name: category.name, type: category.type, isSystem: true })),
        },
      },
      select: starterWorkspaceSelect,
    });
    return { workspace, created: true };
  });

  const workspace = ensured.workspace;
  if (!ensured.created) {
    await prisma.$transaction(async (tx) => {
      await lockTransaction(tx, workspaceDefaultsLockKey(workspace.id));
      await alignWorkspaceStarterCashCurrencyWithClient(tx, workspace.id, starterCurrency);
    });
  }

  if (ensured.created) {
    void capturePostHogServerEvent("workspace_created", user.clerkUserId, {
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      workspace_type: workspace.type,
      source: "starter_workspace",
    });
  }

  return workspace;
};

export const seedWorkspaceDefaults = async (workspaceId: string, preferredCurrency?: string) => {
  // Profile refreshes happen during upload progress. Established profiles
  // must stay read-only here so they cannot block transaction confirmation.
  const current = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      user: { select: { regionalPreferences: true } },
      categories: { select: { name: true } },
      accounts: { where: { type: "cash" }, select: { currency: true } },
    },
  });
  if (!current) return;
  const currentCurrency = getUserStarterCurrency(current.user.regionalPreferences, preferredCurrency ?? "PHP");
  const currentCategoryNames = new Set(current.categories.map((category) => category.name.trim().toLowerCase()));
  if (
    current.accounts.some((account) => account.currency === currentCurrency) &&
    DEFAULT_CATEGORY_ROWS.every((category) => currentCategoryNames.has(category.name.trim().toLowerCase()))
  ) return;

  await prisma.$transaction(async (tx) => {
    await lockTransaction(tx, workspaceDefaultsLockKey(workspaceId));
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { user: { select: { regionalPreferences: true } } },
    });
    const starterCurrency = getUserStarterCurrency(
      workspace?.user.regionalPreferences,
      preferredCurrency ?? "PHP"
    );
    const existingCategories = await tx.category.findMany({ where: { workspaceId } });
    const categoryByName = new Set(existingCategories.map((category) => category.name.trim().toLowerCase()));
    const missingCategories = DEFAULT_CATEGORY_ROWS.filter((category) => !categoryByName.has(category.name.trim().toLowerCase()));
    if (missingCategories.length > 0) {
      await tx.category.createMany({
        data: missingCategories.map((category) => ({ workspaceId, name: category.name, type: category.type, isSystem: true })),
      });
    }
    await alignWorkspaceStarterCashCurrencyWithClient(tx, workspaceId, starterCurrency);
  });
};
