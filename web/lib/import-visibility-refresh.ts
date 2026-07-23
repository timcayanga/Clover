import type { AccountType } from "@/lib/domain-types";

/**
 * Account-only imports have no transaction row that can prove they reached the
 * Accounts page. They need a second authoritative read after confirmation so
 * the success state is never shown ahead of the persisted account card.
 */
export const requiresAccountVisibilityRetry = (
  accountType: AccountType | string | null | undefined,
  previewTransactionCount: number
) =>
  previewTransactionCount === 0 &&
  (accountType === "investment" || accountType === "bank" || accountType === "wallet");
