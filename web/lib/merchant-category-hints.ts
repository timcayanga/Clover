const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const compactWhitespace = (value: string) => normalizeWhitespace(value).replace(/\s+/g, "");

const normalizeOcrCompactHint = (value: string) =>
  compactWhitespace(value)
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/5/g, "s");

const SPECIFIC_MERCHANT_CATEGORY_HINTS: Array<{
  category: string;
  lower: RegExp;
  compact?: RegExp;
}> = [
  {
    category: "Food & Dining",
    lower:
      /grabfood|foodpanda|ubereats?|doordash|pickaroo|dunkin(?:\s+donuts?)?|krispy\s+kreme|jollibee|chowking|mang\s+inasal|burger\s+king|mcdonald'?s|starbucks|pickup\s+coffee|tim\s+hortons|shake\s+shack|subway|chili'?s|cara\s+mia|jarandjam|main\s+bar|ac\s+bar|dairy\s+queen|\bdq\b|panco\s+cafe|koi(?:\s+the)?|simply\s+gourmet|hapag|harlan\s*\+?\s*holden|matcha\s+bar|elephant\s+grounds|mo\s+cookies|nikkei|yardstick|your\s+local|brunch\s+bureau|breakfast\s+at\s+antonio'?s|royce|bok\s+korean\s+fried\s+chicken|din\s+tai\s+fung|arabica|ralph'?s\s+wines|mary\s+grace|wildflour|mendokoro|ramen\s+nagi|manam|conti'?s|coffee\s+bean|cbtl|seattle'?s\s+best|army\s+navy|mister\s+donut|kfc|popeyes|shakey'?s|yellow\s+cab|max'?s|panda\s+express|cibo|nono'?s|frankie'?s|botejyu|tuan\s+tuan|sunnies\s+cafe|bonchon|kenny\s+rogers|yoshinoya|marugame|kuya\s+j|mesa|samgyupsalamat|tim\s+ho\s+wan|gong\s+cha|chatime|koomi|macao\s+imperial|tiger\s+sugar|coco\s+fresh|bo'?s\s+coffee|coffee\s+project|toby'?s\s+estate|but\s+first,\s*coffee|happy\s+lemon|auntie\s+anne'?s|llao\s*llao|ooma|mango\s+tree|italianni'?s|tgi\s*friday'?s|the\s+fat\s+seed(?:\s+cafe)?|revolver\s+espresso|wholesome\s+table|wong\s+place|\bj\.?\s*co\b|jco|coffee\s+academics|bacolod\s+chicken\s+inasal/,
    compact:
      /grabfood|foodpanda|ubereats?|doordash|pickaroo|dunkin(?:donuts?)?|krispykreme|jollibee|chowking|manginasal|burgerking|mcdonalds|starbucks|pickupcoffee|timhortons|shakeshack|subway|chilis|caramia|jarandjam|mainbar|ackbar|dairyqueen|\bdq\b|pancocafe|koi(?:the)?|simplygourmet|hapag|harlanholden|matchabar|elephantgrounds|mocookies|nikkei|yardstick|yourlocal|brunchbureau|breakfastatantonios|royce|bokkoreanfriedchicken|dintaifung|arabica|ralphswines|marygrace|wildflour|mendokoro|ramennagi|manam|contis|coffeebean|cbtl|seattlesbest|armynavy|misterdonut|kfc|popeyes|shakeys|yellowcab|maxs|pandaexpress|cibo|nonos|frankies|botejyu|tuantuan|sunniescafe|bonchon|kennyrogers|yoshinoya|marugame|kuyaj|mesa|samgyupsalamat|timhowan|gongcha|chatime|koomi|macaoimperial|tigersugar|cocofresh|boscoffee|coffeeproject|tobysestate|butfirstcoffee|happylemon|auntieannes|llaollao|ooma|mangotree|italiannis|tgifridays|thefatseed(?:cafe)?|revolverespresso|wholesometable|wongplace|jco|jcodonuts|coffeeacademics|bacolodchickeninasal/,
  },
  {
    category: "Transport",
    lower: /grabcar|grab\s+car|move\s+it|angkas|joyride|uber|taxi|trainpal|skybus|autopay\s+parking|opera\s+house\s+parking|mall\s+parking|shell|petron|caltex|seaoil|mrt-?3|dotr\s+mrt\s*3|jetstar|cebu\s+air|cebuair|parking/,
    compact: /grabcar|moveit|angkas|joyride|uber|taxi|trainpal|skybus|autopayparking|operahouseparking|mallparking|shell|petron|caltex|seaoil|mrt3|dotrmrt3|jetstar|cebuair|parking/,
  },
  {
    category: "Travel & Lifestyle",
    lower: /nomad\s+express|priority\s+pass|airport|terminal\s+1|terminal\s+2|south\s+wing|klook|alila\s+villas\s+uluwatu|home\s+affairs/,
    compact: /nomadexpress|prioritypass|airport|terminal1|terminal2|southwing|klook|alilavillasuluwatu|homeaffairs/,
  },
  {
    category: "Bills & Utilities",
    lower:
      /paypal.*spotify|spotify.*paypal|paypal.*netflix|netflix.*paypal|paypal.*linkedin|linkedin.*paypal|openai|chatgpt|apple\s+services?|icloud|google\s+one|google\s+workspace|youtube\s+premium|spotify|netflix|linkedin(?:\s+premium)?|linkedinprea|adobe|canva|scribd|notion|airalo|globe|smart|pldt|meralco|maynilad/,
    compact:
      /paypal.*spotify|spotify.*paypal|paypal.*netflix|netflix.*paypal|paypal.*linkedin|linkedin.*paypal|openai|chatgpt|appleservices?|icloud|googleone|googleworkspace|youtubepremium|spotify|netflix|linkedin(?:premium)?|linkedinprea|adobe|canva|scribd|notion|airalo|globe|smart|pldt|meralco|maynilad/,
  },
  {
    category: "Shopping",
    lower: /paypal|amazon|alibaba|lazada|shopee|uniqlo|zara|h\s*&\s*m|h&m|watsons|puregold|landers|s\s*&\s*r|snr|duty\s+free|robinsons\s+easymart|uncle\s+john'?s|7-?eleven|robinsons\s+supermarket|the\s+marketplace|sm\s+store|power\s+mac|beyond\s+the\s+box|abenson|ace\s+hardware|true\s+value|bench|penshoppe|miniso|muji|cotton\s+on|savemore|shopwise|waltermart|lawson|sm\s+hypermarket|sm\s+supermarket|rustan'?s|toy\s+kingdom|octagon|mitsukoshi|greenbelt/,
    compact: /paypal|amazon|alibaba|lazada|shopee|uniqlo|zara|hm|watsons|puregold|landers|snr|dutyfree|robinsonseasymart|unclejohns|7eleven|robinsonssupermarket|themarketplace|smstore|powermac|beyondthebox|abenson|acehardware|truevalue|bench|penshoppe|miniso|muji|cottonon|savemore|shopwise|waltermart|lawson|smhypermarket|smsupermarket|rustans|toykingdom|octagon|mitsukoshi|greenbelt/,
  },
];

const matchesCategoryHint = (value: string, patterns: { lower?: RegExp; compact?: RegExp }) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const compact = compactWhitespace(normalized).toLowerCase();
  const ocrCompact = normalizeOcrCompactHint(normalized);
  return Boolean(
    (patterns.lower && patterns.lower.test(lower)) ||
      (patterns.compact && (patterns.compact.test(compact) || patterns.compact.test(ocrCompact)))
  );
};

const matchesTransferContext = (value: string) =>
  matchesCategoryHint(value, {
    lower:
      /\b(transfer|instapay|pesonet|fund\s+transfer|wallet\s+transfer|bank\s+transfer|incoming\s+transfer|outgoing\s+transfer|incoming\s+interbank\s+transfer|outgoing\s+interbank\s+transfer|remittance|send\s+money|cash\s+in|cash\s+out|statement\s+payment|payment\s*-\s*thank\s+you|card\s+payment|payment\s+to\s+card|credit\s+to\s+cash|edl\/?mbpay)\b/,
    compact:
      /transfer|instapay|pesonet|fundtransfer|wallettransfer|banktransfer|incomingtransfer|outgoingtransfer|incominginterbanktransfer|outgoinginterbanktransfer|remittance|sendmoney|cashin|cashout|statementpayment|paymentthankyou|cardpayment|paymenttocard|credittocash|edlmbpay/,
  });

const getSpecificMerchantCategoryHint = (value: string) => {
  for (const hint of SPECIFIC_MERCHANT_CATEGORY_HINTS) {
    if (matchesCategoryHint(value, { lower: hint.lower, compact: hint.compact })) {
      return hint.category;
    }
  }

  return null;
};

export const getStrongMerchantCategoryHint = (value: string): string | null => {
  const specificHint = getSpecificMerchantCategoryHint(value);
  if (specificHint && specificHint !== "Transfers" && specificHint !== "Other") {
    return specificHint;
  }

  if (
    matchesCategoryHint(value, {
      lower:
        /pedro\s+the\s+grocer|grocer\b|grocery|supermarket|mcdonald'?s|milksha|gogyo|gokan|goken|savory\s+project|bar\s+leone|four\s+frogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|mini\s+mart|7-?eleven|don\s+don\s+donki|proud\s+mary|byrdi|seven\s+seeds|amiri|toby'?s\s+estate|vacation\s+cafe|nirvana\s+restaurant|waterfront\s+mini\s+mart|apollo\s+bay\s+seafood|wootea|liberty\s+oil\s+convenience|iga\s+supermarkets?|caretaker'?s\s+cottage|lee'?s\s+dumplings|samyan\s+mitrtown|jacks\s+of\s+bath|vesper|black\s+cabin\s+bar|coco\s+group|coco\s+dewata|nat'?s\s+rustic|moonlit\s+sanctuary|bakery|bistro|kitchen|ramen|noodle|tea\s+house|burger|pizza|steak|grill|canteen|eatery|food\s+court|brunch|breakfast|lunch|dinner|dunkin(?:\s+donuts?)?|krispy\s+kreme|jollibee|chowking|mang\s+inasal|burger\s+king|foodpanda|grabfood|ubereats?|doordash|pickaroo|starbucks|pickup\s+coffee|tim\s+hortons|shake\s+shack|wendy'?s|subway|chili'?s|cara\s+mia|jarandjam|main\s+bar|ac\s+bar|dairy\s+queen|\bdq\b|hapag|harlan\s*\+?\s*holden|matcha\s+bar|elephant\s+grounds|mo\s+cookies|nikkei|yardstick|your\s+local|brunch\s+bureau|breakfast\s+at\s+antonio'?s|royce|bok\s+korean\s+fried\s+chicken|din\s+tai\s+fung|arabica|ralph'?s\s+wines/,
      compact:
        /pedrothegrocer|grocery|supermarket|mcdonalds|milksha|gogyo|gokan|goken|savoryproject|barleone|fourfrogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|minimart|7eleven|dondondonki|proudmary|byrdi|sevenseeds|amiri|tobysestate|vacationcafe|nirvanarestaurant|waterfrontminimart|apollobayseafood|wootea|libertyoilconvenience|igasupermarkets?|caretakerscottage|leesdumplings|samyanmitrtown|jacksofbath|vesper|blackcabinbar|cocogroup|cocodewata|natsrustic|moonlitsanctuary|bakery|bistro|kitchen|ramen|noodle|teahouse|burger|pizza|steak|grill|canteen|eatery|foodcourt|brunch|breakfast|lunch|dinner|dunkin(?:donuts?)?|krispykreme|jollibee|chowking|manginasal|burgerking|foodpanda|grabfood|ubereats?|doordash|pickaroo|starbucks|pickupcoffee|timhortons|shakeshack|wendys|subway|chilis|caramia|jarandjam|mainbar|ackbar|dairyqueen|\bdq\b|hapag|harlanholden|matchabar|elephantgrounds|mocookies|nikkei|yardstick|yourlocal|brunchbureau|breakfastatantonios|royce|bokkoreanfriedchicken|dintaifung|arabica|ralphswines/,
    })
  ) {
    return "Food & Dining";
  }

  if (
    matchesCategoryHint(value, {
      lower: /transport\s+for\s+nsw|skybus|parking|airport|rail|trainpal|hk\s+airport|liberty\s+oil|fuel|petrol|gas\s+station|autopay\s+parking|toll|expressway|opera\s+house\s+parking|mall\s+parking|grab(?:\s+car)?|grabcar|move\s+it|angkas|joyride|taxi|uber|bus|train|mrt|lrt|ride/,
      compact: /transportfornsw|skybus|parking|airport|rail|trainpal|hkairport|libertyoil|fuel|petrol|gasstation|autopayparking|toll|expressway|operahouseparking|mallparking|grab|grabcar|moveit|angkas|joyride|taxi|uber|bus|train|mrt|lrt|ride|shell|petron|caltex|seaoil/,
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

  if (matchesCategoryHint(value, { lower: /books?\b|asia\s+books|college|school|tuition|academy/, compact: /books|asiabooks|college|school|tuition|academy/ })) {
    return "Education";
  }
  if (matchesCategoryHint(value, { lower: /nbs|national\s+book\s+store|fully\s+booked/, compact: /nbs|nationalbookstore|fullybooked/ })) {
    return "Education";
  }

  if (matchesCategoryHint(value, { lower: /bruno'?s?\s+barbers?|the\s+spa|wheyl\s+nutrition|mercury\s+drug|anytime\s+fitness|clinic|hospital|pharmacy|healthy\s+options|southstar|rose\s+pharmacy|generika|the\s+generics|hi-?precision|st\.?\s*luke'?s|medical\s+city|vision\s+express|belo/, compact: /brunosbarbers?|thespa|wheylnutrition|mercurydrug|anytimefitness|clinic|hospital|pharmacy|healthyoptions|southstar|rosepharmacy|generika|thegenerics|hiprecision|stlukes|medicalcity|visionexpress|belo/ })) {
    return "Health & Wellness";
  }

  if (
    matchesCategoryHint(value, {
      lower:
        /bill|utilities|electric|water|internet|phone|subscription|subscriptions|openai|chatgpt|netflix|spotify|linkedin|adobe|canva|icloud|google\s+one|youtube\s+premium|airalo|globe|smart|pldt|meralco|maynilad|openai\s+api|apple\s+services/,
      compact:
        /bill|utilities|electric|water|internet|phone|subscription|subscriptions|openai|chatgpt|netflix|spotify|linkedin|adobe|canva|icloud|googleone|youtubepremium|airalo|globe|smart|pldt|meralco|maynilad|appleservices/,
    })
  ) {
    return "Bills & Utilities";
  }

  if (
    matchesCategoryHint(value, {
      lower: /relay\b|amazon|alibaba|camera|paypal|viator(?:\.com)?|locker\s+hire|emmanuel\s+payments?|shop\b|store\b|mart\b|convenience|provisioning\s+service|visa\s+provisioning\s+service|apple\s+pay|google\s+pay|gift\s+shop|duty\s+free|robinsons\s+easymart|uncle\s+john'?s|7-?eleven|robinsons\s+supermarket|the\s+marketplace|sm\s+store|power\s+mac|beyond\s+the\s+box|abenson|ace\s+hardware|true\s+value|bench|penshoppe|miniso|muji|cotton\s+on|savemore|shopwise|waltermart|lawson|sm\s+hypermarket|sm\s+supermarket|rustan'?s|toy\s+kingdom|octagon/,
      compact: /relay|amazon|alibaba|camera|paypal|viator|lockerhire|emmanuelpayments?|shop|store|mart|convenience|provisioningservice|visaprovisioningservice|applepay|googlepay|giftshop|dutyfree|puregold|landers|snr|sandr|uniqlo|zara|h&m|watsons|robinsonseasymart|unclejohns|7eleven|robinsonssupermarket|themarketplace|smstore|powermac|beyondthebox|abenson|acehardware|truevalue|bench|penshoppe|miniso|muji|cottonon|savemore|shopwise|waltermart|lawson|smhypermarket|smsupermarket|rustans|toykingdom|octagon/,
    })
  ) {
    return "Shopping";
  }

  if (matchesCategoryHint(value, { lower: /timezone|mystery\s+manila/, compact: /timezone|mysterymanila/ })) {
    return "Entertainment";
  }
  if (matchesCategoryHint(value, { lower: /kidzoona|tom'?s\s+world|world\s+of\s+fun|quantum/, compact: /kidzoona|tomsworld|worldoffun|quantum/ })) {
    return "Entertainment";
  }

  if (matchesCategoryHint(value, { lower: /priority\s+pass|15-?ppass/, compact: /prioritypass|15ppass|ppass/ })) {
    return "Travel & Lifestyle";
  }

  return null;
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

export const shouldTreatAsTransferDescription = (value: string) => {
  if (getStrongMerchantCategoryHint(value)) {
    return false;
  }

  return isLikelyPersonTransferName(value) || matchesTransferContext(value);
};

export const getSharedMerchantCategoryHint = (value: string): string | null => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const specificHint = getSpecificMerchantCategoryHint(value);
  if (specificHint) {
    return specificHint;
  }

  if (shouldTreatAsTransferDescription(value)) {
    return "Transfers";
  }

  if (
    matchesCategoryHint(value, {
      lower:
        /pedro\s+the\s+grocer|grocer\b|grocery|supermarket|mcdonald'?s|milksha|gogyo|gokan|goken|savory\s+project|bar\s+leone|four\s+frogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|mini\s+mart|7-?eleven|don\s+don\s+donki|proud\s+mary|byrdi|seven\s+seeds|amiri|toby'?s\s+estate|vacation\s+cafe|nirvana\s+restaurant|waterfront\s+mini\s+mart|apollo\s+bay\s+seafood|wootea|liberty\s+oil\s+convenience|iga\s+supermarkets?|caretaker'?s\s+cottage|lee'?s\s+dumplings|samyan\s+mitrtown|jacks\s+of\s+bath|vesper|black\s+cabin\s+bar|coco\s+group|coco\s+dewata|nat'?s\s+rustic|moonlit\s+sanctuary|bakery|bistro|kitchen|ramen|noodle|tea\s+house|burger|pizza|steak|grill|canteen|eatery|food\s+court|brunch|breakfast|lunch|dinner|dunkin(?:\s+donuts?)?|krispy\s+kreme|jollibee|chowking|mang\s+inasal|burger\s+king|foodpanda|grabfood|ubereats?|doordash|pickaroo|starbucks|pickup\s+coffee|tim\s+hortons|shake\s+shack|wendy'?s|subway|chili'?s|cara\s+mia|jarandjam|main\s+bar|ac\s+bar/,
      compact:
        /pedrothegrocer|grocery|supermarket|mcdonalds|milksha|gogyo|gokan|goken|savoryproject|barleone|fourfrogs|woolworths|coles|dumplings|cafe|coffee|sushi|restaurant|seafood|minimart|7eleven|dondondonki|proudmary|byrdi|sevenseeds|amiri|tobysestate|vacationcafe|nirvanarestaurant|waterfrontminimart|apollobayseafood|wootea|libertyoilconvenience|igasupermarkets?|caretakerscottage|leesdumplings|samyanmitrtown|jacksofbath|vesper|blackcabinbar|cocogroup|cocodewata|natsrustic|moonlitsanctuary|bakery|bistro|kitchen|ramen|noodle|teahouse|burger|pizza|steak|grill|canteen|eatery|foodcourt|brunch|breakfast|lunch|dinner|dunkin(?:donuts?)?|krispykreme|jollibee|chowking|manginasal|burgerking|foodpanda|grabfood|ubereats?|doordash|pickaroo|starbucks|pickupcoffee|timhortons|shakeshack|wendys|subway|chilis|caramia|jarandjam|mainbar|ackbar/,
    })
  ) {
    return "Food & Dining";
  }

  if (
    matchesCategoryHint(value, {
      lower: /transport\s+for\s+nsw|skybus|parking|airport|rail|trainpal|hk\s+airport|liberty\s+oil|fuel|petrol|gas\s+station|autopay\s+parking|toll|expressway|opera\s+house\s+parking|mall\s+parking|grab(?:\s+car)?|grabcar|move\s+it|angkas|joyride|taxi|uber|bus|train|mrt|lrt|ride/,
      compact: /transportfornsw|skybus|parking|airport|rail|trainpal|hkairport|libertyoil|fuel|petrol|gasstation|autopayparking|toll|expressway|operahouseparking|mallparking|grab|grabcar|moveit|angkas|joyride|taxi|uber|bus|train|mrt|lrt|ride|shell|petron|caltex|seaoil/,
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

  if (matchesCategoryHint(value, { lower: /books?\b|asia\s+books|college|school|tuition|academy/, compact: /books|asiabooks|college|school|tuition|academy/ })) {
    return "Education";
  }

  if (
    matchesCategoryHint(value, {
      lower:
        /bill|utilities|electric|water|internet|phone|subscription|subscriptions|openai|chatgpt|netflix|spotify|linkedin|adobe|canva|icloud|google\s+one|youtube\s+premium|airalo|globe|smart|pldt|meralco|maynilad|openai\s+api|apple\s+services/,
      compact:
        /bill|utilities|electric|water|internet|phone|subscription|subscriptions|openai|chatgpt|netflix|spotify|linkedin|adobe|canva|icloud|googleone|youtubepremium|airalo|globe|smart|pldt|meralco|maynilad|appleservices/,
    })
  ) {
    return "Bills & Utilities";
  }

  if (
    matchesCategoryHint(value, {
      lower: /relay\b|amazon|alibaba|camera|paypal|viator(?:\.com)?|locker\s+hire|emmanuel\s+payments?|shop\b|store\b|mart\b|convenience|provisioning\s+service|visa\s+provisioning\s+service|apple\s+pay|google\s+pay|gift\s+shop|duty\s+free/,
      compact: /relay|amazon|alibaba|camera|paypal|viator|lockerhire|emmanuelpayments?|shop|store|mart|convenience|provisioningservice|visaprovisioningservice|applepay|googlepay|giftshop|dutyfree|puregold|landers|snr|sandr|uniqlo|zara|h&m|watsons/,
    })
  ) {
    return "Shopping";
  }

  if (matchesCategoryHint(value, { lower: /citibank.*\bfin\b|bank.*\bfin\b|incoming\s+transfer|outgoing\s+transfer|fund\s+transfer/, compact: /citibank.*fin|bank.*fin|incomingtransfer|outgoingtransfer|fundtransfer/ })) {
    return "Transfers";
  }

  if (matchesCategoryHint(value, { lower: /bank|finance|fin\b|loan|interest|charge|fee/, compact: /bank|finance|fin|loan|interest|charge|fee/ })) {
    return "Financial";
  }

  return null;
};
