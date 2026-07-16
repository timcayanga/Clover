import assert from "node:assert/strict";
import { applyDeterministicMerchantRescue } from "@/lib/merchant-enrichment";

const main = () => {
  const cases = [
    ["JOLLIBEE", "Food & Dining", "Jollibee"],
    ["PETRON", "Transport", "Petron"],
    ["15-PPASS", "Travel & Lifestyle", "Priority Pass"],
    ["LINKEDIN PREMIUM", "Bills & Utilities", "LinkedIn"],
    ["ROBINSONS EASYMART", "Shopping", "Robinsons Easymart"],
  ] as const;

  for (const [merchantRaw, categoryName, expectedMerchant] of cases) {
    const result = applyDeterministicMerchantRescue({ merchantRaw, categoryName: "Other", type: "expense", institution: "RCBC" });
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
