import type { IdentityObservation, LogoIdentity } from "./logo-identity-types";
import { identityText, identityLegalText } from "./merchant-identity-context";
import { businessIdentifierKey, factAppliesOnDate } from "./logo-identity-evidence";

const definitions = [
  { kind: "tax_id", value: "merchantTaxId", country: "taxCountry", namespace: "merchantTaxScheme" },
  { kind: "merchant_id", value: "merchantId", country: "merchantIdCountry", namespace: "merchantIdIssuer" },
  { kind: "business_registration", value: "businessRegistrationId", country: "registrationCountry", namespace: "registrationIssuer" },
] as const;

function evidenceGroups(observations: IdentityObservation[]) {
  const groups = new Map<string, IdentityObservation[]>();
  for (const o of observations.filter(o => o.confidence >= 80)) {
    const key = o.group ?? o.source, group = groups.get(key) ?? [];
    group.push(o); groups.set(key,group);
  }
  return [...groups.values()];
}
const values = (group: IdentityObservation[], field: IdentityObservation["field"], normalize = identityText) => [...new Set(group.filter(o => o.field === field).map(o => normalize(o.value)))];

/** Exact values retrieve provisional candidates, never proof without their issuing namespace. */
export function pendingIdentityIdentifiers(entry: LogoIdentity, observations: IdentityObservation[], date: string | null) {
  const groups = evidenceGroups(observations);
  const supported = supportingIdentityFacts(entry,observations,date).ids;
  return (entry.identifiers ?? []).flatMap(id => {
    if (supported.includes(id) || date && !factAppliesOnDate(id,date)) return [];
    const definition = definitions.find(d => d.kind === id.kind)!;
    const matchingGroups = groups.filter(group => values(group,definition.value,businessIdentifierKey).includes(businessIdentifierKey(id.value)));
    if (!matchingGroups.length) return [];
    const missing = new Set<string>();
    if (!date && (id.validFrom || id.validTo)) missing.add("transactionDate");
    for (const field of [definition.country,definition.namespace]) {
      if (matchingGroups.every(group => !values(group,field).length)) missing.add(field);
    }
    if (!missing.size) return [];
    if ([definition.country,definition.namespace].some(field => missing.has(field) && observations.some(o => o.field === field && o.confidence >= 80))) missing.add("coherentIdentifierEvidence");
    return [{id,missing:[...missing]}];
  });
}

/** Namespaces and identifiers must come from the same row/document/input envelope. */
export function supportingIdentityFacts(entry: LogoIdentity, observations: IdentityObservation[], date: string | null) {
  const groups = evidenceGroups(observations);
  const ids = (entry.identifiers ?? []).filter(id => {
    if (!factAppliesOnDate(id,date)) return false;
    const definition = definitions.find(d => d.kind === id.kind)!;
    const namespace = id.kind === "tax_id" ? id.scheme : id.issuer;
    return !!namespace && groups.some(group => {
      const identifiers = values(group,definition.value,businessIdentifierKey);
      const countries = values(group,definition.country, v => v);
      const namespaces = values(group,definition.namespace,identityLegalText);
      return identifiers.length === 1 && countries.length === 1 && namespaces.length === 1
        && identifiers[0] === businessIdentifierKey(id.value) && countries[0] === id.countryCode && namespaces[0] === identityLegalText(namespace);
    });
  });
  const addresses = (entry.locations ?? []).filter(location => location.role === "branch" && factAppliesOnDate(location,date)
    && !!location.postalCode && groups.some(group => {
      const countries = values(group,"merchantCountry",v=>v), streets = values(group,"streetAddress"), postcodes = values(group,"postalCode",businessIdentifierKey);
      return countries.length === 1 && streets.length === 1 && postcodes.length === 1 && countries[0] === location.countryCode
        && streets[0] === identityText(location.streetAddress) && postcodes[0] === businessIdentifierKey(location.postalCode!);
    }));
  return { ids, addresses };
}

/** A second identifier in a known namespace cannot be ignored in favor of the first match. */
export function identityIdentifierConflicts(entry: LogoIdentity, observations: IdentityObservation[], date: string | null) {
  const conflicts = new Set<string>();
  for (const group of evidenceGroups(observations)) for (const definition of definitions) {
    const identifiers = values(group,definition.value,businessIdentifierKey);
    if (!identifiers.length) continue;
    const countries = values(group,definition.country,v=>v), namespaces = values(group,definition.namespace,identityLegalText);
    if (identifiers.length > 1 || countries.length > 1 || namespaces.length > 1) {
      conflicts.add(`ambiguous_${definition.kind}_evidence`); continue;
    }
    if (countries.length !== 1 || namespaces.length !== 1) continue;
    const known = (entry.identifiers ?? []).filter(id => id.kind === definition.kind && id.countryCode === countries[0]
      && identityLegalText(id.kind === "tax_id" ? id.scheme ?? "" : id.issuer ?? "") === namespaces[0] && factAppliesOnDate(id,date));
    if (known.length && !known.some(id => businessIdentifierKey(id.value) === identifiers[0])) conflicts.add(`${definition.kind}_value_mismatch`);
  }
  return [...conflicts];
}
