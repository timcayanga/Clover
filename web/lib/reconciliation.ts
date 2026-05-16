import { prisma } from "@/lib/prisma";

export type WorkspaceReconciliationIssue = {
  type:
    | "account_without_transactions_nonzero_balance"
    | "transaction_linked_to_deleted_account"
    | "duplicate_account_identity"
    | "category_type_mismatch"
    | "stuck_import";
  severity: "info" | "warning" | "critical";
  message: string;
  entityIds: string[];
};

const normalizeDigits = (value?: string | null) => String(value ?? "").replace(/\D/g, "");

const accountIdentityKey = (account: {
  institution: string | null;
  accountNumber: string | null;
  name: string;
  type: string;
  currency: string;
}) => {
  const lastFour = normalizeDigits(account.accountNumber || account.name).slice(-4);
  return [
    account.institution?.trim().toLowerCase() || account.name.trim().toLowerCase(),
    lastFour || account.name.trim().toLowerCase(),
    account.type,
    account.currency.trim().toUpperCase(),
  ].join("|");
};

export const reconcileWorkspaceData = async (workspaceId: string): Promise<WorkspaceReconciliationIssue[]> => {
  const issues: WorkspaceReconciliationIssue[] = [];

  const [accounts, orphanedTransactions, stuckImports] = await Promise.all([
    prisma.account.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        institution: true,
        accountNumber: true,
        type: true,
        currency: true,
        balance: true,
        _count: {
          select: {
            transactions: {
              where: { deletedAt: null },
            },
          },
        },
      },
    }),
    prisma.$queryRaw<Array<{ id: string; accountId: string }>>`
      SELECT t."id", t."accountId"
      FROM "Transaction" t
      LEFT JOIN "Account" a ON a."id" = t."accountId"
      WHERE t."workspaceId" = ${workspaceId}
        AND t."deletedAt" IS NULL
        AND a."id" IS NULL
      LIMIT 100
    `,
    prisma.importFile.findMany({
      where: {
        workspaceId,
        status: "processing",
        updatedAt: {
          lt: new Date(Date.now() - 30 * 60 * 1000),
        },
      },
      select: {
        id: true,
        fileName: true,
        processingPhase: true,
        updatedAt: true,
      },
      take: 100,
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  for (const account of accounts) {
    const balance = Number(account.balance ?? 0);
    if (account._count.transactions === 0 && Number.isFinite(balance) && Math.abs(balance) > 0.009) {
      issues.push({
        type: "account_without_transactions_nonzero_balance",
        severity: "info",
        message: `${account.name} has a nonzero balance but no linked transactions.`,
        entityIds: [account.id],
      });
    }
  }

  const accountsByIdentity = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const key = accountIdentityKey(account);
    const group = accountsByIdentity.get(key) ?? [];
    group.push(account);
    accountsByIdentity.set(key, group);
  }
  for (const group of accountsByIdentity.values()) {
    if (group.length > 1) {
      issues.push({
        type: "duplicate_account_identity",
        severity: "warning",
        message: `${group.length} accounts appear to share the same institution, type, currency, and account digits.`,
        entityIds: group.map((account) => account.id),
      });
    }
  }

  for (const transaction of orphanedTransactions) {
    issues.push({
      type: "transaction_linked_to_deleted_account",
      severity: "critical",
      message: "A transaction is linked to an account that no longer exists.",
      entityIds: [transaction.id, transaction.accountId],
    });
  }

  const mismatchedCategoryRows = await prisma.transaction.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      category: {
        isNot: null,
      },
    },
    select: {
      id: true,
      type: true,
      category: {
        select: {
          name: true,
          type: true,
        },
      },
    },
    take: 250,
  });
  for (const transaction of mismatchedCategoryRows) {
    if (transaction.category && transaction.category.type !== transaction.type) {
      issues.push({
        type: "category_type_mismatch",
        severity: "warning",
        message: `${transaction.category.name} is typed as ${transaction.category.type}, but the transaction is ${transaction.type}.`,
        entityIds: [transaction.id],
      });
    }
  }

  for (const importFile of stuckImports) {
    issues.push({
      type: "stuck_import",
      severity: "warning",
      message: `${importFile.fileName} has been processing for more than 30 minutes${importFile.processingPhase ? ` (${importFile.processingPhase})` : ""}.`,
      entityIds: [importFile.id],
    });
  }

  return issues;
};
