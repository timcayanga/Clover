import { isPendingBankSelection } from "../../shared/finverse-lifecycle";

import { finverseConnectorIdentity } from "../../shared/finverse-bank-options";
import { getAccountBrand } from "./account-brand";
import { findAdditionalBankLogo } from "./bank-logo-catalog";
import { FINVERSE_COUNTRIES } from "../../shared/finverse-countries";

export function finverseBankPresentation(bank: { id?: string; name: string; countries: string[] }) {
  const shortName = bank.name.replace(/\bciti(?:direct)?\b/gi, "Citibank")
    .replace(/\b(?:personal|business|corporate|retail|online|internet|banking)\b/gi, "")
    .replace(/\(\s*\)/g, "").replace(/\s*[-–—|:]\s*$/g, "").replace(/\s+/g, " ").trim();
  const brand = getAccountBrand({ institution: shortName, type: "bank" });
  const bankLogo = brand.logoSrc || brand.logoSrcs?.[0];
  const logoUrls: Record<string, string> = {};
  for (const code of bank.countries) {
    const country = FINVERSE_COUNTRIES.find(c => c.code === code);
    const regional = findAdditionalBankLogo(`${shortName} ${country?.name ?? ""}`);
    logoUrls[code] = regional?.src || bankLogo || brand.fallbackIconSrc;
  }
  const identity = finverseConnectorIdentity(bank.id || bank.name, bank.name);
  const accountType = identity.accessType === "Bank access" ? undefined : `${identity.accessType} accounts`;
  const accountTypes = Object.fromEntries(bank.countries.map(country => [country, accountType || "Bank access"]));
  return { ...identity, accountType, accountTypes, name: identity.brandName || (bankLogo ? brand.label : shortName), logoUrl: logoUrls[bank.countries[0]] || bankLogo || brand.fallbackIconSrc, logoUrls };
}

type PendingAttempt = {
  id: string;
  workspaceId: string;
  institutionId: string | null;
  institutionName: string | null;
  loginIdentityId: string | null;
  rawLoginIdentity: unknown;
  status: string;
  createdAt: Date;
  stateExpiresAt?: Date | null;
  lastSyncedAt: Date | null;
  disconnectRequestedAt: Date | null;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
};

const unknownBank = /^(?:your bank|linked bank|bank|unknown(?: bank)?)$/i;

export function pendingBankAttempts<T extends PendingAttempt>(
  attempts: readonly T[],
  hasLinkedAccounts: (attempt: T) => boolean,
  activeAuthorizationAt?: Date,
) {
  const seen = new Set<string>();
  const seenBanks = new Set<string>();
  const rank = (status: string) => status === "awaiting_selection" ? 0 : status === "error" ? 2 : 1;
  return [...attempts].sort((a, b) => rank(a.status) - rank(b.status) || +b.createdAt - +a.createdAt)
    .flatMap(attempt => {
      const authorized = Boolean(attempt.encryptedAccessToken || attempt.encryptedRefreshToken);
      const authorizing = activeAuthorizationAt && attempt.stateExpiresAt &&
        attempt.stateExpiresAt > activeAuthorizationAt &&
        (attempt.status === "link_pending" || attempt.status === "authorizing");
      if (attempt.disconnectRequestedAt || (!authorized && !authorizing)
        || !isPendingBankSelection(attempt.status, hasLinkedAccounts(attempt), attempt.lastSyncedAt)) return [];
      const raw = attempt.rawLoginIdentity as { institution?: { institution_name?: unknown; institution_id?: unknown } } | null;
      const providerName = raw?.institution?.institution_name;
      const providerId = raw?.institution?.institution_id;
      const name = [attempt.institutionName, providerName].find((value): value is string =>
        typeof value === "string" && Boolean(value.trim()) && !unknownBank.test(value.trim()));
      if (!name) return [];
      const id = attempt.institutionId || (typeof providerId === "string" ? providerId : undefined);
      const identity = `${attempt.workspaceId}:${attempt.loginIdentityId || attempt.id}`;
      if (seen.has(identity)) return [];
      const bank = finverseBankPresentation({ id, name, countries: [] });
      const bankKey = `${attempt.workspaceId}:${(bank.brandName || name).trim().toLowerCase()}`;
      if ((!authorized || attempt.status === "error") && seenBanks.has(bankKey)) return [];
      seen.add(identity);
      seenBanks.add(bankKey);
      return [{ id: attempt.id, workspaceId: attempt.workspaceId, name: bank.name || name, logoUrl: bank.logoUrl, status: attempt.status, createdAt: attempt.createdAt }];
    });
}
