import { INSTITUTION_SUGGESTIONS } from "./institution-suggestions";
import { normalizeLogoName } from "./bank-logo-catalog";

export type InstitutionHint = { institution: string; confidence: number; matchedAlias: string };
const aliases = INSTITUTION_SUGGESTIONS.flatMap(institution =>
  [institution.label, ...institution.aliases].map(alias => ({ label: institution.label, alias: normalizeLogoName(alias) })),
).filter(match => match.alias.length >= 3).sort((a, b) => b.alias.length - a.alias.length);

/** A draft suggestion only. Account nicknames never identify ownership or merge accounts. */
export function suggestAccountInstitution(name: string, type = "bank"): InstitutionHint | null {
  // A stock's issuer is not necessarily its broker; do not infer investment providers.
  if (type === "cash" || type === "investment") return null;
  const text = ` ${normalizeLogoName(name)} `;
  const matches = aliases.flatMap(match => {
    const start = text.indexOf(` ${match.alias} `);
    return start < 0 ? [] : [{ ...match, start, end: start + match.alias.length + 2 }];
  });
  const best = matches[0];
  if (!best) return null;
  // Prefer a specific provider name over an alias within it. Different providers in
  // separate parts of the nickname are ambiguous and require the user's choice.
  if (matches.some(match => match.label !== best.label &&
    !(match.start >= best.start && match.end <= best.end))) return null;
  return {
    institution: best.label,
    confidence: text.trim() === best.alias ? 99 : 95,
    matchedAlias: best.alias,
  };
}

export function suggestedDraftInstitution(input: {
  name: string; type: string; currentInstitution: string; previousSuggestion: string;
  editedByUser: boolean; existingAccount: boolean;
}): string {
  if (input.existingAccount || input.editedByUser ||
    (input.currentInstitution && input.currentInstitution !== input.previousSuggestion)) return input.currentInstitution;
  return suggestAccountInstitution(input.name, input.type)?.institution ?? "";
}
