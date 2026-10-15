import type { IdentityObservation, MerchantIdentityInput } from "./logo-identity-types";
import catalogCountryNames from "./generated/logo-country-names.json";
import { identityConfidence, merchantDomain, identityDay, businessIdentifierKey, quoteContainsBusinessIdentifier } from "./logo-identity-evidence";

export const identityText = (s: string) => s.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
export const identityLegalText = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu," ").trim();
const contextRequiredNames = new Set(["orange", "mango", "shell", "lotus", "target", "next", "gap", "coach", "apple", "bolt", "square", "cora", "metro", "union", "star", "delta", "guardian", "mercury", "spark", "pulse", "titan", "indigo", "axis", "trident", "toast"]);
export const identityNeedsAdditionalContext = (name: string) => contextRequiredNames.has(identityText(name));
export const asIdentityRecord = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const countryNames: Record<string, string> = {
  ...catalogCountryNames,
  philippines: "PH", thailand: "TH", singapore: "SG", malaysia: "MY", indonesia: "ID", vietnam: "VN",
  india: "IN", japan: "JP", china: "CN", "hong kong": "HK", taiwan: "TW", "south korea": "KR",
  "united states": "US", usa: "US", "united kingdom": "GB", uk: "GB", "great britain": "GB",
  australia: "AU", canada: "CA", "new zealand": "NZ", switzerland: "CH", ireland: "IE",
  germany: "DE", france: "FR", italy: "IT", spain: "ES", "united arab emirates": "AE",
};
export const identityCountry = (s: string) => countryNames[identityText(s)] ?? (/^[a-z]{2}$/i.test(s.trim()) ? (s.toUpperCase() === "UK" ? "GB" : s.toUpperCase()) : null);
export const receiptIdentityFields: Record<string, IdentityObservation["field"]> = {
  merchant_country_code: "merchantCountry", merchant_legal_name: "legalName", merchant_website: "domain",
  merchant_trade_name: "tradeName",
  merchant_city: "locality", merchant_industry: "industry", original_currency: "originalCurrency",
  merchant_street_address: "streetAddress", merchant_postal_code: "postalCode",
  merchant_registered_country_code: "registeredCountry", service_country_code: "serviceCountry",
  merchant_tax_id: "merchantTaxId", merchant_tax_country_code: "taxCountry", merchant_tax_scheme: "merchantTaxScheme",
  merchant_id: "merchantId", merchant_id_issuer: "merchantIdIssuer", merchant_id_country_code: "merchantIdCountry",
  merchant_registration_id: "businessRegistrationId", merchant_registration_country_code: "registrationCountry", merchant_registration_issuer: "registrationIssuer",
};
const categoryIndustry: Record<string, string> = {
  "food dining": "food", dining: "food", food: "food", restaurants: "food", groceries: "shopping", shopping: "shopping",
  transport: "transportation", transportation: "transportation", "travel lifestyle": "travel", travel: "travel",
  "health wellness": "health-and-personal-care", healthcare: "health-and-personal-care",
};
const processorPrefixes = /^(?:paypal|paddle(?: net)?|sq|square|stripe|2c2p(?: ph)?|eftpay|adyen|sumup|izettle|tst|toast|sp|shopify)$/;
function descriptorParts(name:string) {
  const parts=name.split("*"), processors:string[]=[];
  while (parts.length > 1 && processorPrefixes.test(identityText(parts[0]))) processors.push(parts.shift()!);
  return {merchant:parts.join(" "),descriptor:parts.join("*"),processors};
}

/** Row-scoped evidence only: account headings and receipt line items cannot identify the merchant. */
export function collectMerchantIdentityContext(input: MerchantIdentityInput) {
  const raw = asIdentityRecord(input.rawPayload);
  const receipt = asIdentityRecord(raw.receiptDetails ?? raw.receipt_details);
  const parser = asIdentityRecord(raw.parserEvidence ?? raw.parser_evidence);
  const extractionRevision = typeof raw.promptVersion === "string" ? Number(raw.promptVersion.match(/^clover_bank_statement_extraction_v(\d+)$/)?.[1]) : NaN;
  const requiresReceiptEvidence = extractionRevision >= 6;
  const observations: IdentityObservation[] = [];
  let group: IdentityObservation["group"] = "input";
  const add = (field: IdentityObservation["field"], value: unknown, source: IdentityObservation["source"], confidence: number, evidence: string) => {
    const v = text(value); if (!v) return;
    const normalized = field.endsWith("Country") ? identityCountry(v) : field === "industry" ? categoryIndustry[identityText(v)] ?? v : v;
    if (normalized) observations.push({ field, value: normalized, source, confidence, evidence, group });
  };
  add("merchantCountry", input.merchantCountry, "explicit", 95, "explicit merchant country");
  group = "account";
  add("accountCountry", input.accountCountry, "account", 90, "account country, not merchant location");
  const sourceInstitution = text(raw.institutionRaw ?? raw.institution ?? raw.bank);
  const boundAccountId = text(asIdentityRecord(asIdentityRecord(input.normalizedPayload).institutionIdentity).sourceAccountId);
  const accountSourceApplies = !boundAccountId || !input.accountId || boundAccountId === input.accountId;
  if (accountSourceApplies && (!input.institution || !sourceInstitution || identityText(sourceInstitution) === identityText(input.institution))) {
    add("accountCountry", raw.accountCountry ?? raw.account_country_code, "account", 85, "explicit source account country");
  }
  // Only explicit merchant fields qualify. Do not use raw.country (often the account's country).
  for (const [record, source] of [[raw, "descriptor"], [receipt, "receipt"]] as const) {
    group = source === "receipt" ? "receipt" : "raw_row";
    const confidence = source === "receipt" ? Math.min(85, identityConfidence(record.confidence_score ?? record.confidenceScore, 65)) : 85;
    const values: Record<string, unknown> = {
      merchant_country_code: record.merchantCountry ?? record.merchant_country_code,
      merchant_legal_name: record.merchantLegalName ?? record.merchant_legal_name,
      merchant_trade_name: record.merchantTradeName ?? record.merchant_trade_name,
      merchant_website: record.merchantWebsite ?? record.merchant_website,
      merchant_city: record.merchantCity ?? record.merchant_city,
      merchant_industry: record.merchantIndustry ?? record.merchant_industry,
      original_currency: record.originalCurrency ?? record.original_currency ?? record.foreignCurrency,
      merchant_street_address: record.merchantStreetAddress ?? record.merchant_street_address,
      merchant_postal_code: record.merchantPostalCode ?? record.merchant_postal_code,
      merchant_registered_country_code: record.merchantRegisteredCountry ?? record.merchant_registered_country_code,
      service_country_code: record.serviceCountry ?? record.service_country_code,
      merchant_tax_id: record.merchantTaxId ?? record.merchant_tax_id,
      merchant_tax_country_code: record.merchantTaxCountry ?? record.merchant_tax_country_code,
      merchant_tax_scheme: record.merchantTaxScheme ?? record.merchant_tax_scheme,
      merchant_id: record.merchantId ?? record.merchant_id,
      merchant_id_issuer: record.merchantIdIssuer ?? record.merchant_id_issuer,
      merchant_id_country_code: record.merchantIdCountry ?? record.merchant_id_country_code,
      merchant_registration_id: record.merchantRegistrationId ?? record.merchant_registration_id,
      merchant_registration_country_code: record.merchantRegistrationCountry ?? record.merchant_registration_country_code,
      merchant_registration_issuer: record.merchantRegistrationIssuer ?? record.merchant_registration_issuer,
    };
    const fieldEvidence = record.merchant_context_evidence ?? record.merchantContextEvidence;
    for (const [key, field] of Object.entries(receiptIdentityFields)) {
      const value = text(values[key]); if (!value) continue;
      let score = confidence, evidence = `row ${key} field`;
      const legacyField = ["merchant_country_code", "merchant_legal_name", "merchant_website", "merchant_city", "merchant_industry", "original_currency"].includes(key);
      if ((source === "receipt" || raw.source === "openai") && (requiresReceiptEvidence || Array.isArray(fieldEvidence) && fieldEvidence.length || !legacyField)) {
        const records = Array.isArray(fieldEvidence) ? fieldEvidence.map(asIdentityRecord) : [];
        const opaqueIdentifier = ["merchant_tax_id", "merchant_id", "merchant_registration_id"].includes(key);
        const strictLegalField = ["merchant_legal_name", "merchant_id_issuer", "merchant_registration_issuer", "merchant_tax_scheme"].includes(key);
        const normalize = opaqueIdentifier ? businessIdentifierKey : strictLegalField ? identityLegalText : identityText;
        const support = records.filter(e => e.field === key && normalize(text(e.value) ?? "") === normalize(value)).find(e => {
          const quote = identityText(text(e.source_text) ?? "");
          const originalQuote = text(e.source_text) ?? "";
          if (!quote || /\b(?:buyer|customer|payer|cardholder|passenger)\s+(?:tax|tin|vat|id|address|name|country)\b/.test(quote)) return false;
          if (/\b(?:buyer|customer|payer|cardholder|passenger|recipient)(?:\s+(?:name|address|country|tax id|tin|vat|id))?\s*[:=]/i.test(originalQuote)) return false;
          const sellerIdentityField = ["legalName", "tradeName", "domain", "merchantCountry", "locality", "streetAddress", "postalCode"].includes(field);
          if (sellerIdentityField && /\b(?:payment processed by|payments processed by|payment processor|payment gateway|card issuer|acquirer)\b/.test(quote)) return false;
          if (["merchantCountry", "locality", "streetAddress", "postalCode"].includes(field) && /\b(?:registered office|incorporated in|registration country|billing country|delivery country|destination country|pickup country|dropoff country|recipient address|shipping address)\b/.test(quote)) return false;
          if (/\b(?:made in|manufactured in|country of origin)\b/.test(quote) && field.endsWith("Country")) return false;
          if (/\b(?:currency|dollar|peso|baht|euro|yen|yuan|rupiah|rupee)\b/.test(quote) && field.endsWith("Country")) return false;
          if (key !== "service_country_code" && /\b(?:bill to|ship to|delivery address)\b/.test(quote)) return false;
          if (key === "merchant_id" && !/\b(?:merchant id|mid|merchant identification)\b/.test(quote)) return false;
          if (key === "merchant_tax_id" && !/\b(?:tax id|tin|vat|gst|gstin|taxpayer)\b/.test(quote)) return false;
          if (key === "merchant_registration_id" && !/\b(?:company registration|company reg|corporate registration|uen)\b/.test(quote)) return false;
          if (["merchant_id_issuer", "merchant_id_country_code"].includes(key) && (!/\b(?:acquirer|processor|provider|merchant id issuer|mid issuer)\b/.test(quote) || /\bcard issuer\b/.test(quote))) return false;
          if (key === "merchant_registration_issuer" && !/\b(?:registry|registrar|registration authority|company register|acra)\b/.test(quote)) return false;
          if (key === "merchant_registered_country_code" && !/\b(?:registered|incorporated|registration)\b/.test(quote)) return false;
          if (key === "service_country_code" && !/\b(?:service|delivery|ride|destination|pickup|dropoff|ship to)\b/.test(quote)) return false;
          if (opaqueIdentifier) return quoteContainsBusinessIdentifier(String(e.source_text),value);
          if (strictLegalField) return (` ${identityLegalText(String(e.source_text))} `).includes(` ${identityLegalText(value)} `);
          if (field === "domain") {
            const host = merchantDomain(value);
            if (host && String(e.source_text).split(/\s+/).some(token => merchantDomain(token.replace(/[(),;:]+$/g,"")) === host)) return true;
          }
          if ((` ${quote} `).includes(` ${identityText(value)} `)) return true;
          return field.endsWith("Country") && Object.entries(countryNames).some(([name, code]) => code === identityCountry(value) && (` ${quote} `).includes(` ${name} `));
        });
        score = support ? Math.min(85, identityConfidence(support.confidence)) : 0;
        evidence = support ? `receipt field:${key}; source:${String(support.source_text)}` : `receipt field:${key}; supporting seller evidence missing`;
      }
      add(field, value, source, field === "industry" ? Math.min(80, score) : score, evidence);
    }
  }
  group = "input";
  add("industry", input.industry, "explicit", 95, "explicit merchant industry");
  group = "category";
  add("industry", categoryIndustry[identityText(input.categoryName ?? "")], "category", 55, "category hint; not an identity fact");
  group = "input";
  add("domain", input.domain, "explicit", 95, "explicit merchant domain");
  add("legalName", input.legalName, "explicit", 95, "explicit legal operator");
  add("tradeName", input.tradeName, "explicit", 95, "explicit trading name");
  add("locality", input.locality, "explicit", 95, "explicit merchant locality");
  add("originalCurrency", input.originalCurrency, "explicit", 95, "original charge currency");
  add("settlementCurrency", input.currency, "account", 95, "settlement currency; not country proof");
  for (const field of ["streetAddress", "postalCode", "registeredCountry", "serviceCountry", "merchantTaxId", "taxCountry", "merchantTaxScheme", "merchantId", "merchantIdIssuer", "merchantIdCountry", "businessRegistrationId", "registrationCountry", "registrationIssuer"] as const) {
    add(field, input[field], "explicit", 95, `explicit seller ${field}`);
  }
  const columnFields: Record<string, IdentityObservation["field"]> = {
    "merchant country": "merchantCountry", "merchant country code": "merchantCountry", "vendor country": "merchantCountry",
    "account country": "accountCountry", "account country code": "accountCountry",
    "merchant legal name": "legalName", "legal merchant name": "legalName", "supplier legal name": "legalName",
    "merchant trade name": "tradeName", "trading name": "tradeName",
    "merchant website": "domain", "merchant domain": "domain", "vendor website": "domain",
    "merchant city": "locality", "merchant locality": "locality", "merchant industry": "industry",
    "original currency": "originalCurrency", "foreign currency": "originalCurrency",
    "merchant street address": "streetAddress", "merchant address": "streetAddress", "merchant postal code": "postalCode",
    "merchant registered country": "registeredCountry", "service country": "serviceCountry",
    "merchant tax id": "merchantTaxId", "merchant tin": "merchantTaxId", "seller vat id": "merchantTaxId",
    "merchant tax country": "taxCountry", "merchant id": "merchantId", "merchant id issuer": "merchantIdIssuer", "merchant id country": "merchantIdCountry",
    "merchant registration id": "businessRegistrationId", "merchant registration country": "registrationCountry", "merchant registration issuer": "registrationIssuer", "merchant tax scheme": "merchantTaxScheme",
  };
  group = "source_row";
  if (Array.isArray(raw.originalHeaders) && Array.isArray(raw.sourceRow)) {
    raw.originalHeaders.forEach((header, index) => {
      if (typeof header !== "string") return;
      const field = columnFields[identityText(header)];
      if (field && (field !== "accountCountry" || accountSourceApplies)) add(field, (raw.sourceRow as unknown[])[index], "explicit", 95, `source column:${header}`);
    });
  }
  const sourceLines = [input.merchantRaw, input.description, text(raw.sourceLine), text(raw.fullLineText), text(parser.source_text ?? parser.sourceText), text(raw.parserEvidenceText)].filter((v): v is string => Boolean(v));
  const receiptEvidence = receipt.merchant_context_evidence ?? receipt.merchantContextEvidence;
  const auditedRawNames = requiresReceiptEvidence && raw.source === "openai" && Boolean(raw.merchantLegalName || raw.merchant_legal_name || raw.merchantTradeName || raw.merchant_trade_name);
  const fieldAuditedReceipt = auditedRawNames || Object.keys(receipt).length > 0 && (requiresReceiptEvidence || raw.source === "openai" && Array.isArray(receiptEvidence) && receiptEvidence.length > 0);
  group = "descriptor";
  for (const line of sourceLines) {
    if (fieldAuditedReceipt) continue; // Use seller-specific country quotes rather than guessed OCR suffixes.
    const normalized = identityText(line);
    if (/\b(?:buyer|customer|payer|cardholder|passenger|recipient|ship to|bill to|delivery|shipping|destination|registered office|incorporated|registration|made in|manufactured in|country of origin|card issuer|acquirer|payment processor|currency|dollar|peso|baht|euro|yen|yuan|rupiah|rupee)\b/.test(normalized)) continue;
    // A source snippet or description must contain this row's merchant, not merely a country.
    const rowNames = [input.merchantRaw,input.legalName,input.tradeName].filter((v):v is string=>!!v).map(name=>identityText(descriptorParts(name).merchant));
    if (line !== input.merchantRaw && !rowNames.some(name => name && (` ${normalized} `).includes(` ${name} `))) continue;
    // Explicit statement country suffixes are weaker than structured merchant fields.
    const suffix = line.match(/(?:\s|[,;])([A-Z]{2})\s*$/)?.[1];
    if (suffix && Object.values(countryNames).includes(suffix)) add("merchantCountry", suffix, "descriptor", 75, `country suffix:${suffix}`);
    for (const [name, code] of Object.entries(countryNames)) {
      const countryInBusinessName = normalized === `bank of ${name}` || normalized === `${name} bank` || normalized === `${name} airlines` || normalized === `${name} airways`;
      if (!countryInBusinessName && name.length > 3 && normalized.endsWith(` ${name}`)) add("merchantCountry", code, "descriptor", 70, `trailing country text:${name}`);
    }
    // A payment processor before * is a different role from the merchant after it.
  }
  const supportedNames = observations.filter(o => ["legalName", "tradeName"].includes(o.field) && o.confidence >= 80);
  const inputRawSupported = !fieldAuditedReceipt || supportedNames.some(o => (o.field === "legalName" ? identityLegalText : identityText)(input.merchantRaw ?? "") === (o.field === "legalName" ? identityLegalText : identityText)(o.value));
  const nameFields: Array<{name:string|null|undefined;role:"descriptor"|"legalName"|"tradeName"}> = [
    {name:inputRawSupported ? input.merchantRaw : null,role:"descriptor"},
    {name:input.merchantRaw || fieldAuditedReceipt ? null : text(receipt.merchant_raw ?? receipt.merchantRaw),role:"descriptor"},
    {name:input.legalName,role:"legalName"},{name:input.tradeName,role:"tradeName"},
    ...supportedNames.map(o=>({name:o.value,role:o.field === "legalName" ? "legalName" as const : "tradeName" as const})),
  ];
  const supportedNameFields=nameFields.filter((value):value is {name:string;role:"descriptor"|"legalName"|"tradeName"}=>!!value.name);
  const names=supportedNameFields.map(value=>value.name);
  const rawNameRoles=supportedNameFields.map(value=>value.role === "descriptor" && supportedNames.some(o=>o.field === "legalName" && identityLegalText(o.value) === identityLegalText(value.name)) ? "legalName" as const : value.role);
  const rawNameDescriptors=names.map((n,index)=>rawNameRoles[index] === "legalName" ? n : descriptorParts(n).descriptor);
  group = "descriptor";
  const rawNames = names.map((n,index) => {
    if (rawNameRoles[index] === "legalName") return n;
    const parts=descriptorParts(n);
    for (const processor of parts.processors) add("paymentProcessor",processor,"descriptor",85,`processor prefix in seller descriptor:${n}`);
    return parts.merchant;
  });
  const receiptNameOrigin = raw.source === "openai" && Object.keys(receipt).length || !input.merchantRaw && text(receipt.merchant_raw ?? receipt.merchantRaw);
  const supportedNameScores = observations.filter(o => ["legalName", "tradeName"].includes(o.field) && o.confidence >= 80).map(o => o.confidence);
  const nameConfidence = fieldAuditedReceipt ? Math.max(0,...supportedNameScores) : receiptNameOrigin ? identityConfidence(receipt.confidence_score ?? receipt.confidenceScore,65) : 100;
  const rawNameConfidences = names.map(name => {
    if (!fieldAuditedReceipt) return nameConfidence;
    if (name === input.legalName || name === input.tradeName) return 95;
    return Math.max(0,...supportedNames.filter(o => (o.field === "legalName" ? identityLegalText : identityText)(o.value) === (o.field === "legalName" ? identityLegalText : identityText)(name)).map(o=>o.confidence));
  });
  // Published billing text can include the provider prefix removed from the seller name.
  return { observations, rawNames, rawNameDescriptors, rawOriginalDescriptors:names, rawNameRoles, rawNameConfidences, nameConfidence, cleanName: input.merchantClean ?? text(receipt.merchant_clean ?? receipt.merchantClean) ?? null };
}

/** Client-safe guard against a stale suggestion after an inline merchant edit. */
export const merchantIdentityInputKey = (input: MerchantIdentityInput) => {
  const date = identityDay(input.date) ?? "";
  const context = collectMerchantIdentityContext(input);
  return JSON.stringify({ policyVersion:32, text: [input.merchantRaw ?? "", input.merchantClean ?? "", input.description ?? "", input.currency ?? "", input.categoryName ?? "", date].map(identityLegalText),
    descriptorEvidence:context.rawNameDescriptors,
    originalDescriptorEvidence:context.rawOriginalDescriptors,
    nameEvidence:context.rawNames.map((name,index)=>[identityLegalText(name),context.rawNameConfidences[index],context.rawNameRoles[index]]),
    receiptCleanName:identityLegalText(context.cleanName ?? ""),
    accountId: input.accountId ?? null,
    merchantNameConfirmed: input.merchantNameConfirmed ?? input.reviewStatus === "confirmed",
    observations: context.observations.map(o => [o.field, identityLegalText(o.value), o.source, o.confidence, o.evidence, o.group ?? o.source]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
};

export const institutionIdentityContextKey = (input: MerchantIdentityInput) => JSON.stringify({
  name: identityText(input.institution ?? ""), accountId: input.accountId ?? null,
  countries: collectMerchantIdentityContext(input).observations.filter(o => o.field === "accountCountry").map(o => [o.value, o.confidence, o.evidence]).sort(),
});
