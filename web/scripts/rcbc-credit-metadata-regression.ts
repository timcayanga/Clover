import assert from "node:assert/strict";
import { detectStatementMetadataFromText } from "@/lib/data-engine";

const extractedStatementText = `
RCBC BANKARD
STATEMENT OF ACCOUNT
VISA PLATINUM
CARD NUMBER
4279 3411 3868 1014
STATEMENT DATE PAYMENT DUE DATE
MAR 23 2025 APR 21 2025
CASH MONTHLY MONTHLY EIR*
CREDIT LIMIT
For inquiries, please call our Customer Service hotline
ADVANCE LIMIT INTEREST RATE
165,000 82,500 3.00% 3.00%
PREVIOUS BALANCE PURCHASES and ADVANCES INTEREST FEES LATE CHARGES PAYMENTS TOTAL BALANCE DUE
119,046.26 19,824.54 12,376.03 0.00 135,754.14 15,492.69
MAR 01 2025 SAMPLE MERCHANT 100.00
`;

const metadata = detectStatementMetadataFromText(extractedStatementText, "202503eStatement_VISA_PLATINUM_1014.pdf");

assert.ok(metadata, "RCBC credit-card metadata should be detected.");
assert.equal(metadata.accountType, "credit_card");
assert.equal(metadata.creditLimit, 165000, "The first RCBC summary amount after CREDIT LIMIT should be saved as the card limit.");
assert.equal(metadata.totalAmountDue, 15492.69);
assert.equal(metadata.paymentDueDate?.slice(0, 10), "2025-04-21");

console.log("RCBC credit-card metadata regression passed.");
