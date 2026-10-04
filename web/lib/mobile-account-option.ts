import { getAccountBrand } from "./account-brand";

type AccountOption = {
  id: string; name: string; currency: string; institution: string | null; type: string;
  logoUrl?: string | null; _count?: { transactions: number };
};

/** Shared picker projection, with the same saved-logo override as the account cards. */
export function mobileAccountOption(account: AccountOption) {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    institution: account.institution,
    type: account.type,
    brandLogoUrl: getAccountBrand(account).logoSrc,
    ...(account._count ? { transactionCount: account._count.transactions } : {}),
  };
}
