type TransactionRelationSnapshot = {
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
};

type AccountOption = {
  id: string;
  name: string;
};

type CategoryOption = {
  id: string;
  name: string;
};

type EditableInlineRelationField = "accountId" | "categoryId";

export const buildTransactionInlineRelationPatches = (params: {
  transaction: TransactionRelationSnapshot;
  field: EditableInlineRelationField;
  value: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) => {
  const { transaction, field, value, accounts, categories } = params;
  const nextPatch: Partial<TransactionRelationSnapshot> = {};
  const rollbackPatch: Partial<TransactionRelationSnapshot> = {
    accountId: transaction.accountId,
    accountName: transaction.accountName,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
  };

  if (field === "accountId") {
    nextPatch.accountId = value;
    nextPatch.accountName = accounts.find((account) => account.id === value)?.name ?? transaction.accountName;
  }

  if (field === "categoryId") {
    nextPatch.categoryId = value || null;
    nextPatch.categoryName =
      categories.find((category) => category.id === value)?.name ?? (value ? transaction.categoryName : null);
  }

  return {
    nextPatch,
    rollbackPatch,
  };
};
