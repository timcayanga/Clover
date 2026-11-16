/** Business identifiers are opaque. Preserve leading zeros; never substitute O/0 or strip letters. */
export const businessIdentifierKey = (value: string) => value.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");

export function quoteContainsBusinessIdentifier(quote: string, value: string) {
  const key = businessIdentifierKey(value);
  if (!key || key.length > 256) return false;
  const escaped = [...key].map(char => char.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("[\\s-]*");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,"u").test(quote.normalize("NFKC").toUpperCase());
}

export function identityConfidence(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value > 0 && value <= 1 ? value * 100 : value)));
}

export function merchantDomain(value: string): string {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) return "";
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return ""; }
}

export function factAppliesOnDate(fact: { validFrom?: string; validTo?: string }, date: string | null) {
  if ((fact.validFrom || fact.validTo) && !date) return false;
  return !(fact.validFrom && date! < fact.validFrom || fact.validTo && date! > fact.validTo);
}

/** A printed ISO day belongs to the document's calendar, not the server's UTC offset. */
export function identityDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0,10) : null;
  const day = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T\d{2}:\d{2})/)?.[1];
  if (!day || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) return null;
  if (value !== day && !Number.isFinite(Date.parse(value))) return null;
  return day;
}

export function validateIdentityFact(fact: { sourceUrl?: string | null; validFrom?: string; validTo?: string }, label: string) {
  if (!fact.sourceUrl || !merchantDomain(fact.sourceUrl)) throw Error(`${label}: a source website is required`);
  for (const date of [fact.validFrom, fact.validTo]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw Error(`${label}: invalid effective date`);
  }
  if (fact.validFrom && fact.validTo && fact.validFrom > fact.validTo) throw Error(`${label}: reversed date interval`);
}

/** An asset repository/CDN describes artwork retrieval, not the merchant's business website. */
export function isInfrastructureDomain(host: string) {
  return /(^|\.)(apple\.com|mzstatic\.com|google\.com|gstatic\.com|github\.com|githubusercontent\.com|npmjs\.com|jsdelivr\.net|unpkg\.com|wikimedia\.org|wikipedia\.org|facebook\.com|instagram\.com|cloudfront\.net|amazonaws\.com|bigcontent\.io)$/.test(host);
}
