export const LUXURY_ACCOUNT_CARD_STYLES = [
  "guilloche",
  "architectural",
  "faceted",
  "orbit",
  "pinstripe",
  "topographic",
  "ribbon",
  "monogram",
  "brushed",
  "prism",
  "contour-arc",
  "offset-orbit",
  "sculpted-petal",
  "wave-relief",
  "precision-frame",
  "layered-horizon",
  "angular-lattice",
  "circuit-line",
  "embossed-curve",
  "split-facet",
] as const;

const LUXURY_ACCOUNT_CARD_PREVIEW_EMAILS = new Set(["timcayanga@gmail.com"]);

export const isLuxuryAccountCardPreviewEmail = (email: string | null | undefined) =>
  Boolean(email && LUXURY_ACCOUNT_CARD_PREVIEW_EMAILS.has(email.trim().toLowerCase()));

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getLuxuryAccountCardClass = (accountIdentity: string) => {
  const style = LUXURY_ACCOUNT_CARD_STYLES[stableHash(accountIdentity) % LUXURY_ACCOUNT_CARD_STYLES.length];
  return `luxury-account-card luxury-account-card--${style}`;
};
