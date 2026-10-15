
import { collectMerchantIdentityContext, identityText, identityLegalText, merchantIdentityInputKey, identityNeedsAdditionalContext, institutionIdentityContextKey } from "./merchant-identity-context";
import type { LogoAlias, LogoIdentity, MerchantIdentityInput, MerchantIdentityResult } from "./logo-identity-types";
import { merchantDomain, factAppliesOnDate, isInfrastructureDomain, identityDay } from "./logo-identity-evidence";
import { supportingIdentityFacts, identityIdentifierConflicts, pendingIdentityIdentifiers } from "./logo-identity-matching";
import { identityReviewHints } from "./logo-identity-review";
import { matchesLogoAlias } from "./logo-alias-matching";

// Keep the large research catalog server-side without inferring thousands of JSON literal types.
const catalog = require("./generated/logo-identity-catalog.json") as { version: string; catalogDigest: string; entries: LogoIdentity[] };

export const LOGO_IDENTITY_VERSION = catalog.version;
const defaultCatalog = catalog.entries as LogoIdentity[];
const bounded = (value: string, alias: string) => (` ${value} `).includes(` ${alias} `);
const legalEntityText = (value: string) => /\b(?:corporation|corp|incorporated|inc|limited|ltd|llc|plc|gmbh|holdings|group|pte|sarl)\b/.test(value);
const indexes = new WeakMap<LogoIdentity[], Map<string, LogoIdentity[]>>();
function getIndex(entries: LogoIdentity[]) {
  let index = indexes.get(entries); if (index) return index;
  index = new Map();
  for (const e of entries) for (const a of e.aliases) {
    const first = identityText(a.value).split(" ")[0];
    const bucket = index.get(first) ?? []; if (!bucket.includes(e)) bucket.push(e); index.set(first, bucket);
  }
  for (const e of entries) for (const r of e.relationships ?? []) for (const name of r.names) {
    const first = identityText(name).split(" ")[0], bucket = index.get(first) ?? [];
    if (!bucket.includes(e)) bucket.push(e); index.set(first,bucket);
  }
  indexes.set(entries, index); return index;
}

/** Pure advisory resolution. No transaction writes, category changes or automatic confirmations. */
export function resolveMerchantIdentity(input: MerchantIdentityInput, entries = defaultCatalog): MerchantIdentityResult {
  input = { ...input, merchantNameConfirmed: input.merchantNameConfirmed ?? ["confirmed", "edited"].includes(input.reviewStatus ?? "") };
  const { observations, rawNames, rawNameDescriptors, rawOriginalDescriptors, rawNameRoles, rawNameConfidences, cleanName, nameConfidence } = collectMerchantIdentityContext(input);
  const countries = [...new Set(observations.filter(o => o.field === "merchantCountry" && o.confidence >= 70).map(o => o.value))];
  const registeredCountries = [...new Set(observations.filter(o=>o.field === "registeredCountry" && o.confidence >= 80).map(o=>o.value))];
  const aliasScopeMatches = (a:LogoAlias) => a.kind === "legal_operator" && a.registeredCountryCode
    ? registeredCountries.length === 1 && registeredCountries[0] === a.registeredCountryCode
    : a.countryCodes.length > 0 && countries.length === 1 && a.countryCodes.includes(countries[0]);
  const explicitIndustry = observations.filter(o => o.field === "industry" && o.source !== "category" && o.confidence >= 80).map(o => identityText(o.value));
  const categoryHints = observations.filter(o => o.field === "industry" && o.source === "category").map(o => identityText(o.value));
  const domains = observations.filter(o => o.field === "domain" && o.confidence >= 80).map(o => merchantDomain(o.value)).filter(Boolean);
  const localities = observations.filter(o => o.field === "locality" && o.confidence >= 80).map(o => identityText(o.value));
  const rawText = rawNames.map(identityText), clean = identityText(cleanName ?? "");
  const confirmedLegalLabel = legalEntityText(clean) || observations.some(o=>o.field === "legalName" && o.confidence >= 80 && identityLegalText(o.value) === identityLegalText(cleanName ?? ""));
  const aliasMatchesName = (alias:LogoAlias,index:number) => matchesLogoAlias(rawNameDescriptors[index],alias,rawNameRoles[index],countries)
    || alias.kind === "statement_descriptor" && alias.value.includes("*") && matchesLogoAlias(rawOriginalDescriptors[index],alias,rawNameRoles[index],countries);
  const rawAliasMatch = (alias:LogoAlias) => rawNames.some((name,index)=>aliasMatchesName(alias,index));
  const aliasRawConfidence = (alias:LogoAlias) => Math.max(0,...rawNames.map((name,index) => {
    return aliasMatchesName(alias,index) ? rawNameConfidences[index] : 0;
  }));
  const index = getIndex(entries), pool = new Set<LogoIdentity>();
  for (const token of [...rawText, ...rawOriginalDescriptors.map(identityText), clean].join(" ").split(" ")) for (const e of index.get(token) ?? []) pool.add(e);
  const date = identityDay(input.date);
  const merchantDomains = (e: LogoIdentity) => e.domains.filter(d => {
    const facts = (e.domainFacts ?? []).filter(f => f.value === d);
    const applies = (f: typeof facts[number]) => factAppliesOnDate(f,date) && (!f.countryCodes?.length || countries.length === 1 && f.countryCodes.includes(countries[0]));
    return !facts.some(f => f.role === "parent_group" && applies(f)) && (facts.some(f => f.role === "merchant" && applies(f)) || !facts.length && !isInfrastructureDomain(d));
  });
  // Scoped identifiers and complete branch addresses can retrieve a candidate with no usable name.
  for (const e of entries) {
    if (domains.length && (merchantDomains(e).some(d => domains.includes(d)) || e.domainFacts?.some(f => f.role === "merchant" && domains.includes(f.value)))) pool.add(e);
    if (e.identifiers?.length || e.locations?.some(l => l.role === "branch")) {
      const support = supportingIdentityFacts(e,observations,date);
      if (support.ids.length || support.addresses.length || pendingIdentityIdentifiers(e,observations,date).length) pool.add(e);
    }
  }
  const ranked = [...pool].flatMap(e => {
    const evidence: string[] = [], conflicts: string[] = [];
    const industries = new Set([e.industry, ...(e.industries ?? [])].map(identityText));
    const facts = supportingIdentityFacts(e,observations,date);
    const pendingIds = pendingIdentityIdentifiers(e,observations,date);
    const missingContext = new Set<string>(pendingIds.flatMap(p=>p.missing));
    const activeAliases = e.aliases.filter(a => factAppliesOnDate(a,date));
    const matchedOperatorAliases = activeAliases.filter(a => a.kind === "legal_operator" && rawAliasMatch(a) && aliasScopeMatches(a));
    const matchedScopedAliases = e.aliases.filter(a => a.kind !== "trade_name" && rawAliasMatch(a));
    const aliasHasActiveEquivalent = (alias:LogoAlias) => activeAliases.some(a => a.kind === alias.kind && identityLegalText(a.value) === identityLegalText(alias.value) && aliasScopeMatches(a));
    if (matchedScopedAliases.some(a => (a.validFrom || a.validTo) && !factAppliesOnDate(a,date) && !aliasHasActiveEquivalent(a))) conflicts.push("dated_scoped_alias_does_not_apply");
    const rawTradeMatches = activeAliases.filter(a => a.kind === "trade_name" && rawAliasMatch(a) && rawText.some((n,index) => bounded(n,identityText(a.value)) && (rawNameRoles[index] !== "legalName" || n === identityText(a.value)) && !legalEntityText(n)));
    const parentMatches = (e.relationships ?? []).filter(r => r.role === "parent_owner" && factAppliesOnDate(r,date) && r.names.some(n => rawText.some(t => bounded(t,identityText(n)))));
    const nonMerchantRoles=["shared_operator","privacy_controller","website_operator","manufacturer","payment_processor"];
    const matchedNonMerchantCompanies=(e.relationships ?? []).filter(r=>nonMerchantRoles.includes(r.role) && factAppliesOnDate(r,date) && r.names.some(value=>rawNameDescriptors.some((name,index)=>matchesLogoAlias(name,{value,kind:"legal_operator",matchMode:"legal_entity",countryCodes:[],sourceUrl:r.sourceUrl},rawNameRoles[index],countries))));
    const nonMerchantCompanyNames=(e.relationships ?? []).filter(r=>nonMerchantRoles.includes(r.role)).flatMap(r=>r.names);
    const containsNonMerchantCompany=(t:string)=>nonMerchantCompanyNames.some(n=>bounded(t,identityText(n)));
    const onlyCompanyName=rawText.some(containsNonMerchantCompany) && !rawTradeMatches.some(a=>rawText.some(t=>bounded(t,identityText(a.value)) && !containsNonMerchantCompany(t)));
    const developerOnlyName = (e.relationships ?? []).some(r => r.role === "developer" && r.names.some(n => identityText(n) !== identityText(e.name) && rawText.some(t => bounded(t,identityText(n)))));
    const separateTradeName = rawTradeMatches.some(a => rawText.some(t => bounded(t,identityText(a.value)) && !(e.relationships ?? []).some(r => r.role === "developer" && r.names.some(n => identityText(n) !== identityText(e.name) && bounded(t,identityText(n))))));
    const confirmedTradingName = input.merchantNameConfirmed && activeAliases.some(a => a.kind === "trade_name" && matchesLogoAlias(cleanName ?? "",a,"tradeName",countries) && (!confirmedLegalLabel || clean === identityText(e.name)));
    let score = 0, strongest: LogoAlias | null = null, rawMatched = false;
    for (const a of e.aliases) {
      const alias = identityText(a.value); if (!alias) continue;
      const rawMatch = rawAliasMatch(a);
      const cleanMatch = matchesLogoAlias(cleanName ?? "",a,a.kind === "legal_operator" ? "legalName" : "tradeName");
      if (!rawMatch && !cleanMatch) continue;
      if (a.validFrom && (!date || date < a.validFrom) || a.validTo && (!date || date > a.validTo)) continue;
      const scopeMissing = a.kind === "legal_operator" && a.registeredCountryCode ? !aliasScopeMatches(a) : a.countryCodes.length > 0 && !countries.some(c => a.countryCodes.includes(c));
      const historic = a.kind === "historical_name";
      const qualified = alias !== identityText(e.name) || /[()]/.test(e.name);
      const fullShortTradeName = e.kind === "company" && alias === identityText(e.name) && alias.length >= 4;
      let s = rawMatch ? 84 : 70;
      if (cleanMatch && input.merchantNameConfirmed && (a.kind !== "trade_name" || confirmedTradingName)) s = 95;
      if (alias.length < 5 && !fullShortTradeName) s = rawMatch ? 55 : 45;
      if (qualified) s -= 4;
      if (scopeMissing && a.kind !== "trade_name") s = Math.min(s, 55);
      if (!scopeMissing && (a.countryCodes.length || a.registeredCountryCode || a.primarySourceVerified) && a.kind !== "trade_name" && rawMatch) s = Math.max(s + 10, 88);
      if (historic) s = Math.min(s, 55); // No unverified effective dates invented from acquisition aliases.
      if (rawMatch && !input.merchantNameConfirmed) s = Math.min(s,aliasRawConfidence(a));
      // Prefer a sourced, distinctive trade name over its ambiguous shorter alias.
      // A later duplicate of the shorter alias must not erase the qualification.
      const narrowerTradeMatch = strongest?.requiresDistinctiveEvidence && !a.requiresDistinctiveEvidence && rawTradeMatches.includes(a) && alias.startsWith(identityText(strongest.value)+" ");
      const broaderDistinctiveAlias = a.requiresDistinctiveEvidence && strongest?.kind === "trade_name" && rawTradeMatches.includes(strongest) && identityText(strongest.value).startsWith(alias+" ");
      if (narrowerTradeMatch || s > score && !broaderDistinctiveAlias) { score = s; strongest = a; rawMatched = rawMatch; }
    }
    const domainMatch = merchantDomains(e).some(d => domains.includes(d));
    if (matchedScopedAliases.length && !strongest) { score = Math.max(score,55); evidence.push("scoped_alias_context_required"); }
    if (pendingIds.length) { score = Math.max(score,55); evidence.push("identifier_namespace_incomplete"); }
    const domainContextMissing = domains.filter(d => !merchantDomains(e).includes(d) && e.domainFacts?.some(f => f.value === d && f.role === "merchant"));
    if (domainContextMissing.length) { score = Math.max(score,55); evidence.push("merchant_domain_context_requires_review"); }
    conflicts.push(...identityIdentifierConflicts(e,observations,date));
    if (domainMatch && domains.some(d => !merchantDomains(e).includes(d))) conflicts.push("conflicting_merchant_domains");
    if (domains.some(d => !merchantDomains(e).includes(d) && e.domainFacts?.some(f => f.value === d && f.role === "merchant" && !factAppliesOnDate(f,date)))) conflicts.push("dated_merchant_domain_does_not_apply");
    if (domains.some(d => !merchantDomains(e).includes(d) && countries.length === 1 && e.domainFacts?.some(f => f.value === d && f.role === "merchant" && f.countryCodes?.length && !f.countryCodes.includes(countries[0])))) conflicts.push("merchant_domain_country_mismatch");
    if (domainContextMissing.some(d => !countries.length && e.domainFacts?.some(f => f.value === d && f.role === "merchant" && f.countryCodes?.length))) conflicts.push("merchant_domain_country_required");
    if (!countries.length && (e.countryCodes.length || strongest?.countryCodes.length || conflicts.includes("merchant_domain_country_required"))) missingContext.add("merchantCountry");
    if (!date && (conflicts.includes("dated_merchant_domain_does_not_apply") || conflicts.includes("dated_scoped_alias_does_not_apply"))) missingContext.add("transactionDate");
    if (domainMatch) { score = Math.max(score, 95); evidence.push("exact_merchant_domain"); }
    if (facts.ids.length) { score = Math.max(score,98); evidence.push(...facts.ids.map(id => `verified_${id.kind}:${id.countryCode}${id.issuer ? ":"+id.issuer : ""}`)); }
    if (facts.addresses.length) { score = Math.max(score,96); evidence.push("verified_branch_address"); }
    if (parentMatches.length) { score = Math.max(score,40); evidence.push("parent_relationship_only_is_not_merchant_identity"); }
    if (matchedNonMerchantCompanies.length) {
      score=Math.max(score,55); evidence.push("company_role_requires_trading_brand");
      if (!rawTradeMatches.length && !matchedOperatorAliases.length) missingContext.add("verifiedOperator");
    }
    if (!score) return [];
    if (strongest) evidence.push(`${rawMatched ? "raw" : "clean"}_${strongest.kind}:${strongest.value}`);
    if (strongest?.kind === "legal_operator" && !strongest.countryCodes.length && !strongest.registeredCountryCode) evidence.push("operator_geographic_scope_unverified");
    if (strongest?.registeredCountryCode && strongest.kind === "legal_operator") {
      if (!registeredCountries.length) { missingContext.add("registeredCountry"); score=Math.min(score,65); }
      else if (!aliasScopeMatches(strongest)) conflicts.push("operator_registration_country_mismatch");
      else evidence.push("operator_registration_country_matches");
    }
    if (rawTradeMatches.length) evidence.push("direct_trade_name_supported");
    if (matchedOperatorAliases.length) evidence.push("legal_operator_supported");
    if (matchedScopedAliases.some(a => a.countryCodes.length && !a.registeredCountryCode && countries.length === 1 && !a.countryCodes.includes(countries[0]) && !aliasHasActiveEquivalent(a))) conflicts.push("scoped_alias_country_mismatch");
    const operatorIds = new Set(matchedOperatorAliases.map(a => a.entityId).filter(Boolean));
    if (facts.ids.some(id => id.entityId && operatorIds.size && !operatorIds.has(id.entityId))) conflicts.push("operator_identifier_mismatch");
    // A complete operator name with applicable sourced dates can support an older brand.
    // A historical trading label alone still needs review, even when a date is present.
    const datedOperatorSupported = matchedOperatorAliases.some(a => Boolean(a.validFrom || a.validTo));
    if (!input.merchantNameConfirmed && !datedOperatorSupported && e.aliases.some(a => a.kind === "historical_name" && rawText.some(n => bounded(n,identityText(a.value))))) evidence.push("historical_identity_requires_review");
    if (strongest?.kind === "trade_name" && rawMatched && !domainMatch && !confirmedTradingName) {
      const alias = identityText(strongest.value);
      const matches = rawText.map((name,index)=>({name,role:rawNameRoles[index]})).filter(m => bounded(m.name,alias));
      const isUnverifiedLegalName = (m: {name:string;role:string}) => m.name !== alias && (legalEntityText(m.name) || m.role === "legalName");
      if (matches.length && matches.every(isUnverifiedLegalName)) { score = Math.min(score,65); evidence.push("legal_operator_relationship_unverified"); }
    }
    if (strongest?.kind !== "trade_name" && strongest?.countryCodes.some(c => countries.includes(c))) evidence.push("operator_country_matches");
    if (countries.length > 1) conflicts.push("conflicting_merchant_countries");
    if (countries.length === 1 && e.countryCodes.length) {
      if (e.countryCodes.includes(countries[0])) { score += 12; evidence.push("merchant_country_matches"); }
      else conflicts.push("merchant_country_mismatch");
    }
    if (strongest?.countryCodes.length && !strongest.registeredCountryCode && strongest.kind !== "trade_name" && countries.length === 1 && !strongest.countryCodes.includes(countries[0])) conflicts.push("operator_country_mismatch");
    if (e.locality && localities.length) {
      if (localities.includes(identityText(e.locality))) { score += 15; evidence.push("merchant_locality_matches"); }
      else conflicts.push("merchant_locality_mismatch");
    }
    if (explicitIndustry.length && !explicitIndustry.every(i => industries.has(i))) conflicts.push("merchant_industry_mismatch");
    if (explicitIndustry.some(i => industries.has(i))) { score += 10; evidence.push("explicit_industry_matches"); }
    else if (categoryHints.some(i => industries.has(i))) { score += 3; evidence.push("category_industry_hint"); }
    if (rawMatched && evidence.includes("merchant_country_matches") && evidence.includes("explicit_industry_matches")) score = Math.max(score, 88);
    if (!rawMatched && !input.merchantNameConfirmed && !domainMatch && !facts.ids.length && !facts.addresses.length) score = Math.min(score,70);
    if (nameConfidence < 80 && !input.merchantNameConfirmed && !domainMatch && !facts.ids.length && !facts.addresses.length) score = Math.min(score,nameConfidence);
    if (strongest && rawMatched && !input.merchantNameConfirmed && !domainMatch && !facts.ids.length && !facts.addresses.length) {
      score = Math.min(score,aliasRawConfidence(strongest));
      if (aliasRawConfidence(strongest) < 84) evidence.push("name_confidence_requires_review");
    }
    if (!domainMatch && !facts.ids.length && !facts.addresses.length && e.locality && !localities.includes(identityText(e.locality)) && !rawText.some(t => bounded(t, identityText(e.locality!)))) score = Math.min(score, 65);
    if (strongest?.kind === "historical_name") score = Math.min(score, 65);
    if (evidence.includes("legal_operator_relationship_unverified") && !facts.ids.length && !facts.addresses.length) score = Math.min(score,65);
    if (evidence.includes("operator_geographic_scope_unverified") && !domainMatch && !facts.ids.length && !facts.addresses.length) score = Math.min(score,65);
    if (developerOnlyName && !separateTradeName && !matchedOperatorAliases.length && !domainMatch && !facts.ids.length && !facts.addresses.length && !confirmedTradingName) {
      score = Math.min(score,65); evidence.push("app_developer_does_not_establish_merchant_identity");
    }
    if (onlyCompanyName && !domainMatch && !facts.ids.length && !facts.addresses.length && !matchedOperatorAliases.length && !confirmedTradingName) {
      score=Math.min(score,65); evidence.push("shared_company_does_not_identify_trading_brand");
    }
    // A newly verified operator does not make its company name unique when a
    // second brand is already documented as using that same company.
    const sharedOperatorNames = matchedOperatorAliases.filter(alias => [...pool].some(other => {
      if (other.brandId === e.brandId || countries.length === 1 && other.countryCodes.length && !other.countryCodes.includes(countries[0])) return false;
      return (other.relationships ?? []).some(company => ["legal_operator", "franchisee", "shared_operator"].includes(company.role)
        && (!date || factAppliesOnDate(company,date))
        && (!company.countryCodes.length || !countries.length || company.countryCodes.some(c=>countries.includes(c)))
        && (!company.registeredCountryCode || !registeredCountries.length || registeredCountries.includes(company.registeredCountryCode))
        && company.names.some(name=>identityLegalText(name) === identityLegalText(alias.value)));
    })).map(alias=>alias.value);
    const independentlyNamedBrand = rawTradeMatches.some(alias => rawText.some(text => bounded(text,identityText(alias.value))
      && !sharedOperatorNames.some(name=>bounded(text,identityText(name)))));
    if (sharedOperatorNames.length && !independentlyNamedBrand && !confirmedTradingName && !domainMatch && !facts.ids.length && !facts.addresses.length) {
      score=Math.min(score,65);
      if (!evidence.includes("shared_company_does_not_identify_trading_brand")) evidence.push("shared_company_does_not_identify_trading_brand");
      missingContext.add("domain");
    }
    if (evidence.includes("historical_identity_requires_review")) score = Math.min(score,65);
    if (strongest?.requiresDistinctiveEvidence && !domainMatch && !facts.ids.length && !facts.addresses.length && !matchedOperatorAliases.some(a=>!a.requiresDistinctiveEvidence)) {
      score = Math.min(score,70);
      evidence.push(strongest.kind === "legal_operator" ? "ambiguous_legal_name_requires_distinctive_evidence" : "ambiguous_trade_name_requires_distinctive_evidence");
      missingContext.add("domain");
    }
    if (strongest && (strongest.requiresContext || identityNeedsAdditionalContext(strongest.value)) && !domainMatch && !facts.ids.length && !facts.addresses.length && !(evidence.includes("explicit_industry_matches") && evidence.includes("merchant_country_matches") || evidence.includes("merchant_locality_matches"))) score = Math.min(score, 70);
    if (strongest && identityText(strongest.value).length < 5 && !(e.kind === "company" && identityText(strongest.value) === identityText(e.name) && identityText(strongest.value).length >= 4) && !domainMatch && !facts.ids.length && !facts.addresses.length && !evidence.includes("merchant_country_matches") && !evidence.includes("operator_country_matches") && !evidence.includes("explicit_industry_matches")) score = Math.min(score, 65);
    const entityIds = new Set([...matchedOperatorAliases.map(a=>a.entityId),...facts.ids.map(id=>id.entityId)].filter(Boolean));
    const matchedEntities = (e.relationships ?? []).filter(r => entityIds.has(r.entityId) || parentMatches.includes(r) || matchedNonMerchantCompanies.includes(r));
    if (strongest && (strongest.requiresContext || identityNeedsAdditionalContext(strongest.value)) && !domainMatch && !facts.ids.length && !facts.addresses.length) missingContext.add("domain");
    const sources: NonNullable<MerchantIdentityResult["candidates"][number]["sources"]> = [];
    if (strongest?.sourceUrl) sources.push({kind:"alias",label:`${strongest.kind}: ${strongest.value}`,url:strongest.sourceUrl,countryCodes:strongest.countryCodes,validFrom:strongest.validFrom,validTo:strongest.validTo});
    for (const alias of matchedScopedAliases) if (alias !== strongest && alias.sourceUrl) sources.push({kind:"alias",label:`${alias.kind}: ${alias.value}`,url:alias.sourceUrl,countryCodes:alias.countryCodes,validFrom:alias.validFrom,validTo:alias.validTo});
    for (const f of e.domainFacts ?? []) if (f.role === "merchant" && domains.includes(f.value)) sources.push({kind:"domain",label:f.value,url:f.sourceUrl,countryCodes:f.countryCodes ?? [],validFrom:f.validFrom,validTo:f.validTo});
    for (const id of [...facts.ids,...pendingIds.map(p=>p.id)]) sources.push({kind:"identifier",label:`${id.kind} namespace: ${id.scheme ?? id.issuer ?? "unspecified"}`,url:id.sourceUrl,countryCodes:[id.countryCode],validFrom:id.validFrom,validTo:id.validTo});
    for (const branch of facts.addresses) sources.push({kind:"branch",label:"Merchant branch",url:branch.sourceUrl,countryCodes:[branch.countryCode],validFrom:branch.validFrom,validTo:branch.validTo});
    return [{ e, score: Math.min(99, score), evidence, conflicts, matchedEntities, missingContext:[...missingContext], sources, alias: identityText(strongest?.value ?? ""), rawMatched }];
  });
  // More specific merchant names beat a contained parent name (Uber Eats vs Uber).
  let viable = ranked.filter(c => !c.conflicts.length).filter(c => !ranked.some(other => !other.conflicts.length && other.rawMatched && c.rawMatched && other.alias.length > c.alias.length && bounded(other.alias,c.alias)));
  if (input.merchantNameConfirmed && clean) viable = viable.filter(c => c.e.aliases.some(a => matchesLogoAlias(cleanName ?? "",a,a.kind === "legal_operator" ? "legalName" : "tradeName",countries)
    && (!confirmedLegalLabel || clean === identityText(c.e.name) || a.kind === "legal_operator" && factAppliesOnDate(a,date) && aliasScopeMatches(a))));
  const supportFamilies = ["exact_merchant_domain", "verified_tax_id:", "verified_merchant_id:", "verified_business_registration:", "verified_branch_address", "direct_trade_name_supported", "legal_operator_supported"];
  const supportSets = supportFamilies.map(f => new Set((input.merchantNameConfirmed && ["direct_trade_name_supported", "legal_operator_supported"].includes(f) ? viable : ranked).filter(c => c.evidence.some(e => e.startsWith(f)) && c.score >= 84).map(c => c.e.brandId))).filter(s => s.size);
  const identityConflict = supportSets.length > 1 && ![...supportSets[0]].some(b => supportSets.every(s => s.has(b)));
  if (!identityConflict && supportSets.length) viable = viable.filter(c => supportSets.every(s => s.has(c.e.brandId)));
  viable.sort((a,b) => b.score-a.score || a.e.entryId.localeCompare(b.e.entryId));
  const perBrand = new Map<string, typeof viable[number]>();
  for (const c of viable) if (!perBrand.has(c.e.brandId)) perBrand.set(c.e.brandId,c);
  const top = viable[0], second = [...perBrand.values()][1];
  let reason = top ? "identity_evidence_insufficient" : ranked.length ? input.merchantNameConfirmed ? "confirmed_merchant_label_requires_identity_review" : "identity_context_conflict" : "no_identity_match";
  let selectable = !!top && top.score >= 84 && (!second || top.score-second.score >= 12);
  if (second && top.score-second.score < 12) reason = "multiple_matching_companies";
  // Never pick the first country variant just because it sorts first.
  if (top) {
    const variants = viable.filter(c => c.e.brandId === top.e.brandId && c.score >= top.score-3);
    if (new Set(variants.map(c => c.e.artworkHash)).size > 1) { selectable = false; reason = "regional_artwork_requires_merchant_country"; }
  }
  if (selectable) reason = "distinct_identity_supported";
  if (identityConflict) { selectable = false; reason = "independent_identity_evidence_conflicts"; }
  if (parentMatchesOnly(viable)) { selectable = false; reason = "parent_company_does_not_identify_trading_brand"; }
  if (!selectable && !identityConflict && top?.evidence.includes("identifier_namespace_incomplete") && top.score < 84) reason = "identifier_context_required";
  // A common verb phrase is not enough to identify the Grab platform.
  const grabPhrase = /^grab (?:lunch|dinner|breakfast|coffee|a bite|some food)[.!?]*$/i.test((input.merchantRaw ?? "").trim());
  const explicitGrab = observations.some(o => o.field === "tradeName" && identityText(o.value) === "grab" && o.confidence >= 84)
    || !!input.merchantNameConfirmed && clean === "grab";
  const distinctiveGrab = top?.evidence.some(e => e === "exact_merchant_domain" || e.startsWith("verified_"));
  if (selectable && top?.e.brandId === "grab" && grabPhrase && !explicitGrab && !distinctiveGrab) {
    selectable = false;
    reason = "ambiguous_merchant_phrase";
  }

  const representatives = [...perBrand.values()];
  const list = [...representatives, ...viable.filter(c => !representatives.includes(c)), ...ranked.filter(c => c.conflicts.length)].slice(0,8);
  const status = selectable ? "suggested" : ranked.length ? "needs_review" : "unmatched";
  const candidates: MerchantIdentityResult["candidates"] = list.map(c => ({ brandId:c.e.brandId, entryId:c.e.entryId, name:c.e.name, countryCodes:c.e.countryCodes, industry:c.e.industry, locality:c.e.locality, confidence:c.score, evidence:c.evidence, conflicts:c.conflicts, matchedEntities:c.matchedEntities, missingContext:c.missingContext,sources:c.sources }));
  return { version: LOGO_IDENTITY_VERSION, catalogDigest: catalog.catalogDigest, inputKey: merchantIdentityInputKey(input), status,
    brandId: selectable ? top.e.brandId : null, entryId: selectable ? top.e.entryId : null,
    logoPath: selectable ? top.e.iconPath : null, confidence: top?.score ?? 0, reason, observations,
    candidates, reviewHints:identityReviewHints(status,reason,candidates,observations) };
}

export function enrichMerchantIdentityPayload(input: MerchantIdentityInput): Record<string, unknown> {
  const existing = input.normalizedPayload && typeof input.normalizedPayload === "object" && !Array.isArray(input.normalizedPayload) ? input.normalizedPayload as Record<string,unknown> : {};
  const accountCountries = [...new Set(collectMerchantIdentityContext(input).observations.filter(o => o.field === "accountCountry").map(o => o.value))];
  let institutionIdentity = input.institution ? resolveMerchantIdentity({
    merchantRaw: input.institution, merchantCountry: accountCountries.length === 1 ? accountCountries[0] : null,
    industry: "financial-services",
  }, financialCatalog) : null;
  if (institutionIdentity && accountCountries.length > 1) institutionIdentity = {
    ...institutionIdentity, status: "needs_review", brandId: null, entryId: null, logoPath: null,
    reason: "conflicting_account_countries",
    reviewHints:[{field:"accountCountry",message:"Check the account institution's country; conflicting account-country evidence must be resolved."}],
  };
  if (institutionIdentity) {
    const prior = existing.institutionIdentity && typeof existing.institutionIdentity === "object" ? existing.institutionIdentity as Record<string,unknown> : {};
    institutionIdentity = { ...institutionIdentity, reviewHints:institutionIdentity.reviewHints?.map(h => h.field === "merchantCountry" ? {field:"accountCountry",message:"Check the account institution's country on its statement; currency alone does not establish its region."} : h), institutionNameKey: identityText(input.institution!), accountContextKey: institutionIdentityContextKey(input),
      ...(typeof prior.sourceAccountId === "string" ? { sourceAccountId:prior.sourceAccountId } : input.accountId ? { sourceAccountId:input.accountId } : {}) };
  }
  return { ...existing, merchantIdentity: resolveMerchantIdentity(input), ...(institutionIdentity ? { institutionIdentity } : {}) };
}

const financialCatalog = defaultCatalog.filter(e => e.industry === "financial-services" && e.kind !== "company");

function parentMatchesOnly(candidates: Array<{ score:number; evidence:string[] }>) {
  return candidates.length > 0 && candidates.every(c => c.score < 84 && c.evidence.includes("parent_relationship_only_is_not_merchant_identity"));
}
