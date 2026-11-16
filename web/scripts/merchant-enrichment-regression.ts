import assert from "node:assert/strict";
import { classifyMerchant } from "@/lib/data-engine";
import { applyDeterministicMerchantRescue } from "@/lib/merchant-enrichment";
import { summarizeMerchantText } from "@/lib/merchant-labels";

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
    ["DIDI TIANJIN CH", "Transport", "DiDi"],
    ["EFTPAY*NAIXUE HONG KONG KWAI CHUNG HK", "Food & Dining", "Naixue"],
    ["PANCAKE HOUSE OPAL PASIG PH", "Food & Dining", "Pancake House"],
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

  const ukCases = [
    ["TITANIC BELFAST LT BELFAST", "Entertainment", "Titanic Belfast"],
    ["CROWN LIQUOR SALOO BELFAST", "Food & Dining", "Crown Liquor Saloon"],
    ["SSP UK LTD DERBY", "Food & Dining", "SSP UK"],
    ["ZETTLE_*NATIONAL J NOTTINGHAM", "Entertainment", "National Justice Museum"],
    ["SQ *DERBY UNCOVERE DERBY", "Travel & Lifestyle", "Derby Uncovered"],
    ["SP BIRMINGHAMMUSEU BIRMINGHAM", "Entertainment", "Birmingham Museum"],
    ["BIRMINGHAM NEW ST BIRMINGHAM", "Transport", "Birmingham New Street"],
    ["T4 BIRMINGHAM", "Food & Dining", "T4"],
    ["ZETTLE_*DARWIN COL CAMBRIDGE", "Food & Dining", "Darwin College"],
    ["VMS DOWNING JCR CAMBRIDGE", "Food & Dining", "Downing JCR"],
    ["TOWN AND GOWN CAMBRIDGE", "Food & Dining", "Town and Gown"],
    ["HOLIDAY INN BELFAS BELFAST", "Travel & Lifestyle", "Holiday Inn Belfast"],
    ["THE NORN IRISH GIF BELFAST", "Shopping", "The Norn Irish Gift Shop"],
    ["TRANSLINK FARE CHA BELFAST", "Transport", "Translink"],
    ["NON-STERLING TRANSACTION FEE", "Financial", "Non-Sterling Transaction Fee"],
  ] as const;

  for (const [merchantRaw, categoryName, expectedMerchant] of ukCases) {
    const result = applyDeterministicMerchantRescue({
      merchantRaw,
      categoryName: "Transfers",
      type: "expense",
      institution: "HSBC",
    });
    assert.equal(result.categoryName, categoryName, `${merchantRaw} should override a false transfer category`);
    assert.equal(result.merchantClean, expectedMerchant, `${merchantRaw} should use its UK corpus label`);
    assert.equal(result.type, "expense", `${merchantRaw} should remain an expense`);
  }

  const europeCases = [
    ["SERVICE NAVIGO 40 75 PARIS EUR VISA RATE", "Transport", "Navigo"],
    ["TRAINPAL LONDON GB", "Transport", "TrainPal"],
    ["GWYNFOR COACHES LLANGEFNI", "Transport", "Gwynfor Coaches"],
    ["SNCF CONNECT PARIS FR", "Transport", "SNCF"],
    ["DB VERTRIEB BERLIN DE", "Transport", "Deutsche Bahn"],
    ["OV-CHIPKAART AMSTERDAM NL", "Transport", "OV-chipkaart"],
    ["RYANAIR DUBLIN IE", "Travel & Lifestyle", "Ryanair"],
    ["EASYJET AIRLINE LUTON GB", "Travel & Lifestyle", "easyJet"],
    ["BOOKING.COM AMSTERDAM NL", "Travel & Lifestyle", "Booking.com"],
    ["DELIVEROO LONDON GB", "Food & Dining", "Deliveroo"],
    ["CARREFOUR CITY PARIS FR", "Shopping", "Carrefour"],
    ["REWE MARKT BERLIN DE", "Shopping", "REWE"],
    ["ALBERT HEIJN AMSTERDAM NL", "Shopping", "Albert Heijn"],
    ["HOTEL DES ARTS PARIS FR", "Travel & Lifestyle", "Hotel DES Arts Paris FR"],
    ["METRO PARIS", "Transport", "Metro Paris"],
    ["LE PAIN QUOTIDIEN PARIS", "Food & Dining", "LE Pain Quotidien Paris"],
    ["WISE CURRENCY CONVERSION", "Transfers", "Wise Currency Conversion"],
  ] as const;

  for (const [merchantRaw, categoryName, expectedMerchant] of europeCases) {
    const result = applyDeterministicMerchantRescue({
      merchantRaw,
      categoryName: "Transfers",
      type: "expense",
      institution: "HSBC",
    });
    assert.equal(result.categoryName, categoryName, `${merchantRaw} should use its European merchant category`);
    assert.equal(result.merchantClean, expectedMerchant, `${merchantRaw} should use its European merchant label`);
    assert.equal(
      result.type,
      categoryName === "Transfers" ? "transfer" : "expense",
      `${merchantRaw} should retain the category's safe cash-flow type`
    );
  }

  const processorOnlyCases = ["ADYEN N.V.", "SUMUP", "STRIPE", "ZETTLE"];
  for (const merchantRaw of processorOnlyCases) {
    const result = applyDeterministicMerchantRescue({
      merchantRaw,
      categoryName: "Other",
      type: "expense",
      institution: "HSBC",
    });
    assert.equal(result.categoryName, "Other", `${merchantRaw} alone must not receive a speculative category`);
  }

  const unknownUkMerchant = applyDeterministicMerchantRescue({
    merchantRaw: "DUBLIN CSA EUR Visa Rate",
    categoryName: "Other",
    type: "expense",
    institution: "HSBC",
  });
  assert.equal(unknownUkMerchant.categoryName, "Other", "Ambiguous UK descriptors must not receive a speculative category.");

  const didiTransferMisclassification = classifyMerchant({
    merchantText: "Didi Tianjin CH",
    categoryName: "Transfers",
    institution: "RCBC",
    type: "transfer",
    merchantRules: [],
    trainingSignals: [],
  });
  assert.equal(didiTransferMisclassification.categoryName, "Transport");
  assert.equal(
    didiTransferMisclassification.preferredType,
    "transfer",
    "Transfer direction remains provisional until the account-ownership matcher resolves it."
  );

  const confirmedLike = applyDeterministicMerchantRescue({ merchantRaw: "Custom source", merchantClean: "Confirmed Merchant", categoryName: "Shopping", type: "expense" });
  assert.equal(confirmedLike.merchantClean, "Confirmed Merchant");
  assert.equal(confirmedLike.categoryName, "Shopping");
  const structuredCategory = applyDeterministicMerchantRescue({
    merchantRaw: "DIDI TIANJIN CH",
    categoryName: "Other",
    preserveCategory: true,
    type: "expense",
  });
  assert.equal(structuredCategory.merchantClean, "DiDi");
  assert.equal(
    structuredCategory.categoryName,
    "Other",
    "An explicit structured-file category must survive background merchant enrichment."
  );
  assert.equal(
    summarizeMerchantText("1 012500024 Garnet )Days Check 1233 - Pasig", "PNB"),
    "Check Deposit",
    "PNB Project SOA check-deposit OCR should not remain an unnormalized title."
  );

  console.log("Merchant enrichment regression checks passed.");
};

main();
