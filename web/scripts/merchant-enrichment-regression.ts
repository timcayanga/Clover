import assert from "node:assert/strict";
import { applyDeterministicMerchantRescue } from "@/lib/merchant-enrichment";

const main = () => {
  const cases = [
    ["JOLLIBEE", "Food & Dining", "Jollibee"],
    ["PETRON", "Transport", "Petron"],
    ["15-PPASS", "Travel & Lifestyle", "Priority Pass"],
    ["LINKEDIN PREMIUM", "Bills & Utilities", "LinkedIn"],
    ["ROBINSONS EASYMART", "Shopping", "Robinsons Easymart"],
    ["MC D-00039 PLOENCHIT CENTER BANGKOK THBAHT", "Food & Dining", "McDonald's"],
    ["711 MERCURE IBIS SIAM WANGMAI PATHU THBAHT", "Shopping", "7-Eleven"],
    ["DRUG CARE BANGKOK THBAHT", "Health & Wellness", "Drug Care"],
    ["KINDLE UNLTD*LB1GY4673 US U.S. DOLLAR", "Bills & Utilities", "Kindle Unlimited"],
    ["TOPS-SILOM COMPLEX BANGKOK THBAHT", "Shopping", "Tops"],
  ] as const;

  for (const [merchantRaw, categoryName, expectedMerchant] of cases) {
    const result = applyDeterministicMerchantRescue({
      merchantRaw,
      categoryName: "Other",
      type: "expense",
      institution: merchantRaw.includes("BANGKOK") || merchantRaw.includes("THBAHT") || merchantRaw.includes("U.S. DOLLAR") ? "BPI Family Savings Bank" : "RCBC",
    });
    assert.equal(result.categoryName, categoryName, `${merchantRaw} should map to ${categoryName}`);
    assert.equal(result.merchantClean, expectedMerchant, `${merchantRaw} should normalize to ${expectedMerchant}`);
    assert.equal(result.applied, true);
  }

  const confirmedLike = applyDeterministicMerchantRescue({ merchantRaw: "Custom source", merchantClean: "Confirmed Merchant", categoryName: "Shopping", type: "expense" });
  assert.equal(confirmedLike.merchantClean, "Confirmed Merchant");
  assert.equal(confirmedLike.categoryName, "Shopping");

  console.log("Merchant enrichment regression checks passed.");
};

main();
