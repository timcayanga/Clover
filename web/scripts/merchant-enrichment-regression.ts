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
    ["VELVETEEN HOUSE MAKATI CITY PH", "Food & Dining", "Velveteen House"],
    ["KINEYA DON DON TEI ROB QUEZON CITY PH", "Food & Dining", "Kineya Don Don Tei"],
    ["SOI CHICKEN BGC TAGUIG PH", "Food & Dining", "Soi Chicken"],
    ["2C2P_PH*PH AIRASIA TAGUIG CITY PH", "Travel & Lifestyle", "AirAsia"],
    ["SINGLE ORIGIN GB5 MAKATI PH", "Food & Dining", "Single Origin"],
    ["KAOKEE SAN JUAN SAN JUAN PH", "Food & Dining", "Kaokee"],
    ["CHATUKCHAK CYBERGAMMA PASIG CITY PH", "Food & Dining", "Cha Tuk Chak"],
    ["GADC 705 SLP SOK MAKATI CITY PH", "Food & Dining", "McDonald's"],
    ["GADC SHLEMERALD KC1 PASIG PH", "Food & Dining", "McDonald's"],
    ["DHL-DUTY COLLECTION MAKATI CITY", "Shopping", "DHL Duty Collection"],
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
