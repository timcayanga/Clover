/** Artwork identity confidence is separate from transaction/parser confidence. */
export type LogoAlias = {
  value: string;
  /** Venues/payment rails must identify the merchant, never a shop location suffix. */
  merchantPosition?: boolean;
  kind: "trade_name" | "legal_operator" | "statement_descriptor" | "historical_name";
  countryCodes: string[];
  sourceUrl: string | null;
  requiresContext?: boolean;
  /** Country/industry and even complete legal names may be shared by distinct entities. */
  requiresDistinctiveEvidence?: boolean;
  validFrom?: string;
  validTo?: string;
  entityId?: string;
  matchMode?: "token" | "legal_entity";
  registeredCountryCode?: string;
  primarySourceVerified?: boolean;
  pattern?: "token" | "star_prefix" | "literal_token";
};

export type LogoRelationship = {
  entityId: string;
  names: string[];
  role: "legal_operator" | "franchisee" | "parent_owner" | "developer" | "payment_processor" | "shared_operator" | "privacy_controller" | "website_operator" | "manufacturer";
  countryCodes: string[];
  registeredCountryCode?: string;
  sourceUrl: string;
  validFrom?: string;
  validTo?: string;
};

export type LogoBusinessIdentifier = {
  kind: "tax_id" | "merchant_id" | "business_registration";
  value: string;
  countryCode: string;
  issuer?: string;
  scheme?: string;
  entityId?: string;
  sourceUrl: string;
  validFrom?: string;
  validTo?: string;
};

export type LogoLocation = {
  role: "branch" | "registered_office" | "operator_contact";
  countryCode: string;
  locality?: string;
  streetAddress: string;
  postalCode?: string;
  sourceUrl: string;
  validFrom?: string;
  validTo?: string;
};

export type LogoIdentity = {
  entryId: string;
  brandId: string;
  name: string;
  kind: string;
  industry: string;
  industries?: string[];
  countryCodes: string[];
  locality: string | null;
  aliases: LogoAlias[];
  domains: string[];
  iconPath: string;
  artworkHash: string;
  sourceUrl: string | null;
  publisher: string | null;
  scope: "regional" | "unspecified";
  relationships?: LogoRelationship[];
  identifiers?: LogoBusinessIdentifier[];
  locations?: LogoLocation[];
  domainFacts?: Array<{ value: string; role: "merchant" | "infrastructure" | "unverified" | "parent_group"; sourceUrl: string; countryCodes?: string[]; validFrom?: string; validTo?: string }>;
  verification?: LogoBrandVerification;
  /** Current app provenance; storefront and developer are never receipt-country/operator proof. */
  publisherVerification?: {
    checkedAt: string;
    sourceUrl: string;
    appId: number;
    storefrontCountry: string;
    status: "published" | "unavailable" | "fetch_failed";
    sellerName?: string | null;
    trackName?: string | null;
    bundleId?: string | null;
    publisherChanged: boolean;
  };
  contextCoverage?: {
    businessResearch: "primary_business_context" | "not_researched";
    operatorEvidence: "country_scoped" | "unscoped" | "unverified";
    companyCountryEvidence: "documented_roles" | "unverified";
    regionalServiceEvidence: "documented_service_market" | "unverified" | "unspecified";
    missingRegionalServiceCountries: string[];
    regionalArtworkScope: "catalog_region" | "unspecified";
    industryEvidence: "researched_classification" | "catalog_classification";
    statementAliasEvidence: "published" | "unverified";
    publisherEvidence: "fresh_primary_publication" | "artwork_provenance" | "none";
    researchGaps: string[];
    matchingRequirements: string[];
  };
};

export type LogoBrandVerification = {
  brandId:string;
  checkedAt:string;
  industry:string;
  industryDetail:string;
  additionalIndustries?:string[];
  sources:Array<{url:string;note:string}>;
  /** Registry keys distinguish institution records internally; they are not receipt identifiers. */
  entities:Array<{name:string;role:LogoRelationship["role"];sourceUrl:string;countryCodes:string[];registryRecordKey?:string;validFrom?:string;validTo?:string}>;
  countryFacts:Array<{countryCode:string;role:"service_market"|"customer_market"|"incorporation"|"registered_office"|"headquarters"|"contact_office";sourceUrl:string;note:string;entityName?:string;validFrom?:string;validTo?:string}>;
  statementAliases:Array<{value:string;sourceUrl:string;countryCodes:string[];kind:"statement_descriptor";pattern:"token"|"star_prefix"|"literal_token";requiresContext?:boolean}>;
  statementAliasStatus:"verified"|"not_verified";
};

export type IdentityObservation = {
  field: "merchantCountry" | "accountCountry" | "industry" | "domain" | "legalName" | "tradeName" | "locality" | "originalCurrency" | "settlementCurrency" | "streetAddress" | "postalCode" | "registeredCountry" | "serviceCountry" | "merchantTaxId" | "taxCountry" | "merchantTaxScheme" | "merchantId" | "merchantIdIssuer" | "merchantIdCountry" | "businessRegistrationId" | "registrationCountry" | "registrationIssuer" | "paymentProcessor";
  value: string;
  source: "explicit" | "receipt" | "descriptor" | "account" | "category";
  confidence: number;
  evidence: string;
  /** Fields from separate source envelopes must not form a fabricated identifier tuple. */
  group?: "input" | "raw_row" | "receipt" | "source_row" | "descriptor" | "account" | "category";
};

export type MerchantIdentityInput = {
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  institution?: string | null;
  categoryName?: string | null;
  currency?: string | null;
  date?: string | Date | null;
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  merchantCountry?: string | null;
  accountCountry?: string | null;
  industry?: string | null;
  domain?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  locality?: string | null;
  originalCurrency?: string | null;
  merchantNameConfirmed?: boolean;
  reviewStatus?: string | null;
  accountId?: string | null;
  streetAddress?: string | null;
  postalCode?: string | null;
  registeredCountry?: string | null;
  serviceCountry?: string | null;
  merchantTaxId?: string | null;
  taxCountry?: string | null;
  merchantTaxScheme?: string | null;
  merchantId?: string | null;
  merchantIdIssuer?: string | null;
  merchantIdCountry?: string | null;
  businessRegistrationId?: string | null;
  registrationCountry?: string | null;
  registrationIssuer?: string | null;
};

export type MerchantIdentityResult = {
  version: string;
  inputKey: string;
  status: "suggested" | "needs_review" | "unmatched";
  brandId: string | null;
  entryId: string | null;
  logoPath: string | null;
  confidence: number;
  reason: string;
  observations: IdentityObservation[];
  institutionNameKey?: string;
  accountContextKey?: string;
  sourceAccountId?: string;
  catalogDigest?: string;
  reviewHints?: Array<{ field: IdentityObservation["field"] | "transactionDate" | "coherentIdentifierEvidence" | "verifiedOperator" | "sourceEvidence"; message: string }>;
  candidates: Array<{ brandId: string; entryId: string; name: string; countryCodes: string[]; industry: string; locality: string | null; confidence: number; evidence: string[]; conflicts: string[]; matchedEntities?: LogoRelationship[];
    missingContext?: string[];
    sources?: Array<{ kind: "alias" | "domain" | "identifier" | "branch"; label: string; url: string; countryCodes: string[]; validFrom?: string; validTo?: string }>;
  }>;
};
