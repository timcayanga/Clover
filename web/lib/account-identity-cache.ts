export type AccountIdentityCache = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  imageUrl?: string | null;
};

export const ACCOUNT_IDENTITY_CACHE_KEY = "clover.settings.account-identity.v1";

export const readAccountIdentityCache = (): AccountIdentityCache | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ACCOUNT_IDENTITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountIdentityCache;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const writeAccountIdentityCache = (identity: AccountIdentityCache) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ACCOUNT_IDENTITY_CACHE_KEY, JSON.stringify(identity));
  } catch {
    // Ignore storage failures and keep the live identity state in memory.
  }
};
