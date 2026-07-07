const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const compactWhitespace = (value: string) => normalizeWhitespace(value).replace(/\s+/g, "");

const matchesCategoryHint = (value: string, patterns: { lower?: RegExp; compact?: RegExp }) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const compact = compactWhitespace(normalized).toLowerCase();
  return Boolean((patterns.lower && patterns.lower.test(lower)) || (patterns.compact && patterns.compact.test(compact)));
};

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
    /\b(?:airport|mall|market|grocer|grocery|restaurant|cafe|coffee|bar|books?|school|college|opera|harbour|transport|bus|train|station|parking|souvenir|tourism|travel|travels|sanctuary|victoria|ticket|tickets|supermarket|shop|store|mart|paypal|amazon|prime|mcdonald|milksha|gogyo|gokan|goken|leone|project|woolworths|coles|dumplings|sushi|seafood|mini\s+mart|donki|byrdi|seeds|estate|vacation|nirvana|waterfront|relay|skybus|citibank|bank|finance|financial|oil|convenience|mitrtown|payments?|visa|provisioning|service|services?|road|great|ocean|choc|chocolate|chocolaterie|gift|gifts|grab|grabfood|grabcar|foodpanda|dunkin|donuts?|linkedin|spotify|netflix|openai|chatgpt|google|youtube|adobe|canva|jollibee|chowking|inasal|burger\s+king)\b/i.test(
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

  if (isLikelyPersonTransferName(value)) {
    return "Transfers";
  }

  if (
    matchesCategoryHint(value, {
      lower:
        /pedro\s+the\s+grocer|grocer\b|grocery|supermarket|mcdonald'?s|milksha|gogyo|gokan|goken|savory\s+project|bar\s+leone|four\s+frogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|mini\s+mart|7-?eleven|don\s+don\s+donki|proud\s+mary|byrdi|seven\s+seeds|amiri|toby'?s\s+estate|vacation\s+cafe|nirvana\s+restaurant|waterfront\s+mini\s+mart|apollo\s+bay\s+seafood|wootea|liberty\s+oil\s+convenience|iga\s+supermarkets?|caretaker'?s\s+cottage|lee'?s\s+dumplings|samyan\s+mitrtown|jacks\s+of\s+bath|vesper|black\s+cabin\s+bar|coco\s+group|coco\s+dewata|nat'?s\s+rustic|moonlit\s+sanctuary|bakery|bistro|kitchen|ramen|noodle|tea\s+house|burger|pizza|steak|grill|canteen|eatery|food\s+court|brunch|breakfast|lunch|dinner|dunkin(?:\s+donuts?)?|krispy\s+kreme|jollibee|chowking|mang\s+inasal|burger\s+king|foodpanda/,
      compact:
        /pedrothegrocer|grocery|supermarket|mcdonalds|milksha|gogyo|gokan|goken|savoryproject|barleone|fourfrogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|minimart|7eleven|dondondonki|proudmary|byrdi|sevenseeds|amiri|tobysestate|vacationcafe|nirvanarestaurant|waterfrontminimart|apollobayseafood|wootea|libertyoilconvenience|igasupermarkets?|caretakerscottage|leesdumplings|samyanmitrtown|jacksofbath|vesper|blackcabinbar|cocogroup|cocodewata|natsrustic|moonlitsanctuary|bakery|bistro|kitchen|ramen|noodle|teahouse|burger|pizza|steak|grill|canteen|eatery|foodcourt|brunch|breakfast|lunch|dinner|dunkin(?:donuts?)?|krispykreme|jollibee|chowking|manginasal|burgerking|foodpanda/,
    })
  ) {
    return "Food & Dining";
  }

  if (
    matchesCategoryHint(value, {
      lower: /transport\s+for\s+nsw|skybus|parking|airport|rail|trainpal|hk\s+airport|liberty\s+oil|fuel|petrol|gas\s+station|autopay\s+parking|toll|expressway|opera\s+house\s+parking|mall\s+parking|grab|grabcar|grabfood|move\s+it|angkas|joyride|taxi|uber|bus|train|mrt|lrt|ride/,
      compact: /transportfornsw|skybus|parking|airport|rail|trainpal|hkairport|libertyoil|fuel|petrol|gasstation|autopayparking|toll|expressway|operahouseparking|mallparking|grab|grabcar|grabfood|moveit|angkas|joyride|taxi|uber|bus|train|mrt|lrt|ride/,
    })
  ) {
    return "Transport";
  }

  if (
    matchesCategoryHint(value, {
      lower: /sydney\s+opera\s+house|ticket\s+sales|htg\s+ticket\s+sales|theatre|theater|museum|gallery|cinema|concert|show|festival|playhouse|exhibit/,
      compact: /sydneyoperahouse|ticketsales|htgticketsales|theatre|theater|museum|gallery|cinema|concert|show|festival|playhouse|exhibit/,
    })
  ) {
    return "Entertainment";
  }

  if (
    matchesCategoryHint(value, {
      lower: /sydney\s+harbour\s+gifts?|melbourne\s+souvenir|u\s+neek\s+souvenirs?|great\s+ocean\s+road|great\s+ocean\s+road\s+choc|tourism|news\s+travels?|sanctuary|parks?\s+victoria|travel|travels|holiday|harbour|souvenir|souvenirs|tour|tours|visitor|visit(?:or|ors)?\s+centre|gift\s+shop/,
      compact: /sydneyharbourgifts?|melbournesouvenir|uneeksouvenirs?|greatoceanroad|greatoceanroadchoc|tourism|newstravels?|sanctuary|parksvictoria|travel|travels|holiday|harbour|souvenir|souvenirs|tour|tours|visitor|visitorscentre|giftshop/,
    })
  ) {
    return "Travel & Lifestyle";
  }

  if (
    matchesCategoryHint(value, {
      lower: /relay\b|amazon|alibaba|camera|paypal|viator(?:\.com)?|locker\s+hire|emmanuel\s+payments?|shop\b|store\b|mart\b|convenience|provisioning\s+service|visa\s+provisioning\s+service|apple\s+pay|google\s+pay|gift\s+shop|duty\s+free/,
      compact: /relay|amazon|alibaba|camera|paypal|viator|lockerhire|emmanuelpayments?|shop|store|mart|convenience|provisioningservice|visaprovisioningservice|applepay|googlepay|giftshop|dutyfree/,
    })
  ) {
    return "Shopping";
  }

  if (matchesCategoryHint(value, { lower: /books?\b|asia\s+books|college|school|tuition|academy/, compact: /books|asiabooks|college|school|tuition|academy/ })) {
    return "Education";
  }

  if (
    matchesCategoryHint(value, {
      lower:
        /bill|utilities|electric|water|internet|phone|subscription|subscriptions|openai|chatgpt|netflix|spotify|linkedin|adobe|canva|icloud|google\s+one|youtube\s+premium|airalo|globe|smart|pldt|meralco|maynilad/,
      compact:
        /bill|utilities|electric|water|internet|phone|subscription|subscriptions|openai|chatgpt|netflix|spotify|linkedin|adobe|canva|icloud|googleone|youtubepremium|airalo|globe|smart|pldt|meralco|maynilad/,
    })
  ) {
    return "Bills & Utilities";
  }

  if (matchesCategoryHint(value, { lower: /citibank.*\bfin\b|bank.*\bfin\b|incoming\s+transfer|outgoing\s+transfer|fund\s+transfer/, compact: /citibank.*fin|bank.*fin|incomingtransfer|outgoingtransfer|fundtransfer/ })) {
    return "Transfers";
  }

  if (matchesCategoryHint(value, { lower: /bank|finance|fin\b|loan|interest|charge|fee/, compact: /bank|finance|fin|loan|interest|charge|fee/ })) {
    return "Financial";
  }

  return null;
};
