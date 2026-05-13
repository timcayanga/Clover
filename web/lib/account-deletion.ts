type DeleteAccountArtifactsOptions = {
  workspaceId: string;
  accountIds: string[];
  includeWorkspaceImportArtifacts?: boolean;
};

const inList = (values: string[]) => ({ in: values });

export const deleteAccountsAndImportArtifacts = async (
  tx: any,
  { workspaceId, accountIds, includeWorkspaceImportArtifacts = false }: DeleteAccountArtifactsOptions
) => {
  const uniqueAccountIds = Array.from(new Set(accountIds.filter(Boolean)));
  if (!workspaceId || (uniqueAccountIds.length === 0 && !includeWorkspaceImportArtifacts)) {
    return;
  }

  const accountIdFilter = inList(uniqueAccountIds);
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

  await tx.transaction.deleteMany({
    where: {
      workspaceId,
      OR: [
        { accountId: accountIdFilter },
        ...(relatedImportFileIds().length > 0 ? [{ importFileId: inList(relatedImportFileIds()) }] : []),
      ],
    },
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

  await tx.account.deleteMany({
    where: {
      workspaceId,
      id: accountIdFilter,
    },
  });
};
