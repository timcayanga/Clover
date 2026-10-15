import type { LogoAlias } from "./logo-identity-types";
import { identityCountry, identityLegalText, identityText } from "./merchant-identity-context";

/** A legal-name field is a complete entity name; descriptor-only country tails are separate. */
export function matchesLogoAlias(name:string, alias:LogoAlias, role:"descriptor"|"legalName"|"tradeName" = "descriptor", countries:string[] = []) {
  if (alias.kind === "statement_descriptor" && role !== "descriptor") return false;
  if (alias.pattern === "literal_token") {
    if (alias.kind !== "statement_descriptor" || !alias.primarySourceVerified) return false;
    const literal=alias.value.normalize("NFKC").toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,"\\$&").split("\\*").join("\\s*\\*\\s*");
    return new RegExp(`(?:^|[\\s*])${literal}(?=$|\\s)`,"u").test(name.normalize("NFKC").toLowerCase());
  }
  if (alias.pattern === "star_prefix") return role === "descriptor" && name.trim().toLowerCase().startsWith(alias.value.toLowerCase()+"*");
  if (alias.kind !== "legal_operator" && alias.matchMode !== "legal_entity") return (` ${identityText(name)} `).includes(` ${identityText(alias.value)} `);
  const normalized=identityLegalText(name), legal=identityLegalText(alias.value);
  if (normalized === legal) return true;
  if (role !== "descriptor" || !normalized.startsWith(`${legal} `)) return false;
  // Accept only a country tail, never an additional corporation, branch or business word.
  const country=identityCountry(normalized.slice(legal.length+1));
  return !!country && countries.includes(country);
}
