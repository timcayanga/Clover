import catalog from "./bank-logo-catalog.json";

// Keep a stable pathname for saved choices; change only the cache version when
// an original changes, so an older saved selection still resolves after deploy.
export const ADDITIONAL_BANK_LOGOS = catalog.map((logo) => ({ ...logo, src: logo.src.replace(/-([a-f0-9]{10})\.webp$/, ".webp?v=$1") }));
export const normalizeLogoName = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const regionNames: Record<string, string[]> = { uk: ["uk", "united kingdom", "britain"], "hong kong": ["hong kong", "hk"], netherlands: ["netherlands", "dutch"] };
const matches = ADDITIONAL_BANK_LOGOS.flatMap((logo) => [logo.label, ...logo.aliases].map((alias) => ({ logo, alias: normalizeLogoName(alias) })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function findAdditionalBankLogo(value: string) {
  const text = ` ${normalizeLogoName(value)} `;
  const candidates = matches.filter(({ alias }) => text.includes(` ${alias} `));
  // Prefer an explicitly named country; never infer location from a logo.
  const regional = candidates.find(({ logo }) => (regionNames[logo.region] ?? [logo.region]).some((region) => text.includes(` ${region} `)));
  const match = regional ?? candidates[0];
  return match ? { ...match.logo, explicitRegion: Boolean(regional) } : null;
}
