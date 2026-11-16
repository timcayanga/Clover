import { resolveTransactionContext } from "@/lib/context-corpus";

export type ConfirmedContextObservation = {
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  categoryName?: string | null;
  type?: "income" | "expense" | "transfer" | null;
  currency?: string | null;
  countryCode?: string | null;
  regionCode?: string | null;
  reviewStatus: "confirmed" | "edited" | "suggested" | "pending_review" | "rejected";
  confidence?: number | null;
  teachabilityScore?: number | null;
}

export type ContextCorpusCandidate = {
  normalizedName: string;
  aliases: string[];
  countryCode: string | null;
  regionCode: string | null;
  categoryHint: string;
  transactionTypeHint: "income" | "expense" | "transfer";
  observationCount: number;
  distinctCurrencies: string[];
  confidence: number;
  source: "learned";
  reviewStatus: "candidate";
  evidence: string[];
};

const normalizeCandidateText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const isGenericCandidateName = (value: string) =>
  value.length < 3 || /^(account|bank|cash|card|payment|transfer|unknown|other|merchant|payee)$/i.test(value);

const observationToKey = (observation: ConfirmedContextObservation) => {
  const normalizedName = normalizeCandidateText(observation.merchantClean || observation.merchantRaw || observation.description);
  const categoryHint = String(observation.categoryName ?? "").trim();
  const type = observation.type ?? null;
  const context = resolveTransactionContext({
    merchantRaw: observation.merchantRaw,
    merchantClean: observation.merchantClean,
    description: observation.description,
    currency: observation.currency,
  });
  return { normalizedName, categoryHint, type, context };
};

export const proposeContextCorpusCandidates = (
  observations: ConfirmedContextObservation[],
  options: { minimumObservations?: number; minimumConfidence?: number } = {}
): ContextCorpusCandidate[] => {
  const minimumObservations = Math.max(2, options.minimumObservations ?? 3);
  const minimumConfidence = Math.max(0, Math.min(100, options.minimumConfidence ?? 75));
  const groups = new Map<string, ConfirmedContextObservation[]>();

  for (const observation of observations) {
    if (!(["confirmed", "edited"] as string[]).includes(observation.reviewStatus)) continue;
    if ((observation.confidence ?? 100) < minimumConfidence) continue;
    if ((observation.teachabilityScore ?? 100) < minimumConfidence) continue;
    const { normalizedName, categoryHint, type } = observationToKey(observation);
    if (!normalizedName || isGenericCandidateName(normalizedName) || !categoryHint || !type) continue;
    const key = `${normalizedName}::${categoryHint.toLowerCase()}::${type}`;
    const group = groups.get(key) ?? [];
    group.push(observation);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length >= minimumObservations)
    .map(([key, group]) => {
      const first = group[0]!;
      const firstKey = observationToKey(first);
      const aliases = [...new Set(group.flatMap((observation) => [observation.merchantClean, observation.merchantRaw]).filter(Boolean).map(normalizeCandidateText))];
      const countries = [...new Set(group.map((observation) => observation.countryCode ?? observationToKey(observation).context.countryCode).filter(Boolean))];
      const regions = [...new Set(group.map((observation) => observation.regionCode ?? observationToKey(observation).context.regionCode).filter(Boolean))];
      const currencies = [...new Set(group.map((observation) => String(observation.currency ?? "").trim().toUpperCase()).filter(Boolean))];
      const consistencyBonus = Math.min(15, group.length * 2);
      const confidence = Math.min(74, 55 + consistencyBonus);
      return {
        normalizedName: firstKey.normalizedName,
        aliases,
        countryCode: countries.length === 1 ? countries[0]! : null,
        regionCode: regions.length === 1 ? regions[0]! : null,
        categoryHint: firstKey.categoryHint,
        transactionTypeHint: firstKey.type!,
        observationCount: group.length,
        distinctCurrencies: currencies,
        confidence,
        source: "learned" as const,
        reviewStatus: "candidate" as const,
        evidence: [
          `confirmed-observations:${group.length}`,
          `candidate-key:${key}`,
          ...(countries.length > 1 ? ["conflicting-country-evidence"] : []),
          ...(currencies.length > 1 ? ["multi-currency-observations"] : []),
        ],
      };
    });
};
