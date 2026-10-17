import { MERCHANT_LOGO_REVISION } from "./merchant-logo-revision";
import { asIdentityRecord, merchantIdentityInputKey } from "./merchant-identity-context";
import type { MerchantIdentityInput } from "./logo-identity-types";

/** Compact presentation metadata only; the native response never exposes the evidence payload. */
export function transactionMerchantLogo(row: MerchantIdentityInput) {
  const stored = asIdentityRecord(asIdentityRecord(row.normalizedPayload).merchantIdentity);
  // Other mobile routes share this projector. Load the research catalog only
  // when a transaction actually needs fresh matching, never during Home bootstrap.
  const result = stored.inputKey === merchantIdentityInputKey(row) && String(stored.version).endsWith(`.${MERCHANT_LOGO_REVISION}`) ? stored
    : (require("./merchant-identity") as typeof import("./merchant-identity")).resolveMerchantIdentity(row);
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const candidate = asIdentityRecord(candidates.find(c => asIdentityRecord(c).entryId === result.entryId));
  const path = result.logoPath;
  const valid = result.status === "suggested" && typeof result.confidence === "number" && Number.isFinite(result.confidence)
    && result.confidence >= 84 && typeof candidate.confidence === "number" && candidate.confidence >= 84 && Array.isArray(candidate.conflicts) && !candidate.conflicts.length
    && typeof path === "string" && path.startsWith("/assets/") && !path.includes("..");
  return { merchantLogoUrl: valid ? path : null,
    ...(valid ? { merchantLogoNameKey: JSON.stringify([row.merchantRaw ?? null, row.merchantClean ?? null]) } : {}) };
}
