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
  const importFiles = await tx.importFile.findMany({
    where: importFileWhere,
    select: { id: true },
  });
  const importFileIds = importFiles.map((importFile: { id: string }) => importFile.id);

  const documentImportWhere = includeWorkspaceImportArtifacts
    ? { workspaceId }
    : {
        workspaceId,
        OR: [
          { accountId: accountIdFilter },
          ...(importFileIds.length > 0 ? [{ importFileId: inList(importFileIds) }] : []),
        ],
      };
  const documentImports = await tx.documentImport.findMany({
    where: documentImportWhere,
    select: { id: true },
  });
  const documentImportIds = documentImports.map((documentImport: { id: string }) => documentImport.id);

  const checkpointWhere = includeWorkspaceImportArtifacts
    ? { workspaceId }
    : {
        workspaceId,
        OR: [
          { accountId: accountIdFilter },
          ...(importFileIds.length > 0 ? [{ importFileId: inList(importFileIds) }] : []),
        ],
      };
  const checkpoints = await tx.accountStatementCheckpoint.findMany({
    where: checkpointWhere,
    select: { id: true },
  });
  const checkpointIds = checkpoints.map((checkpoint: { id: string }) => checkpoint.id);

  await tx.transaction.deleteMany({
    where: {
      workspaceId,
      accountId: accountIdFilter,
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
    where: importFileWhere,
  });

  await tx.account.deleteMany({
    where: {
      workspaceId,
      id: accountIdFilter,
    },
  });
};
