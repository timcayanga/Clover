import type { AccountType } from "@/lib/domain-types";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import {
  findBestImportedAccountMatch,
  matchesImportedAccountIdentity,
  mergeImportedWorkspaceTransactions,
  normalizeImportedAccountKey,
} from "@/lib/workspace-cache";
import {
  canonicalImportedInstitutionKey,
  getImportedAccountLastFour,
  type ImportedAccountIdentityLike,
} from "@/lib/imported-account-identity";

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
  publishedImportInventory?: boolean;
};

export type ImportedTransactionLike<TType extends SupportedAccountType = SupportedAccountType> = {
  accountId: string;
  accountName?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
  type?: TType | null;
};

type ImportedAccountBalanceLike = {
  balance?: string | null;
};

type UploadSummaryAccountLike = Pick<
  UploadInsightsSummary,
  "accountId" | "optimisticAccountId" | "accountName" | "institution" | "accountNumber" | "accountType" | "previewTransactions" | "optimistic"
>;

const normalizeLooseImportedValue = (value: string | null | undefined) =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const normalizeImportedInstitutionKey = canonicalImportedInstitutionKey;

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
  TAccount extends Pick<ImportedAccountLike, "source" | "accountNumber" | "institution" | "name" | "currency">
>(
  account: TAccount,
  numberedAccounts: TAccount[]
) => {
  if (!isGenericUploadedImportAccount(account)) {
    return false;
  }

  const institution = getImportedInstitutionShadowKey(account);
  const currency = String(account.currency ?? "").trim().toUpperCase();
  return numberedAccounts.some(
    (numberedAccount) =>
      numberedAccount.source === "upload" &&
      getImportedAccountLastFour(numberedAccount.accountNumber) &&
      getImportedInstitutionShadowKey(numberedAccount) === institution &&
      (!currency || !numberedAccount.currency || String(numberedAccount.currency).trim().toUpperCase() === currency)
  );
};

export const isTransientUploadedAccountPlaceholder = (
  account: Pick<ImportedAccountLike, "source" | "accountNumber" | "type" | "publishedImportInventory">
) => {
  if (account.publishedImportInventory) {
    return false;
  }

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

export const uploadSummaryCanDismissImportUi = <TAccount extends ImportedAccountLike>(
  summary: UploadInsightsSummary,
  accounts: TAccount[],
  inferredType: TAccount["type"],
  allowAccountOnlyVisibility = false
) => {
  if (summary.optimistic) {
    return false;
  }

  const persistedAccountId = resolvePersistedImportedAccountId(summary, accounts, inferredType, true);
  if (!persistedAccountId) {
    return false;
  }

  const hasVisibleRows =
    summary.rowsImported > 0 ||
    Boolean(summary.previewTransactions?.length) ||
    Boolean(summary.accountSummaries?.some((accountSummary) => accountSummary.rowsImported > 0));
  const hasVisibleAccountSummary = Boolean(
    summary.accountSummaries?.some((accountSummary) => accountSummary.accountId === persistedAccountId)
  );

  return hasVisibleRows || (allowAccountOnlyVisibility && hasVisibleAccountSummary);
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

export const mergeFetchedTransactionsPreservingImported = <TTransaction extends Record<string, unknown>>(
  fetchedTransactions: TTransaction[],
  currentImportedTransactions: TTransaction[],
  options?: { exactServerTotalCount?: number | null }
) => {
  const exactServerTotalCount = Number(options?.exactServerTotalCount ?? fetchedTransactions.length);
  const serverResponseIsPartial =
    Number.isFinite(exactServerTotalCount) && exactServerTotalCount > fetchedTransactions.length;
  const transactionsToPreserve = serverResponseIsPartial ? currentImportedTransactions : [];

  return mergeImportedWorkspaceTransactions(
    transactionsToPreserve,
    fetchedTransactions as Parameters<typeof mergeImportedWorkspaceTransactions>[1]
  ) as TTransaction[];
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

export const uploadSummaryMatchesImportedAccount = <
  TSummary extends UploadSummaryAccountLike,
  TAccount extends ImportedAccountLike
>(
  summary: TSummary,
  account: TAccount
) => {
  if (summary.accountId === account.id || summary.optimisticAccountId === account.id) {
    return true;
  }

  const summaryKey = normalizeImportedAccountKey(
    summary.accountName,
    summary.institution,
    summary.accountNumber ?? null,
    summary.accountType ?? account.type,
    summary.previewTransactions?.[0]?.currency ?? null
  );
  const accountKey = normalizeImportedAccountKey(
    account.name,
    account.institution,
    account.accountNumber,
    account.type,
    account.currency
  );
  if (summaryKey === accountKey) {
    return true;
  }

  if (!summary.optimistic && !account.id.startsWith("optimistic-")) {
    return false;
  }

  const summaryInstitution = normalizeImportedInstitutionKey(summary.institution);
  const accountInstitution = normalizeImportedInstitutionKey(account.institution);
  if (!summaryInstitution || !accountInstitution || summaryInstitution !== accountInstitution) {
    return false;
  }

  const summaryAccountNumber = normalizeLooseImportedValue(summary.accountNumber);
  const accountAccountNumber = normalizeLooseImportedValue(account.accountNumber);
  const accountName = normalizeLooseImportedValue(account.name);
  const summaryLastFour = summaryAccountNumber.slice(-4);
  const accountLastFour = accountAccountNumber.slice(-4);

  return Boolean(
    (summaryAccountNumber && accountAccountNumber && summaryAccountNumber === accountAccountNumber) ||
      (summaryLastFour.length === 4 && accountName.includes(summaryLastFour)) ||
      (accountLastFour.length === 4 && normalizeLooseImportedValue(summary.accountName).includes(accountLastFour)) ||
      (!summaryAccountNumber && !accountAccountNumber)
  );
};

export const mergeOptimisticImportedAccount = <
  TAccount extends ImportedAccountLike & ImportedAccountBalanceLike
>(
  currentAccounts: TAccount[],
  optimisticAccount: TAccount,
  options?: {
    authoritativeBalance?: boolean;
    mergeMatchedAccount?: (
      matchedAccount: TAccount,
      optimisticAccount: TAccount,
      shouldPreserveExistingBalance: boolean
    ) => TAccount;
  }
) => {
  if (isTransientUploadedAccountPlaceholder(optimisticAccount)) {
    return currentAccounts.filter((account) => !isGenericUploadedAccountShadowed(account, [optimisticAccount]));
  }

  const matchedAccounts = currentAccounts.filter((account) => {
    if (account.id === optimisticAccount.id) {
      return true;
    }

    if (account.source !== "upload") {
      return false;
    }

    return matchesImportedAccountIdentity(account as ImportedAccountIdentityLike, optimisticAccount as ImportedAccountIdentityLike);
  });

  const matchedAccount = matchedAccounts[0] ?? null;
  const existingBalance = typeof matchedAccount?.balance === "string" ? matchedAccount.balance.trim() : "";
  const optimisticBalance = typeof optimisticAccount.balance === "string" ? optimisticAccount.balance.trim() : "";
  const shouldPreserveExistingBalance =
    options?.authoritativeBalance !== true &&
    existingBalance !== "" &&
    Number(existingBalance) !== 0 &&
    (optimisticBalance === "" || Number(optimisticBalance) === 0);

  const mergedAccount = matchedAccount
    ? options?.mergeMatchedAccount?.(matchedAccount, optimisticAccount, shouldPreserveExistingBalance) ??
      ({
        ...matchedAccount,
        ...optimisticAccount,
        balance: shouldPreserveExistingBalance ? matchedAccount.balance : optimisticAccount.balance ?? matchedAccount.balance,
      } as TAccount)
    : optimisticAccount;

  const remainingAccounts = currentAccounts.filter((account) => {
    if (account.id === optimisticAccount.id) {
      return false;
    }

    if (account.source !== "upload") {
      return true;
    }

    if (isGenericUploadedAccountShadowed(account, [optimisticAccount])) {
      return false;
    }

    return !matchesImportedAccountIdentity(account as ImportedAccountIdentityLike, optimisticAccount as ImportedAccountIdentityLike);
  });

  return [mergedAccount, ...remainingAccounts];
};

export const mergeAccountsWithOptimisticImports = <TAccount extends ImportedAccountLike>(
  fetchedAccounts: TAccount[],
  currentAccounts: TAccount[],
  options?: {
    deletedAccountIds?: Set<string>;
    preserveNonZeroOptimisticBalance?: boolean;
    preserveCurrentInventory?: boolean;
    preserveCurrentAccountIds?: Set<string>;
    preferCurrentImportedSnapshot?: boolean;
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

    if (options?.preferCurrentImportedSnapshot) {
      return {
        ...account,
        name: optimistic.name || account.name,
        institution: optimistic.institution || account.institution,
        accountNumber: optimistic.accountNumber || account.accountNumber,
        type: optimistic.type || account.type,
        currency: optimistic.currency || account.currency,
        balance: optimistic.balance ?? account.balance,
        source: optimistic.source ?? account.source,
      };
    }

    if (!options?.preserveNonZeroOptimisticBalance) {
      return {
        ...account,
        balance: account.balance ?? optimistic.balance,
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
    if (account.source === "upload" || !account.id.startsWith("optimistic-")) {
      return false;
    }

    const accountKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency);
    return !fetchedById.has(account.id) && !fetchedByKey.has(accountKey);
  });

  const optimisticAccounts = visibleCurrentAccounts.filter((account) => {
    if (account.source !== "upload") {
      return false;
    }

    const isActiveImportProjection =
      account.id.startsWith("optimistic-") || options?.preserveCurrentAccountIds?.has(account.id) === true;
    if (!isActiveImportProjection) {
      return false;
    }

    if (!options?.preserveCurrentInventory && isTransientUploadedAccountPlaceholder(account)) {
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
