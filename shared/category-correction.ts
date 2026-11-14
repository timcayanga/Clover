export const correctionScopes = ["transaction", "similar"] as const;
export type CorrectionScope = typeof correctionScopes[number];
export const scopedRuleSource = "manual_category_scope";

export function correctionMatch(row: { merchantRaw?: string | null; merchantClean?: string | null; description?: string | null; type?: string | null; isTransfer?: boolean }) {
  if (row.isTransfer || (row.type !== "expense" && row.type !== "income")) return null;
  const normalize = (value?: string | null) => (value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  let identity = normalize(row.merchantRaw);
  let label = row.merchantRaw?.trim() ?? "";
  const text = [identity, normalize(row.merchantClean), normalize(row.description)].join(" ");
  if (/\bgrab(?:\b|food\b|car\b|bike\b|mart\b|express\b|taxi\b|pay\b)/.test(text)) {
    const services = [...new Set(Array.from(text.matchAll(/\bgrab\s*(food|car|bike|mart|express|taxi)\b/g), match => match[1]))];
    if (services.length !== 1) return null;
    const service = services[0];
    identity = `grab ${service}`;
    label = `Grab${service[0].toUpperCase()}${service.slice(1)}`;
  }
  if (identity.length < 3 || identity.length > 160 || !/\p{L}/u.test(identity) || /^(?:(?:bank )?transaction|payment|purchase|expense|income|unknown|cash|transfer|other)(?: \d+)?$/.test(identity)) return null;
  return { key: `category scope ${row.type} ${identity}`, label };
}
