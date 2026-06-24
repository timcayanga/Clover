import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { getCachedAccountsWorkspace, findCachedTransactionsForAccount } from "@/lib/workspace-cache";
import { extractLastFourDigits, importedAccountIdentityKey } from "@/lib/import-statement-identity";
import { pickStableBalance } from "@/lib/import-upload-summary";
import type { UploadAccountType } from "@/lib/import-optimistic-summary";

type AccountOption = {
  id: string;
  name: string;
  institution: string | null;
  accountNumber?: string | null;
  balance?: string | null;
  currency?: string | null;
  type: string;
};

export const findKnownImportedBalance = (
  accounts: AccountOption[],
  params: {
    workspaceId?: string | null;
    accountId?: string | null;
    accountName?: string | null;
    institution?: string | null;
    accountNumber?: string | null;
    accountType?: UploadAccountType;
  }
) => {
  const cachedAccounts: AccountOption[] = params.workspaceId
    ? ((getCachedAccountsWorkspace(params.workspaceId)?.accounts ?? []) as AccountOption[])
    : [];
  const candidateAccounts = [...cachedAccounts, ...accounts];
  const normalizedName = params.accountName
    ? formatUploadAccountDisplayName(
        params.accountName,
        params.institution ?? null,
        params.accountNumber ?? null,
        params.accountType ?? null
      )
    : null;
  const targetIdentityKey = normalizedName
    ? importedAccountIdentityKey(normalizedName, params.institution ?? null, params.accountNumber ?? null)
    : null;
  const targetInstitution = (params.institution ?? "").trim().toLowerCase();
  const targetLastFour = extractLastFourDigits(params.accountNumber ?? normalizedName ?? null);

  const matched = candidateAccounts.find((account) => {
    if (params.accountId && account.id === params.accountId) {
      return true;
    }

    const accountIdentityKey = importedAccountIdentityKey(
      typeof account.name === "string" ? account.name : null,
      typeof account.institution === "string" ? account.institution : null,
      typeof account.accountNumber === "string" ? account.accountNumber : null
    );
    if (targetIdentityKey && accountIdentityKey === targetIdentityKey) {
      return true;
    }

    const accountInstitution = String(account.institution ?? "").trim().toLowerCase();
    const accountLastFour = extractLastFourDigits(
      typeof account.accountNumber === "string" ? account.accountNumber : typeof account.name === "string" ? account.name : null
    );

    return Boolean(
      targetInstitution &&
        accountInstitution &&
        targetInstitution === accountInstitution &&
        targetLastFour &&
        accountLastFour &&
        targetLastFour === accountLastFour
    );
  });

  return pickStableBalance((matched as { balance?: unknown } | undefined)?.balance ?? null);
};

export const getKnownPreviewTransactions = (params: {
  workspaceId: string;
  accountId: string | null;
  optimisticAccountId?: string | null;
  accountName?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  accountType?: UploadAccountType;
  previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
}) => {
  if (Array.isArray(params.previewTransactions) && params.previewTransactions.length > 0) {
    return params.previewTransactions;
  }

  if (!params.workspaceId || !params.accountId) {
    return [];
  }

  const cached = findCachedTransactionsForAccount(params.accountId, {
    workspaceId: params.workspaceId,
    optimisticAccountId: params.optimisticAccountId ?? null,
    name: params.accountName ?? null,
    institution: params.institution ?? null,
    accountNumber: params.accountNumber ?? null,
    type: params.accountType ?? null,
    currency: params.previewTransactions?.[0]?.currency ?? null,
  });

  if (!cached || !Array.isArray(cached.transactions) || cached.transactions.length === 0) {
    return [];
  }

  return cached.transactions as NonNullable<UploadInsightsSummary["previewTransactions"]>;
};
