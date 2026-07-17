import { recordAccountTombstones } from "@/lib/account-tombstones";

type DeleteAccountArtifactsOptions = {
  workspaceId: string;
  accountIds: string[];
  includeWorkspaceImportArtifacts?: boolean;
};

type DeleteAccountArtifactsResult = {
  accountsDeleted: number;
  transactionsDeleted: number;
};

const inList = (values: string[]) => ({ in: values });

export const deleteWorkspaceTransactions = async (tx: any, where: Record<string, unknown>) => {
  const transactions = (await tx.transaction.findMany({
    where,
    select: { id: true },
  })) as Array<{ id: string }>;
  const transactionIds = transactions.map((transaction: { id: string }) => transaction.id);

  if (transactionIds.length === 0) {
    return 0;
  }

  const transactionIdFilter = inList(transactionIds);

  await tx.financialCommitment.updateMany({
    where: { transactionId: transactionIdFilter },
    data: { transactionId: null },
  });
  await tx.receiptDocument.updateMany({
    where: { transactionId: transactionIdFilter },
    data: { transactionId: null },
  });
  await tx.splitBill.updateMany({
    where: { transactionId: transactionIdFilter },
    data: { transactionId: null },
  });
  await tx.trainingSignal.updateMany({
    where: { transactionId: transactionIdFilter },
    data: { transactionId: null },
  });
  await tx.dataQaFinding.updateMany({
    where: { transactionId: transactionIdFilter },
    data: { transactionId: null },
  });

  const deletedTransactions = await tx.transaction.deleteMany({
    where: { id: transactionIdFilter },
  });

  return deletedTransactions.count;
};

export const deleteOrphanedWorkspaceTransactions = async (tx: any, workspaceId: string) => {
  if (!workspaceId) {
    return 0;
  }

  const orphanedTransactions = (await tx.$queryRaw<Array<{ id: string }>>`
    SELECT t."id"
    FROM "Transaction" t
    WHERE t."workspaceId" = ${workspaceId}
      AND NOT EXISTS (
        SELECT 1
        FROM "Account" a
        WHERE a."id" = t."accountId"
      )
  `) as Array<{ id: string }>;

  return deleteWorkspaceTransactions(tx, {
    workspaceId,
    id: inList(orphanedTransactions.map((transaction) => transaction.id)),
  });
};

export const deleteAccountsAndImportArtifacts = async (
  tx: any,
  { workspaceId, accountIds, includeWorkspaceImportArtifacts = false }: DeleteAccountArtifactsOptions
): Promise<DeleteAccountArtifactsResult> => {
  const uniqueAccountIds = Array.from(new Set(accountIds.filter(Boolean)));
  if (!workspaceId || (uniqueAccountIds.length === 0 && !includeWorkspaceImportArtifacts)) {
    return { accountsDeleted: 0, transactionsDeleted: 0 };
  }

  const accountIdFilter = inList(uniqueAccountIds);
  const accountsToDelete =
    uniqueAccountIds.length > 0
      ? await tx.account.findMany({
          where: {
            workspaceId,
            id: accountIdFilter,
          },
          select: {
            id: true,
            name: true,
            institution: true,
            accountNumber: true,
            type: true,
            currency: true,
            source: true,
          },
        })
      : [];
  if (!includeWorkspaceImportArtifacts) {
    await recordAccountTombstones(tx, {
      workspaceId,
      accounts: accountsToDelete,
      reason: "account_deleted",
    });
  }

  const importFileWhere = includeWorkspaceImportArtifacts
    ? { workspaceId }
    : { workspaceId, accountId: accountIdFilter };
  const directImportFiles = await tx.importFile.findMany({
    where: importFileWhere,
    select: { id: true },
  });
  const importFileIds = new Set<string>(directImportFiles.map((importFile: { id: string }) => importFile.id));

  if (!includeWorkspaceImportArtifacts && uniqueAccountIds.length > 0) {
    const transactionImportFiles = await tx.transaction.findMany({
      where: {
        workspaceId,
        accountId: accountIdFilter,
        importFileId: { not: null },
      },
      select: { importFileId: true },
    });

    for (const transaction of transactionImportFiles as Array<{ importFileId: string | null }>) {
      if (transaction.importFileId) {
        importFileIds.add(transaction.importFileId);
      }
    }
  }

  const relatedImportFileIds = () => Array.from(importFileIds);

  const documentImportWhere = includeWorkspaceImportArtifacts
    ? { workspaceId }
    : {
        workspaceId,
        OR: [
          { accountId: accountIdFilter },
          ...(relatedImportFileIds().length > 0 ? [{ importFileId: inList(relatedImportFileIds()) }] : []),
        ],
      };
  const documentImports = await tx.documentImport.findMany({
    where: documentImportWhere,
    select: { id: true, importFileId: true },
  });
  const documentImportIds = documentImports.map((documentImport: { id: string }) => documentImport.id);
  for (const documentImport of documentImports as Array<{ importFileId: string | null }>) {
    if (documentImport.importFileId) {
      importFileIds.add(documentImport.importFileId);
    }
  }

  const checkpointWhere = includeWorkspaceImportArtifacts
    ? { workspaceId }
    : {
        workspaceId,
        OR: [
          { accountId: accountIdFilter },
          ...(relatedImportFileIds().length > 0 ? [{ importFileId: inList(relatedImportFileIds()) }] : []),
        ],
      };
  const checkpoints = await tx.accountStatementCheckpoint.findMany({
    where: checkpointWhere,
    select: { id: true, importFileId: true },
  });
  const checkpointIds = checkpoints.map((checkpoint: { id: string }) => checkpoint.id);
  for (const checkpoint of checkpoints as Array<{ importFileId: string | null }>) {
    if (checkpoint.importFileId) {
      importFileIds.add(checkpoint.importFileId);
    }
  }

  const importFileDeleteWhere = includeWorkspaceImportArtifacts
    ? { workspaceId }
    : relatedImportFileIds().length > 0
      ? { workspaceId, id: inList(relatedImportFileIds()) }
      : importFileWhere;

  const deletedTransactionCount = includeWorkspaceImportArtifacts
    ? await deleteWorkspaceTransactions(tx, {
        workspaceId,
      })
    : await deleteWorkspaceTransactions(tx, {
        workspaceId,
        OR: [
          { accountId: accountIdFilter },
          ...(relatedImportFileIds().length > 0 ? [{ importFileId: inList(relatedImportFileIds()) }] : []),
        ],
      });

  await tx.financialCommitment.deleteMany({
    where: {
      workspaceId,
      OR: [
        { accountId: accountIdFilter },
        ...(checkpointIds.length > 0 ? [{ statementCheckpointId: inList(checkpointIds) }] : []),
      ],
    },
  });

  await tx.accountRule.deleteMany({
    where: {
      workspaceId,
      accountId: accountIdFilter,
    },
  });

  await tx.receiptDocument.deleteMany({
    where: {
      workspaceId,
      OR: [
        { accountId: accountIdFilter },
        ...(documentImportIds.length > 0 ? [{ documentImportId: inList(documentImportIds) }] : []),
      ],
    },
  });

  await tx.recurringPattern.deleteMany({
    where: {
      workspaceId,
      OR: [
        { accountId: accountIdFilter },
        ...(documentImportIds.length > 0 ? [{ documentImportId: inList(documentImportIds) }] : []),
      ],
    },
  });

  await tx.investmentHolding.deleteMany({
    where: {
      workspaceId,
      OR: [
        { accountId: accountIdFilter },
        ...(documentImportIds.length > 0 ? [{ documentImportId: inList(documentImportIds) }] : []),
      ],
    },
  });

  await tx.investmentSnapshot.deleteMany({
    where: {
      workspaceId,
      OR: [
        { accountId: accountIdFilter },
        ...(documentImportIds.length > 0 ? [{ documentImportId: inList(documentImportIds) }] : []),
      ],
    },
  });

  await tx.accountStatementCheckpoint.deleteMany({
    where: checkpointWhere,
  });

  await tx.documentImport.deleteMany({
    where: documentImportWhere,
  });

  await tx.importFile.deleteMany({
    where: importFileDeleteWhere,
  });

  const deletedAccounts = await tx.account.deleteMany({
    where: {
      workspaceId,
      id: accountIdFilter,
    },
  });
  const deletedOrphanedTransactions = await deleteOrphanedWorkspaceTransactions(tx, workspaceId);

  if (includeWorkspaceImportArtifacts) {
    await tx.accountTombstone.deleteMany({
      where: { workspaceId },
    });
  }

  return {
    accountsDeleted: deletedAccounts.count,
    transactionsDeleted: deletedTransactionCount + deletedOrphanedTransactions,
  };
};
