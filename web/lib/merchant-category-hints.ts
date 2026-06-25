const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const compactWhitespace = (value: string) => normalizeWhitespace(value).replace(/\s+/g, "");

export const isLikelyPersonTransferName = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  const cleaned = normalized.replace(/[^A-Za-z\s.'’-]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return false;
  }

  if (
    /\b(?:airport|mall|market|grocer|grocery|restaurant|cafe|coffee|bar|books?|school|college|opera|harbour|transport|bus|train|station|parking|souvenir|tourism|travel|travels|sanctuary|victoria|ticket|tickets|supermarket|shop|store|mart|paypal|amazon|prime|mcdonald|milksha|gogyo|gokan|goken|leone|project|woolworths|coles|dumplings|sushi|seafood|mini\s+mart|donki|byrdi|seeds|estate|vacation|nirvana|waterfront|relay|skybus|citibank|bank|finance|financial|oil|convenience|mitrtown|payments?)\b/i.test(
      cleaned
    )
  ) {
    return false;
  }

  const tokens = cleaned
    .split(" ")
    .filter(Boolean)
    .filter((token) => token !== "." && !/^(?:AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|JPY|NZD|PHP|SGD|THB|USD)$/.test(token));
  if (tokens.length === 0 || tokens.length > 4) {
    return false;
  }

  const validTokens = tokens.filter((token) => /^[A-Z][a-z]+$/.test(token) || /^[A-Z]{2,}$/.test(token) || /^[A-Z]\.?$/.test(token)).length;
  if (tokens.length >= 2 && validTokens === tokens.length) {
    return true;
  }

  return tokens.length === 1 && /^[A-Z]{4,}$/.test(tokens[0] ?? "");
};

export const getSharedMerchantCategoryHint = (value: string): string | null => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const compact = compactWhitespace(normalized).toLowerCase();

  if (isLikelyPersonTransferName(value)) {
    return "Transfers";
  }

  if (
    /pedro\s+the\s+grocer|grocer\b|grocery|supermarket|mcdonald'?s|milksha|gogyo|gokan|goken|savory\s+project|bar\s+leone|four\s+frogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|mini\s+mart|7-?eleven|don\s+don\s+donki|proud\s+mary|byrdi|seven\s+seeds|amiri|toby'?s\s+estate|vacation\s+cafe|nirvana\s+restaurant|waterfront\s+mini\s+mart|apollo\s+bay\s+seafood|wootea|liberty\s+oil\s+convenience|iga\s+supermarkets?|caretaker'?s\s+cottage|lee'?s\s+dumplings|samyan\s+mitrtown|jacks\s+of\s+bath|vesper|black\s+cabin\s+bar|coco\s+group|coco\s+dewata|nat'?s\s+rustic|moonlit\s+sanctuary/.test(
      lower
    ) ||
    /pedrothegrocer|grocery|supermarket|mcdonalds|milksha|gogyo|gokan|goken|savoryproject|barleone|fourfrogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|minimart|7eleven|dondondonki|proudmary|byrdi|sevenseeds|amiri|tobysestate|vacationcafe|nirvanarestaurant|waterfrontminimart|apollobayseafood|wootea|libertyoilconvenience|igasupermarkets?|caretakerscottage|leesdumplings|samyanmitrtown|jacksofbath|vesper|blackcabinbar|cocogroup|cocodewata|natsrustic|moonlitsanctuary/.test(
      compact
    )
  ) {
    return "Food & Dining";
  }

  if (/transport\s+for\s+nsw|skybus|parking|airport|rail|trainpal|hk\s+airport|liberty\s+oil|fuel|petrol|gas\s+station/.test(lower) || /transportfornsw|skybus|parking|airport|rail|trainpal|hkairport|libertyoil|fuel|petrol|gasstation/.test(compact)) {
    return "Transport";
  }

  if (/sydney\s+opera\s+house|ticket\s+sales|htg\s+ticket\s+sales|theatre|theater|museum|gallery/.test(lower) || /sydneyoperahouse|ticketsales|htgticketsales|theatre|theater|museum|gallery/.test(compact)) {
    return "Entertainment";
  }

  if (
    /sydney\s+harbour\s+gifts?|melbourne\s+souvenir|u\s+neek\s+souvenirs?|great\s+ocean\s+road|great\s+ocean\s+road\s+choc|tourism|news\s+travels?|sanctuary|parks?\s+victoria/.test(lower) ||
    /sydneyharbourgifts?|melbournesouvenir|uneeksouvenirs?|greatoceanroad|greatoceanroadchoc|tourism|newstravels?|sanctuary|parksvictoria/.test(compact)
  ) {
    return "Travel & Lifestyle";
  }

  if (/relay\b|amazon|alibaba|camera|paypal|viator(?:\.com)?|locker\s+hire|emmanuel\s+payments?/.test(lower) || /relay|amazon|alibaba|camera|paypal|viator|lockerhire|emmanuelpayments?/.test(compact)) {
    return "Shopping";
  }

  if (/books?\b|asia\s+books/.test(lower) || /books|asiabooks/.test(compact)) {
    return "Education";
  }

  return null;
};
