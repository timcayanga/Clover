import type { MerchantIdentityResult, IdentityObservation } from "./logo-identity-types";

const messages: Partial<Record<IdentityObservation["field"] | "transactionDate" | "coherentIdentifierEvidence" | "verifiedOperator" | "sourceEvidence",string>> = {
  merchantCountry:"Check the merchant's country on the receipt or statement; account currency does not establish it.",
  industry:"Check what business the merchant operates; a transaction category alone may not distinguish namesakes.",
  locality:"Check the merchant's city or branch to distinguish businesses with the same name.",
  domain:"Check the merchant's own website printed on the document.",
  taxCountry:"Check the country that issued the seller's tax ID.",
  merchantTaxScheme:"Check whether the seller's ID is a TIN, VAT, GST or another tax scheme.",
  merchantIdCountry:"Check the merchant-ID issuer's country; this may differ from the merchant's location.",
  merchantIdIssuer:"Check the acquirer or processor that issued the merchant ID.",
  registrationCountry:"Check the company-registration country.",
  registeredCountry:"Check where the named legal company is incorporated; this can differ from the merchant's location.",
  registrationIssuer:"Check the registry that issued the company-registration number.",
  transactionDate:"Check the transaction's date against the recorded identity's effective dates.",
  coherentIdentifierEvidence:"Check the identifier, issuing country and issuer together in the same seller record.",
  verifiedOperator:"Check which trading brand the document identifies; the recorded company role alone may not establish the seller.",
  sourceEvidence:"Check the printed seller name and its supporting source text.",
};

export function identityReviewHints(status: MerchantIdentityResult["status"], reason: string, candidates: MerchantIdentityResult["candidates"], observations: IdentityObservation[]): NonNullable<MerchantIdentityResult["reviewHints"]> {
  if (status === "suggested") return [];
  const needed = new Set(candidates.flatMap(c => c.missingContext ?? []));
  const has = (field:IdentityObservation["field"]) => observations.some(o => o.field === field && o.confidence >= 80);
  if (reason === "regional_artwork_requires_merchant_country" || reason !== "multiple_matching_companies" && candidates.some(c => c.conflicts.some(v => /country/.test(v) && v !== "operator_registration_country_mismatch"))) needed.add("merchantCountry");
  if (candidates.some(c=>c.conflicts.includes("operator_registration_country_mismatch"))) needed.add("registeredCountry");
  if (reason === "multiple_matching_companies") {
    const plausible = candidates.filter(c=>!c.conflicts.length);
    if (new Set(plausible.flatMap(c=>c.countryCodes)).size > 1) needed.add("merchantCountry");
    if (new Set(plausible.map(c=>c.industry)).size > 1) needed.add("industry");
    if (new Set(plausible.map(c=>c.locality).filter(Boolean)).size > 1) needed.add("locality");
    if (!needed.size) needed.add("domain");
  }
  if (candidates.some(c => c.evidence.some(e => /legal_operator_relationship_unverified|operator_geographic_scope_unverified|shared_company_does_not_identify_trading_brand|parent_relationship_only/.test(e)))) needed.add("verifiedOperator");
  if (observations.some(o=>o.confidence===0) || candidates.some(c=>c.evidence.includes("name_confidence_requires_review"))) needed.add("sourceEvidence");
  if (reason === "confirmed_merchant_label_requires_identity_review") needed.add("sourceEvidence");
  if (candidates.some(c=>c.conflicts.some(conflict=>conflict.startsWith("dated_")))) needed.add("transactionDate");
  // Existing conflicting context still needs review; present absent context first.
  return [...needed].filter((field):field is keyof typeof messages=>Object.hasOwn(messages,field)).sort((a,b)=>Number(has(a as IdentityObservation["field"]))-Number(has(b as IdentityObservation["field"]))).map(field=>({field,message:messages[field]!}));
}
