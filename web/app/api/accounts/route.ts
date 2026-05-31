import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { hasCompatibleTable, loadAccountRules, normalizeAccountRuleKey, upsertAccountRule } from "@/lib/data-engine";
import { INVESTMENT_SUBTYPES, isFixedIncomeInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";
import { countWorkspaceOwnerPlanLimitedAccounts } from "@/lib/plan-access";
import { ensureWorkspaceCashAccount, seedWorkspaceDefaults } from "@/lib/starter-data";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { isMissingAccountNumberColumnError, omitAccountNumberField } from "@/lib/account-column-compat";
import { isSupportedAccountType } from "@/lib/account-types";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";
import { formatUploadAccountDisplayName } from "@/lib/account-display";

export const dynamic = "force-dynamic";

const resolveAccountsRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

let accountColumnCache: Set<string> | null = null;

const getCompatibleAccountColumns = async () => {
  if (accountColumnCache) {
    return accountColumnCache;
  }

  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Account'
    `;

    accountColumnCache = new Set(columns.map((column) => column.column_name));
  } catch {
    accountColumnCache = new Set();
  }

  return accountColumnCache;
};

const getCompatibleAccountSelect = (columns: Set<string>) => ({
  id: true,
  workspaceId: true,
  name: true,
  institution: true,
  ...(columns.has("accountNumber") ? { accountNumber: true } : {}),
  ...(columns.has("favorite") ? { favorite: true } : {}),
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
  updatedAt: true,
  createdAt: true,
});

const normalizeAccountCurrency = (account: {
  institution?: string | null;
  currency?: string | null;
  name?: string | null;
}) =>
  normalizeInstitutionCurrency(account.institution ?? null, account.currency ?? null, account.name ?? null) ??
  account.currency ??
  "PHP";

const serializeAccount = <T extends {
  accountNumber?: string | null;
  currency?: string | null;
  institution?: string | null;
  name?: string | null;
  favorite?: boolean;
  transactionCount?: number | null;
  balance: { toString: () => string } | null;
  investmentQuantity: { toString: () => string } | null;
  investmentCostBasis: { toString: () => string } | null;
  investmentPrincipal: { toString: () => string } | null;
  investmentInterestRate: { toString: () => string } | null;
  investmentMaturityValue: { toString: () => string } | null;
  createdAt: Date;
  updatedAt: Date;
  investmentStartDate: Date | null;
  investmentMaturityDate: Date | null;
}>(account: T) => ({
  ...account,
  accountNumber: account.accountNumber ?? null,
  favorite: account.favorite ?? false,
  transactionCount: Number(account.transactionCount ?? 0),
  currency: normalizeAccountCurrency(account),
  balance: account.balance?.toString() ?? null,
  investmentQuantity: account.investmentQuantity?.toString() ?? null,
  investmentCostBasis: account.investmentCostBasis?.toString() ?? null,
  investmentPrincipal: account.investmentPrincipal?.toString() ?? null,
  investmentInterestRate: account.investmentInterestRate?.toString() ?? null,
  investmentMaturityValue: account.investmentMaturityValue?.toString() ?? null,
  investmentStartDate: account.investmentStartDate?.toISOString() ?? null,
  investmentMaturityDate: account.investmentMaturityDate?.toISOString() ?? null,
  createdAt: account.createdAt.toISOString(),
  updatedAt: account.updatedAt.toISOString(),
});

const normalizeAccountIdentityKey = (accountName?: string | null, institution?: string | null, accountNumber?: string | null) => {
  const digits = String(accountNumber ?? "").replace(/\D/g, "");
  const accountNumberKey = digits.length >= 4 ? digits.slice(-4) : "";
  const nameKey = accountNumberKey || String(accountName ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return `${String(institution ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()} ${nameKey}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const parseNullableDecimal = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toString() : null;
};

const parseNullableDate = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseNullableText = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
};

const getInvestmentSummaryField = (subtype: string | null) =>
  isFixedIncomeInvestmentSubtype(subtype) ? "investmentPrincipal" : "investmentCostBasis";

const normalizeInvestmentSubtype = (value: unknown): InvestmentSubtype | null => {
  const subtype = typeof value === "string" ? value.trim() : "";
  return INVESTMENT_SUBTYPES.includes(subtype as InvestmentSubtype) ? (subtype as InvestmentSubtype) : null;
};

const normalizeImportInstitution = (value?: string | null) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeImportAccountNumber = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
};

const normalizeImportIdentityText = (value?: string | null) =>
  normalizeImportInstitution(value)
    .toLowerCase()
    .replace(/\s+\d{4}$/, "")
    .trim();

const importedAccountInstitutionKey = (account: {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
}) => {
  const institution = normalizeImportIdentityText(account.institution);
  if (institution) {
    return institution;
  }

  const name = normalizeImportIdentityText(account.name);
  return name || null;
};

const importedAccountIdentityKey = (institution?: string | null, accountNumber?: string | null) => {
  const normalizedAccountNumber = normalizeImportAccountNumber(accountNumber);
  return normalizedAccountNumber ? `${normalizeImportInstitution(institution).toLowerCase()}:${normalizedAccountNumber}` : null;
};

const readImportedJsonNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
};

const readImportedJsonText = (payload: unknown, key: string) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readImportedSourceRowIndex = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return readImportedJsonNumber((payload as Record<string, unknown>).sourceRowIndex);
};

const isCimbParsedAccountRepairRow = (row: {
  institution: string | null;
  accountName: string | null;
  rawPayload: Prisma.JsonValue | null;
}) => {
  const institution =
    normalizeImportInstitution(row.institution).toLowerCase() ||
    normalizeImportInstitution(readImportedJsonText(row.rawPayload, "institution")).toLowerCase() ||
    normalizeImportInstitution(readImportedJsonText(row.rawPayload, "bank")).toLowerCase();
  const accountName = normalizeImportInstitution(row.accountName).toLowerCase();

  return institution === "cimb" || accountName.startsWith("cimb ");
};

const readImportedRunningBalance = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return readImportedJsonNumber(record.balance ?? record.runningBalance ?? record.endingBalance);
};

const isGenericUploadedAccountForInstitution = (account: {
  name: string;
  institution: string | null;
  accountNumber?: string | null;
  source: string;
}) => {
  if (account.source !== "upload" || normalizeImportAccountNumber(account.accountNumber ?? null)) {
    return false;
  }

  const institution = normalizeImportIdentityText(account.institution) || normalizeImportIdentityText(account.name);
  const name = normalizeImportInstitution(account.name).toLowerCase();
  return Boolean(institution && (name === institution || name === `${institution} account` || !name));
};

const repairParsedImportedAccounts = async (workspaceId: string, compatibleColumns: Set<string>) => {
  if (!compatibleColumns.has("accountNumber") || !(await hasCompatibleTable("ParsedTransaction"))) {
    return;
  }

  const parsedRows = await prisma.parsedTransaction.findMany({
    where: {
      workspaceId,
      accountNumber: { not: null },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10_000,
    select: {
      importFileId: true,
      accountNumber: true,
      accountName: true,
      institution: true,
      currency: true,
      rawPayload: true,
    },
  }).catch(() => []);
  if (parsedRows.length === 0) {
    return;
  }
  const repairRows = parsedRows.filter((row) => !isCimbParsedAccountRepairRow(row));
  if (repairRows.length === 0) {
    return;
  }

  const existingAccounts = await prisma.account.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      currency: true,
      source: true,
      balance: true,
      createdAt: true,
    },
  });
  const accountByNumber = new Map(
    existingAccounts
      .map((account) => [importedAccountIdentityKey(account.institution, account.accountNumber), account] as const)
      .filter((entry): entry is [string, (typeof existingAccounts)[number]] => Boolean(entry[0]))
  );
  const groups = new Map<
    string,
    {
      accountNumber: string;
      accountName: string | null;
      institution: string | null;
      currency: string | null;
      balance: string | null;
      rows: typeof parsedRows;
    }
  >();

  for (const row of repairRows) {
    const accountNumber =
      normalizeImportAccountNumber(row.accountNumber) ??
      normalizeImportAccountNumber(readImportedJsonText(row.rawPayload, "accountNumber"));
    if (!accountNumber) {
      continue;
    }

    const institution = normalizeImportInstitution(row.institution ?? readImportedJsonText(row.rawPayload, "institution"));
    const key = `${institution.toLowerCase() || "unknown"}:${accountNumber}`;
    const group =
      groups.get(key) ??
      {
        accountNumber,
        accountName: row.accountName?.trim() || readImportedJsonText(row.rawPayload, "accountName"),
        institution: institution || null,
        currency: row.currency?.trim().toUpperCase() || null,
        balance: null,
        rows: [],
      };
    const runningBalance = readImportedRunningBalance(row.rawPayload);
    if (group.balance === null && runningBalance !== null) {
      group.balance = runningBalance.toFixed(2);
    }
    group.rows.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const accountType = "bank" as const;
    const groupIdentityKey = importedAccountIdentityKey(group.institution, group.accountNumber);
    let account = groupIdentityKey ? accountByNumber.get(groupIdentityKey) ?? null : null;
    const accountName = formatUploadAccountDisplayName(
      group.accountName ?? group.institution ?? "Imported account",
      group.institution,
      group.accountNumber,
      accountType
    );
    const currency = normalizeInstitutionCurrency(group.institution, group.currency, accountName) ?? group.currency ?? "PHP";
    if (!account) {
      account = await prisma.account.create({
        data: {
          workspaceId,
          name: accountName,
          institution: group.institution,
          accountNumber: group.accountNumber,
          type: accountType,
          currency,
          source: "upload",
          ...(group.balance !== null ? { balance: group.balance } : {}),
        },
        select: {
          id: true,
          name: true,
          institution: true,
          accountNumber: true,
          type: true,
          currency: true,
          source: true,
          balance: true,
          createdAt: true,
        },
      });
      if (groupIdentityKey) {
        accountByNumber.set(groupIdentityKey, account);
      }
    } else if (account.source === "upload") {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          name: account.name || accountName,
          institution: account.institution ?? group.institution,
          currency: account.currency ?? currency,
          ...(group.balance !== null ? { balance: group.balance } : {}),
        },
      }).catch(() => null);
    }

    const importRows = group.rows
      .map((row) => ({
        importFileId: row.importFileId,
        sourceRowIndex: readImportedSourceRowIndex(row.rawPayload),
      }))
      .filter((row): row is { importFileId: string; sourceRowIndex: number } => Boolean(row.importFileId && row.sourceRowIndex !== null));
    for (const row of importRows) {
      await prisma.transaction.updateMany({
        where: {
          workspaceId,
          importFileId: row.importFileId,
          deletedAt: null,
          rawPayload: {
            path: ["sourceRowIndex"],
            equals: row.sourceRowIndex,
          },
        },
        data: { accountId: account.id },
      }).catch(() => null);
    }
  }

  const numberedInstitutions = new Set(
    Array.from(groups.values())
      .map((group) => importedAccountInstitutionKey({ institution: group.institution, accountNumber: group.accountNumber }))
      .filter(Boolean)
  );
  const genericPlaceholderIds = existingAccounts
    .filter((account) => {
      const institutionKey = importedAccountInstitutionKey(account);
      return Boolean(institutionKey && numberedInstitutions.has(institutionKey));
    })
    .filter(isGenericUploadedAccountForInstitution)
    .map((account) => account.id);
  if (genericPlaceholderIds.length === 0) {
    return;
  }

  const occupiedGenericAccounts = await prisma.account.findMany({
    where: {
      id: { in: genericPlaceholderIds },
      transactions: {
        some: {
          deletedAt: null,
        },
      },
    },
    select: { id: true },
  }).catch(() => []);
  const occupiedIds = new Set(occupiedGenericAccounts.map((account) => account.id));
  const deletableIds = genericPlaceholderIds.filter((id) => !occupiedIds.has(id));
  if (deletableIds.length > 0) {
    await prisma.account.deleteMany({
      where: {
        id: { in: deletableIds },
        source: "upload",
        accountNumber: null,
      },
    }).catch(() => null);
  }
};

const cleanupEmptyGenericUploadedAccountPlaceholders = async (workspaceId: string, compatibleColumns: Set<string>) => {
  if (!compatibleColumns.has("accountNumber")) {
    return;
  }

  const numberedUploadAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: { not: null },
    },
    select: {
      name: true,
      institution: true,
      accountNumber: true,
    },
  }).catch(() => []);
  const institutionsWithNumberedAccounts = new Set(
    new Set(
      numberedUploadAccounts
        .map((account) => importedAccountInstitutionKey(account))
        .filter(Boolean)
    )
  );
  if (institutionsWithNumberedAccounts.size === 0) {
    return;
  }

  const emptyPlaceholderAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: null,
      transactions: { none: {} },
    },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      source: true,
    },
  }).catch(() => []);
  const deletableIds = emptyPlaceholderAccounts
    .filter(isGenericUploadedAccountForInstitution)
    .filter((account) => {
      const institutionKey = importedAccountInstitutionKey(account);
      return Boolean(institutionKey && institutionsWithNumberedAccounts.has(institutionKey));
    })
    .map((account) => account.id);

  if (deletableIds.length > 0) {
    await prisma.account.deleteMany({
      where: {
        workspaceId,
        id: { in: deletableIds },
        source: "upload",
        accountNumber: null,
      },
    }).catch(() => null);
  }
};

export async function GET(request: Request) {
  try {
    const userId = await resolveAccountsRouteUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    const compatibleColumns = await getCompatibleAccountColumns();
    const shouldRepairImportedAccounts = ["1", "true"].includes(
      (searchParams.get("repairImportedAccounts") ?? "").trim().toLowerCase()
    );
    if (shouldRepairImportedAccounts) {
      await repairParsedImportedAccounts(workspaceId, compatibleColumns).catch((error) => {
        console.warn("[accounts] unable to repair parsed imported account materialization", {
          workspaceId,
          error,
        });
      });
    }
    const shouldCleanupImportedAccounts = ["1", "true"].includes(
      (searchParams.get("cleanupImportedAccounts") ?? "").trim().toLowerCase()
    );
    if (shouldCleanupImportedAccounts) {
      await cleanupEmptyGenericUploadedAccountPlaceholders(workspaceId, compatibleColumns).catch((error) => {
        console.warn("[accounts] unable to clean up empty generic imported account placeholders", {
          workspaceId,
          error,
        });
      });
    }

    const accounts = await prisma.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: getCompatibleAccountSelect(compatibleColumns),
    });
    const accountRules = await loadAccountRules(workspaceId);

    const statementCheckpoints = await (async () => {
      if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
        return [];
      }

      const checkpoints = await prisma.accountStatementCheckpoint.findMany({
        where: { workspaceId },
        orderBy: [
          { statementEndDate: "desc" },
          { createdAt: "desc" },
        ],
      });

      const latestByAccountId = new Map<string, (typeof checkpoints)[number]>();
      const latestByAccountKey = new Map<string, (typeof checkpoints)[number]>();
      for (const checkpoint of checkpoints) {
        const sourceMetadata =
          checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
            ? (checkpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const checkpointKey = normalizeAccountIdentityKey(
          typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
          typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null,
          typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null
        );
        if (checkpointKey) {
          const currentByKey = latestByAccountKey.get(checkpointKey);
          const checkpointTime = Math.max(
            checkpoint.statementEndDate?.getTime() ?? 0,
            checkpoint.createdAt.getTime()
          );
          const currentTimeByKey = currentByKey
            ? Math.max(
                currentByKey.statementEndDate?.getTime() ?? 0,
                currentByKey.createdAt.getTime()
              )
            : -1;

          if (!currentByKey || checkpointTime >= currentTimeByKey) {
            latestByAccountKey.set(checkpointKey, checkpoint);
          }
        }

        if (!checkpoint.accountId) {
          continue;
        }

        const current = latestByAccountId.get(checkpoint.accountId);
        const checkpointTime = Math.max(
          checkpoint.statementEndDate?.getTime() ?? 0,
          checkpoint.createdAt.getTime()
        );
        const currentTime = current
          ? Math.max(
              current.statementEndDate?.getTime() ?? 0,
              current.createdAt.getTime()
            )
          : -1;

        if (!current || checkpointTime >= currentTime) {
          latestByAccountId.set(checkpoint.accountId, checkpoint);
        }
      }

      const checkpointValues = Array.from(
        new Map([
          ...Array.from(latestByAccountId.entries()),
          ...Array.from(latestByAccountKey.entries()).map(([key, checkpoint]) => [`key:${key}`, checkpoint] as const),
        ]).values()
      );

      return checkpointValues.map((checkpoint) => ({
        ...checkpoint,
        openingBalance: checkpoint.openingBalance?.toString() ?? null,
        endingBalance: checkpoint.endingBalance?.toString() ?? null,
        statementStartDate: checkpoint.statementStartDate?.toISOString() ?? null,
        statementEndDate: checkpoint.statementEndDate?.toISOString() ?? null,
        createdAt: checkpoint.createdAt.toISOString(),
        updatedAt: checkpoint.updatedAt.toISOString(),
        sourceMetadata: checkpoint.sourceMetadata ?? null,
      }));
    })();

    const numberedInstitutionKeys = new Set(
      accounts
        .filter((account) => normalizeImportAccountNumber(account.accountNumber ?? null))
        .map((account) => importedAccountInstitutionKey(account))
        .filter(Boolean)
    );
    const visibleAccounts = accounts.filter(
      (account) => {
        const institutionKey = importedAccountInstitutionKey(account);
        return !(
          institutionKey &&
          numberedInstitutionKeys.has(institutionKey) &&
          isGenericUploadedAccountForInstitution(account)
        );
      }
    );
    const visibleAccountIds = visibleAccounts.map((account) => account.id);
    const transactionCounts = visibleAccountIds.length
      ? await prisma.transaction.groupBy({
          by: ["accountId"],
          where: {
            workspaceId,
            accountId: { in: visibleAccountIds },
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const transactionCountByAccountId = new Map(
      transactionCounts
        .filter((row) => row.accountId)
        .map((row) => [row.accountId as string, row._count._all])
    );
    const latestCheckpointForAccount = (account: {
      id: string;
      name: string;
      institution: string | null;
      accountNumber?: string | null;
      type: string;
    }) => {
      let latestCheckpoint: (typeof statementCheckpoints)[number] | null = null;
      let latestTime = -1;
      const accountKey = normalizeAccountIdentityKey(account.name, account.institution, account.accountNumber ?? null);

      for (const checkpoint of statementCheckpoints) {
        const sourceMetadata =
          checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
            ? (checkpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const checkpointKey = normalizeAccountIdentityKey(
          typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
          typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null,
          typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null
        );
        const matchesAccount =
          checkpoint.accountId === account.id ||
          (accountKey !== "" && checkpointKey === accountKey) ||
          Boolean(
            typeof sourceMetadata?.accountNumber === "string" &&
              account.accountNumber &&
              normalizeImportAccountNumber(sourceMetadata.accountNumber) === normalizeImportAccountNumber(account.accountNumber)
          );

        if (!matchesAccount) {
          continue;
        }

        const checkpointTime = Math.max(
          checkpoint.statementEndDate?.getTime() ?? 0,
          checkpoint.createdAt.getTime()
        );

        if (checkpointTime >= latestTime) {
          latestCheckpoint = checkpoint;
          latestTime = checkpointTime;
        }
      }

      return latestCheckpoint;
    };
    const accountsWithCheckpointBackfill = visibleAccounts.map((account) => {
      const latestCheckpoint = latestCheckpointForAccount(account);
      const checkpointAccountNumber =
        latestCheckpoint?.sourceMetadata &&
        typeof latestCheckpoint.sourceMetadata === "object" &&
        !Array.isArray(latestCheckpoint.sourceMetadata) &&
        typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber === "string"
          ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber).trim()
          : null;

      return {
        ...account,
        accountNumber: account.accountNumber ?? checkpointAccountNumber ?? null,
      };
    });

    return NextResponse.json({
      accounts: accountsWithCheckpointBackfill.map((account) =>
        serializeAccount({
          ...account,
          transactionCount: transactionCountByAccountId.get(account.id) ?? 0,
        })
      ),
      accountRules,
      statementCheckpoints,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await resolveAccountsRouteUserId();
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "");
    const name = String(body?.name || "").trim();
    const institution = body?.institution ? String(body.institution) : null;
    const accountNumber = body?.accountNumber ? String(body.accountNumber).trim() || null : null;
    const type = isSupportedAccountType(body?.type) ? body.type : "bank";
    const investmentSubtype = normalizeInvestmentSubtype(body?.investmentSubtype);
    const investmentSymbol = body?.investmentSymbol ? String(body.investmentSymbol).trim() || null : null;
    const investmentQuantity = parseNullableDecimal(body?.investmentQuantity);
    const investmentCostBasis = parseNullableDecimal(body?.investmentCostBasis);
    const investmentPrincipal = parseNullableDecimal(body?.investmentPrincipal);
    const investmentStartDate = parseNullableDate(body?.investmentStartDate);
    const investmentMaturityDate = parseNullableDate(body?.investmentMaturityDate);
    const investmentInterestRate = parseNullableDecimal(body?.investmentInterestRate);
    const investmentMaturityValue = parseNullableDecimal(body?.investmentMaturityValue);
    const investmentPurchaseDate = parseNullableDate(body?.investmentPurchaseDate);
    const investmentDividendDate = parseNullableDate(body?.investmentDividendDate);
    const investmentDividendAmount = parseNullableDecimal(body?.investmentDividendAmount);
    const investmentPurchaseNote = parseNullableText(body?.investmentPurchaseNote);
    const investmentDividendNote = parseNullableText(body?.investmentDividendNote);
    const balance = parseNullableDecimal(body?.balance);
    const normalizedCurrency = normalizeInstitutionCurrency(
      institution,
      body?.currency ? String(body.currency).trim().toUpperCase() : null,
      name
    ) ?? "PHP";

    if (!workspaceId || !name) {
      return NextResponse.json({ error: "workspaceId and name are required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    await seedWorkspaceDefaults(workspaceId);
    const compatibleColumns = await getCompatibleAccountColumns();

    const existingAccounts = await prisma.account.findMany({
      where: { workspaceId },
      select: getCompatibleAccountSelect(compatibleColumns),
    });
    const candidateKey = normalizeAccountRuleKey(name, institution);
    const existingAccount =
      existingAccounts.find((account) => account.type === type && normalizeAccountRuleKey(account.name, account.institution) === candidateKey) ??
      existingAccounts.find((account) => account.type === type && account.name === name && account.institution === institution) ??
      null;
    const hasInitialPurchaseHistory =
      type === "investment" &&
      investmentPurchaseDate !== null &&
      (investmentCostBasis !== null || investmentPrincipal !== null);
    const hasInitialDividend =
      type === "investment" &&
      investmentDividendDate !== null &&
      investmentDividendAmount !== null;

    const createInitialInvestmentHistory = async (
      accountId: string,
      accountSubtype: string | null,
      adjustSummary: boolean
    ) => {
      if (type !== "investment") {
        return;
      }

      await prisma.$transaction(async (tx) => {
        if (hasInitialPurchaseHistory) {
          const purchaseTotal = getInvestmentSummaryField(accountSubtype) === "investmentPrincipal" ? investmentPrincipal : investmentCostBasis;
          if (purchaseTotal !== null) {
            await tx.investmentPurchase.create({
              data: {
                accountId,
                purchasedAt: investmentPurchaseDate ?? new Date(),
                quantity: investmentQuantity,
                totalCost: purchaseTotal,
                currency: normalizedCurrency,
                note: investmentPurchaseNote ?? investmentSymbol,
              },
            });

            if (adjustSummary) {
              const summaryField = getInvestmentSummaryField(accountSubtype);
              const currentSummary = Number(
                summaryField === "investmentPrincipal"
                  ? (existingAccount?.investmentPrincipal?.toString() ?? 0)
                  : (existingAccount?.investmentCostBasis?.toString() ?? 0)
              );
              const nextSummary = new Prisma.Decimal(currentSummary).plus(new Prisma.Decimal(purchaseTotal));

              await tx.account.update({
                where: { id: accountId },
                data:
                  summaryField === "investmentPrincipal"
                    ? { investmentPrincipal: nextSummary.toString() }
                    : { investmentCostBasis: nextSummary.toString() },
              });
            }
          }
        }

        if (hasInitialDividend) {
          await tx.investmentDividend.create({
            data: {
              accountId,
              paidAt: investmentDividendDate ?? new Date(),
              amount: investmentDividendAmount,
              currency: normalizedCurrency,
              note: investmentDividendNote,
            },
          });
        }
      });
    };

    if (existingAccount) {
      if (normalizedCurrency) {
        await ensureWorkspaceCashAccount(workspaceId, normalizedCurrency);
      }

      if (compatibleColumns.has("accountNumber") && accountNumber && (existingAccount.accountNumber ?? null) !== accountNumber) {
        const accountUpdate = (data: Record<string, unknown>) =>
          prisma.account.update({
            where: { id: existingAccount.id },
            data,
            select: getCompatibleAccountSelect(compatibleColumns),
          });

        let updatedAccount;
        try {
          updatedAccount = await accountUpdate({ accountNumber });
        } catch (error) {
          if (!isMissingAccountNumberColumnError(error)) {
            throw error;
          }

          const fallbackData = omitAccountNumberField({ accountNumber });
          updatedAccount =
            Object.keys(fallbackData).length === 0
              ? existingAccount
              : await accountUpdate(fallbackData);
        }

        await createInitialInvestmentHistory(updatedAccount.id, updatedAccount.investmentSubtype, true);

        const refreshedAccount = hasInitialPurchaseHistory
          ? await prisma.account.findUnique({
              where: { id: updatedAccount.id },
              select: getCompatibleAccountSelect(compatibleColumns),
            })
          : updatedAccount;

        return NextResponse.json({
          account: serializeAccount(refreshedAccount ?? updatedAccount),
        });
      }

      await createInitialInvestmentHistory(existingAccount.id, existingAccount.investmentSubtype, true);

      const refreshedAccount = hasInitialPurchaseHistory
        ? await prisma.account.findUnique({
            where: { id: existingAccount.id },
            select: getCompatibleAccountSelect(compatibleColumns),
          })
        : existingAccount;

      return NextResponse.json({
        account: serializeAccount(refreshedAccount ?? existingAccount),
      });
    }

    if (type !== "cash") {
      const user = await getOrCreateCurrentUser(userId);
      const effectiveLimits = getEffectiveUserLimits(user);
      const nonCashAccountCount = await countWorkspaceOwnerPlanLimitedAccounts(workspaceId);

      if (effectiveLimits.accountLimit !== null && nonCashAccountCount >= effectiveLimits.accountLimit) {
        const isFreePlan = user.planTier === "free";
        return NextResponse.json(
          {
            error: isFreePlan
              ? `Free includes up to ${effectiveLimits.accountLimit} non-cash accounts. Upgrade to Pro to add more.`
              : `You’ve reached the current ${effectiveLimits.accountLimit}-account limit on Pro. Remove an account or manage billing if you need more room.`,
            planTier: user.planTier,
            limitType: "account_limit",
            limitValue: effectiveLimits.accountLimit,
          },
          { status: 403 }
        );
      }
    }

    const accountCreateData = {
      workspaceId,
      name,
      institution,
      ...(compatibleColumns.has("accountNumber") ? { accountNumber } : {}),
      investmentSubtype: type === "investment" ? investmentSubtype : null,
      investmentSymbol: type === "investment" ? investmentSymbol : null,
      investmentQuantity: type === "investment" ? investmentQuantity : null,
      investmentCostBasis: type === "investment" ? investmentCostBasis : null,
      investmentPrincipal: type === "investment" ? investmentPrincipal : null,
      investmentStartDate: type === "investment" ? investmentStartDate : null,
      investmentMaturityDate: type === "investment" ? investmentMaturityDate : null,
      investmentInterestRate: type === "investment" ? investmentInterestRate : null,
      investmentMaturityValue: type === "investment" ? investmentMaturityValue : null,
      type,
      currency: normalizedCurrency,
      source: body?.source ? String(body.source) : "upload",
      balance,
      favorite: false,
    };

    let account;
    try {
      account = await prisma.account.create({
        data: accountCreateData,
        select: getCompatibleAccountSelect(compatibleColumns),
      });
    } catch (error) {
      if (!isMissingAccountNumberColumnError(error)) {
        throw error;
      }

      account = await prisma.account.create({
        data: omitAccountNumberField(accountCreateData),
        select: getCompatibleAccountSelect(compatibleColumns),
      });
    }

    if (normalizedCurrency) {
      await ensureWorkspaceCashAccount(workspaceId, normalizedCurrency);
    }

    await createInitialInvestmentHistory(account.id, account.investmentSubtype, false);

    void capturePostHogServerEvent("account_created", userId, {
      workspace_id: workspaceId,
      account_id: account.id,
      account_name: account.name,
      account_institution: account.institution,
      account_type: account.type,
      account_currency: account.currency,
      account_source: account.source,
      is_cash: account.type === "cash",
    });

    void upsertAccountRule({
      workspaceId,
      accountId: account.id,
      accountName: account.name,
      institution: account.institution,
      accountType: account.type,
      source: "manual_account_creation",
      confidence: 100,
    }).catch(() => null);

    return NextResponse.json({ account: serializeAccount(account) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account.";
    const status = /unauthorized/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
