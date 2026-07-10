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

  const starbucksFamilyRule = {
    merchantKey: buildMerchantFamilySignature("STARBUCKS STORE 0143 CARD PURCHASE"),
    merchantPattern: null,
    normalizedName: "Starbucks",
    categoryId: "cat-food",
    categoryName: "Food & Dining",
    source: "manual_recategorization:family",
    confidence: 92,
    timesConfirmed: 3,
  };

  const starbucksVariant = classifyMerchant({
    merchantText: "STARBUCKS STORE 2210 CARD PURCHASE",
    type: "expense",
    merchantRules: [starbucksFamilyRule],
    trainingSignals: [],
  });

  assert(spotifyVariant.categoryName === "Bills & Utilities", "Expected Spotify PayPal variant to inherit Bills & Utilities");
  assert(linkedInVariant.categoryName === "Bills & Utilities", "Expected LinkedIn PayPal variant to inherit Bills & Utilities");
  assert(starbucksVariant.categoryName === "Food & Dining", "Expected family-signature rule to rescue noisy Starbucks SOA variants");
  assert(starbucksVariant.normalizedName === "Starbucks", "Expected family-signature rule to preserve the clean Starbucks merchant label");
  assert(buildMerchantFamilySignature("PAYPAL*SPOTIFY*P 402 EBB") === "spotify ebb" || buildMerchantFamilySignature("PAYPAL*SPOTIFY*P 402 EBB").includes("spotify"), "Expected Spotify family signature to keep spotify core");
  assert(buildMerchantFamilySignature("STARBUCKS STORE 0143 CARD PURCHASE") === "starbucks", "Expected SOA family signature to collapse store and purchase noise down to Starbucks");
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

  const tuitionPatterns = detectRecurringPatterns([
    {
      id: "t1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-05"),
      amount: 15000,
      currency: "PHP",
      type: "transfer",
      merchantRaw: "SCHOOL FEE PAYMENT",
      merchantClean: null,
      description: "SCHOOL FEE PAYMENT",
      category: { name: "Education" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "t2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-05"),
      amount: 15000,
      currency: "PHP",
      type: "transfer",
      merchantRaw: "TUITION PAYMENT",
      merchantClean: null,
      description: "TUITION PAYMENT",
      category: { name: "Education" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "t3",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-03-05"),
      amount: 15000,
      currency: "PHP",
      type: "transfer",
      merchantRaw: "SCHOOL PAYMENT",
      merchantClean: null,
      description: "SCHOOL PAYMENT",
      category: { name: "Education" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
  ]);

  const tuitionPattern = tuitionPatterns.find((pattern) => pattern.canonicalTitle === "Tuition");
  assert(tuitionPattern?.frequency === "monthly", "Expected tuition-like transfer rows to become monthly recurring candidates");

  const smartPostpaidPatterns = detectRecurringPatterns([
    {
      id: "sp1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-02"),
      amount: 999,
      currency: "PHP",
      type: "expense",
      merchantRaw: "08:55 BILLS PAYMENT TO SMART POSTPAID REF# 99182",
      merchantClean: null,
      description: "08:55 BILLS PAYMENT TO SMART POSTPAID REF# 99182",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "RCBC 1014", institution: "RCBC" },
      importFile: null,
    },
    {
      id: "sp2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-03"),
      amount: 1017.43,
      currency: "PHP",
      type: "expense",
      merchantRaw: "09:02 PAYMENT TO SMART POSTPAID AUTH 12888",
      merchantClean: null,
      description: "09:02 PAYMENT TO SMART POSTPAID AUTH 12888",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "RCBC 1014", institution: "RCBC" },
      importFile: null,
    },
  ]);

  const smartPattern = smartPostpaidPatterns.find((pattern) => pattern.canonicalTitle === "Smart");
  assert(smartPattern?.frequency === "monthly", "Expected Smart postpaid bill payments with timestamps and refs to collapse into one monthly pattern");

  const fxSubscriptionPatterns = detectRecurringPatterns([
    {
      id: "fx1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-02"),
      amount: 249,
      currency: "PHP",
      type: "expense",
      merchantRaw: "GOOGLE*YT PREM 6501",
      merchantClean: null,
      description: "GOOGLE*YT PREM 6501",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "RCBC Gold", institution: "RCBC" },
      importFile: null,
    },
    {
      id: "fx2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-01"),
      amount: 254.5,
      currency: "PHP",
      type: "expense",
      merchantRaw: "GOOGLE*YT PREM 9321",
      merchantClean: null,
      description: "GOOGLE*YT PREM 9321",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "RCBC Gold", institution: "RCBC" },
      importFile: null,
    },
  ]);

  const youtubePattern = fxSubscriptionPatterns.find((pattern) => pattern.canonicalTitle === "YouTube");
  assert(youtubePattern?.frequency === "monthly", "Expected FX-shifted subscription charges across two months to become recurring");

  const monthEndBillPatterns = detectRecurringPatterns([
    {
      id: "m1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-30"),
      amount: 2207,
      currency: "PHP",
      type: "expense",
      merchantRaw: "Bills Payment to PLDT",
      merchantClean: "PLDT",
      description: "Bills Payment to PLDT",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "m2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-28"),
      amount: 2210.25,
      currency: "PHP",
      type: "expense",
      merchantRaw: "Bills Payment to PLDT",
      merchantClean: "PLDT",
      description: "Bills Payment to PLDT",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
  ]);

  const pldtPattern = monthEndBillPatterns.find((pattern) => pattern.canonicalTitle === "PLDT");
  assert(pldtPattern?.frequency === "monthly", "Expected month-end bills with shorter-month drift to stay monthly");

  const utilityCrossMonthPatterns = detectRecurringPatterns([
    {
      id: "u1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-03-20"),
      amount: 6621.8,
      currency: "PHP",
      type: "transfer",
      merchantRaw: "BILLS PAYMENT - MERALCO",
      merchantClean: null,
      description: "BILLS PAYMENT - MERALCO",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
    {
      id: "u2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-04-02"),
      amount: 2488.69,
      currency: "PHP",
      type: "transfer",
      merchantRaw: "Payment to Meralco",
      merchantClean: null,
      description: "Payment to Meralco",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "BPI 1234", institution: "BPI" },
      importFile: null,
    },
  ]);

  const meralcoMonthlyPattern = utilityCrossMonthPatterns.find((pattern) => pattern.canonicalTitle === "Meralco");
  assert(meralcoMonthlyPattern?.frequency === "monthly", "Expected utility payments repeated across calendar months to bias monthly over biweekly");

  const duplicateWithinMonthPatterns = detectRecurringPatterns([
    {
      id: "d1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-10"),
      amount: 399,
      currency: "PHP",
      type: "expense",
      merchantRaw: "NETFLIX SUBSCRIPTION",
      merchantClean: "Netflix",
      description: "NETFLIX SUBSCRIPTION",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "RCBC Gold", institution: "RCBC" },
      importFile: null,
    },
    {
      id: "d2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-24"),
      amount: 404.5,
      currency: "PHP",
      type: "expense",
      merchantRaw: "NETFLIX SUBSCRIPTION",
      merchantClean: "Netflix",
      description: "NETFLIX SUBSCRIPTION",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "RCBC Gold", institution: "RCBC" },
      importFile: null,
    },
    {
      id: "d3",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-11"),
      amount: 401,
      currency: "PHP",
      type: "expense",
      merchantRaw: "NETFLIX SUBSCRIPTION",
      merchantClean: "Netflix",
      description: "NETFLIX SUBSCRIPTION",
      category: { name: "Bills & Utilities" },
      account: { id: "a", name: "RCBC Gold", institution: "RCBC" },
      importFile: null,
    },
  ]);

  const duplicateMonthlyPattern = duplicateWithinMonthPatterns.find((pattern) => pattern.canonicalTitle === "Netflix");
  assert(duplicateMonthlyPattern?.frequency === "monthly", "Expected duplicate charges within a month to still resolve to a monthly subscription pattern");

  const transferLikePatterns = detectRecurringPatterns([
    {
      id: "x1",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-01-12"),
      amount: 1499,
      currency: "PHP",
      type: "transfer",
      merchantRaw: "Transfer from 09071104069",
      merchantClean: "Transfer from 09071104069",
      description: "Transfer from 09071104069",
      category: { name: "Transfers" },
      account: { id: "a", name: "GCash", institution: "GCash" },
      importFile: null,
    },
    {
      id: "x2",
      workspaceId: "w",
      accountId: "a",
      date: new Date("2026-02-12"),
      amount: 1499,
      currency: "PHP",
      type: "transfer",
      merchantRaw: "Transfer from 09071104069",
      merchantClean: "Transfer from 09071104069",
      description: "Transfer from 09071104069",
      category: { name: "Transfers" },
      account: { id: "a", name: "GCash", institution: "GCash" },
      importFile: null,
    },
  ]);

  assert(transferLikePatterns.length === 0, "Expected generic transfer patterns to stay out of recurring suggestions");
};

const main = () => {
  runMerchantFamilyChecks();
  runRecurringChecks();
  console.log("enrichment-family-regression: ok");
};

main();
