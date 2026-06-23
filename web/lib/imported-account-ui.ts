import type { AccountType } from "@/lib/domain-types";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import {
  findBestImportedAccountMatch,
  matchesImportedAccountIdentity,
  mergeImportedWorkspaceTransactions,
  normalizeImportedAccountKey,
} from "@/lib/workspace-cache";
import { getImportedAccountLastFour } from "@/lib/imported-account-identity";

type SupportedAccountType = AccountType | string;

export type ImportedAccountLike<TType extends SupportedAccountType = SupportedAccountType> = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber?: string | null;
  type: TType;
  currency: string;
  source?: string | null;
  balance?: string | null;
};

export type ImportedTransactionLike<TType extends SupportedAccountType = SupportedAccountType> = {
  accountId: string;
  accountName?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
  type?: TType | null;
};

export const normalizeImportedInstitutionKey = (value?: string | null) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\bunion\s*bank(?:\s+of\s+the\s+philippines)?\b/g, "unionbank")
    .replace(/\bchina\s+bank\b/g, "chinabank")
    .replace(/\bmetro\s+bank\b/g, "metrobank")
    .replace(/\bphilippine\s+national\s+bank\b/g, "pnb")
    .replace(/\s+\d{4}$/, "")
    .trim();

export const getImportedInstitutionShadowKey = (account: Pick<ImportedAccountLike, "institution" | "name">) =>
  normalizeImportedInstitutionKey(account.institution) || normalizeImportedInstitutionKey(account.name);

export const isGenericUploadedImportAccount = (account: Pick<ImportedAccountLike, "source" | "accountNumber" | "institution" | "name">) => {
  if (account.source !== "upload" || getImportedAccountLastFour(account.accountNumber)) {
    return false;
  }

  const institution = getImportedInstitutionShadowKey(account);
  const name = normalizeImportedInstitutionKey(account.name);
  return Boolean(institution && (name === institution || name === `${institution} account` || !name));
};

export const isGenericUploadedAccountShadowed = <
  TAccount extends Pick<ImportedAccountLike, "source" | "accountNumber" | "institution" | "name">
>(
  account: TAccount,
  numberedAccounts: TAccount[]
) => {
  if (!isGenericUploadedImportAccount(account)) {
    return false;
  }

  const institution = getImportedInstitutionShadowKey(account);
  return numberedAccounts.some(
    (numberedAccount) =>
      numberedAccount.source === "upload" &&
      getImportedAccountLastFour(numberedAccount.accountNumber) &&
      getImportedInstitutionShadowKey(numberedAccount) === institution
  );
};

export const isTransientUploadedAccountPlaceholder = (account: Pick<ImportedAccountLike, "source" | "accountNumber" | "type">) => {
  if (account.source !== "upload" || getImportedAccountLastFour(account.accountNumber)) {
    return false;
  }

  return account.type === "bank" || account.type === "credit_card" || account.type === "line_of_credit";
};

export const resolvePersistedImportedAccountId = <TAccount extends ImportedAccountLike>(
  summary: UploadInsightsSummary,
  accounts: TAccount[],
  inferredType: TAccount["type"],
  includeCurrency = false
) => {
  const importedAccount = findBestImportedAccountMatch(
    accounts.filter((account) => !account.id.startsWith("optimistic-")),
    {
      name: summary.accountName,
      institution: summary.institution,
      accountNumber: summary.accountNumber ?? null,
      type: inferredType,
      currency: includeCurrency ? (summary.previewTransactions?.[0]?.currency ?? null) : null,
    }
  );

  return importedAccount?.id ?? null;
};

export const mergeImportedPreviewTransactions = <TTransaction extends Record<string, unknown>>(
  currentTransactions: TTransaction[],
  previewTransactions: NonNullable<UploadInsightsSummary["previewTransactions"]>
) => {
  if (previewTransactions.length === 0) {
    return currentTransactions;
  }

  return mergeImportedWorkspaceTransactions(currentTransactions, previewTransactions);
};

export const transactionMatchesImportedAccount = <
  TTransaction extends ImportedTransactionLike,
  TAccount extends ImportedAccountLike
>(
  transaction: TTransaction,
  account: TAccount
) => {
  if (transaction.accountId === account.id) {
    return true;
  }

  return (
    normalizeImportedAccountKey(
      transaction.accountName,
      transaction.institution,
      transaction.accountNumber,
      account.type,
      transaction.currency
    ) ===
    normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency)
  );
};

export const mergeAccountsWithOptimisticImports = <TAccount extends ImportedAccountLike>(
  fetchedAccounts: TAccount[],
  currentAccounts: TAccount[],
  options?: {
    deletedAccountIds?: Set<string>;
    preserveNonZeroOptimisticBalance?: boolean;
  }
) => {
  const deletedAccountIds = options?.deletedAccountIds ?? new Set<string>();
  const visibleFetchedAccounts = fetchedAccounts.filter((account) => !deletedAccountIds.has(account.id));
  const visibleCurrentAccounts = currentAccounts.filter((account) => !deletedAccountIds.has(account.id));
  const fetchedById = new Map(visibleFetchedAccounts.map((account) => [account.id, account] as const));
  const fetchedByKey = new Map(
    visibleFetchedAccounts.map(
      (account) =>
        [normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency), account] as const
    )
  );

  const mergedFetchedAccounts = visibleFetchedAccounts.map((account) => {
    const optimistic = visibleCurrentAccounts.find((currentAccount) => {
      if (currentAccount.source !== "upload") {
        return false;
      }

      return matchesImportedAccountIdentity(currentAccount, account);
    });

    if (!optimistic) {
      return account;
    }

    if (!options?.preserveNonZeroOptimisticBalance) {
      return {
        ...account,
        balance: account.balance && Number(account.balance) !== 0 ? account.balance : optimistic.balance ?? account.balance,
        source: optimistic.source ?? account.source,
      };
    }

    const optimisticBalance = typeof optimistic.balance === "string" ? optimistic.balance.trim() : "";
    const accountBalance = typeof account.balance === "string" ? account.balance.trim() : "";
    const optimisticBalanceValue = optimisticBalance ? Number(optimisticBalance) : Number.NaN;
    const accountBalanceValue = accountBalance ? Number(accountBalance) : Number.NaN;
    const shouldPreserveExistingBalance =
      Number.isFinite(optimisticBalanceValue) && optimisticBalanceValue !== 0 && (!Number.isFinite(accountBalanceValue) || accountBalanceValue === 0);

    return {
      ...account,
      balance: shouldPreserveExistingBalance ? optimistic.balance : account.balance && Number(account.balance) !== 0 ? account.balance : optimistic.balance ?? account.balance,
      source: optimistic.source ?? account.source,
    };
  });

  const preservedCurrentAccounts = visibleCurrentAccounts.filter((account) => {
    if (account.source === "upload") {
      return false;
    }

    const accountKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency);
    return !fetchedById.has(account.id) && !fetchedByKey.has(accountKey);
  });

  const optimisticAccounts = visibleCurrentAccounts.filter((account) => {
    if (account.source !== "upload") {
      return false;
    }

    if (isTransientUploadedAccountPlaceholder(account)) {
      return false;
    }

    if (isGenericUploadedAccountShadowed(account, visibleFetchedAccounts)) {
      return false;
    }

    const accountKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency);
    return !fetchedById.has(account.id) && !visibleFetchedAccounts.some((fetchedAccount) => matchesImportedAccountIdentity(account, fetchedAccount)) && !fetchedByKey.has(accountKey);
  });

  return [...preservedCurrentAccounts, ...optimisticAccounts, ...mergedFetchedAccounts];
};
