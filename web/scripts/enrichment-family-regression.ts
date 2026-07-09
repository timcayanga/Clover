import { classifyMerchant, buildMerchantFamilySignature, guessCategoryFallback } from "@/lib/data-engine";
import { detectRecurringPatterns } from "@/lib/recurring-detection";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runMerchantFamilyChecks = () => {
  const learnedRule = {
    merchantKey: "spotify",
    merchantPattern: "Spotify Premium",
    normalizedName: "Spotify",
    categoryId: "cat-bills",
    categoryName: "Bills & Utilities",
    source: "manual_recategorization:prototype",
    confidence: 96,
    timesConfirmed: 8,
  };

  const linkedInRule = {
    merchantKey: "linkedin premium",
    merchantPattern: "LinkedIn Premium",
    normalizedName: "LinkedIn",
    categoryId: "cat-bills",
    categoryName: "Bills & Utilities",
    source: "manual_recategorization:prototype",
    confidence: 95,
    timesConfirmed: 5,
  };

  const spotifyVariant = classifyMerchant({
    merchantText: "PAYPAL*SPOTIFY*P 402 EBB",
    type: "expense",
    merchantRules: [learnedRule],
    trainingSignals: [],
  });

  const linkedInVariant = classifyMerchant({
    merchantText: "PAYPAL * LINKEDIN PREMIUM",
    type: "expense",
    merchantRules: [linkedInRule],
    trainingSignals: [],
  });

  assert(spotifyVariant.categoryName === "Bills & Utilities", "Expected Spotify PayPal variant to inherit Bills & Utilities");
  assert(linkedInVariant.categoryName === "Bills & Utilities", "Expected LinkedIn PayPal variant to inherit Bills & Utilities");
  assert(buildMerchantFamilySignature("PAYPAL*SPOTIFY*P 402 EBB") === "spotify ebb" || buildMerchantFamilySignature("PAYPAL*SPOTIFY*P 402 EBB").includes("spotify"), "Expected Spotify family signature to keep spotify core");
  assert(guessCategoryFallback("DUNKIN DONUTS BGC", "expense") === "Food & Dining", "Expected obvious all-caps food merchant to avoid generic Transfers/Other");
  assert(guessCategoryFallback("GRABCAR PH", "expense") === "Transport", "Expected Grab transport merchant to avoid generic Transfers/Other");
};

const runRecurringChecks = () => {
  const patterns = detectRecurringPatterns([
    {
      id: "1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-09"),
      amount: 2500,
      currency: "PHP",
      type: "expense",
      merchantRaw: "ANYTIME FITNESS CLUB",
      merchantClean: "Anytime Fitness",
      description: "ANYTIME FITNESS CLUB",
      category: { name: "Health & Wellness" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-09"),
      amount: 2500,
      currency: "PHP",
      type: "expense",
      merchantRaw: "ANYTIME FITNESS CLUB",
      merchantClean: "Anytime Fitness",
      description: "ANYTIME FITNESS CLUB",
      category: { name: "Health & Wellness" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "3",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-03-09"),
      amount: 2500,
      currency: "PHP",
      type: "expense",
      merchantRaw: "ANYTIME FITNESS CLUB",
      merchantClean: "Anytime Fitness",
      description: "ANYTIME FITNESS CLUB",
      category: { name: "Health & Wellness" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
  ]);

  const gymPattern = patterns.find((pattern) => pattern.canonicalTitle === "Gym Membership");
  assert(gymPattern?.frequency === "monthly", "Expected gym membership to be detected as monthly recurring");

  const merchantVariantPatterns = detectRecurringPatterns([
    {
      id: "s1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-15"),
      amount: 249,
      currency: "PHP",
      type: "expense",
      merchantRaw: "PAYPAL*SPOTIFY*P 402 EBB",
      merchantClean: null,
      description: "PAYPAL*SPOTIFY*P 402 EBB",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "s2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-15"),
      amount: 249,
      currency: "PHP",
      type: "expense",
      merchantRaw: "PAYPAL * SPOTIFY PREMIUM",
      merchantClean: null,
      description: "PAYPAL * SPOTIFY PREMIUM",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "s3",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-03-15"),
      amount: 249,
      currency: "PHP",
      type: "expense",
      merchantRaw: "SPOTIFY PREMIUM",
      merchantClean: "Spotify",
      description: "SPOTIFY PREMIUM",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
  ]);

  const spotifyPattern = merchantVariantPatterns.find((pattern) => pattern.canonicalTitle === "Spotify");
  assert(spotifyPattern?.frequency === "monthly", "Expected noisy Spotify variants to collapse into a monthly recurring pattern");
};

const main = () => {
  runMerchantFamilyChecks();
  runRecurringChecks();
  console.log("enrichment-family-regression: ok");
};

main();
