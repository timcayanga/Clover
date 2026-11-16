import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessReceiptPreviewQuality,
  parseAirlineTicketReceiptText,
} from "@/lib/split-bill";

const sample = `
Passenger: SAMPLE TRAVELLER
Booking ref: ABC123
Ticket number: 079 2537473925
Issuing office:
PHILIPPINE AIRLINES CONTACT CENTER,
MANILA, PHILIPPINES
Date: 13Aug2025
ELECTRONIC TICKET RECEIPT
From To Flight Departure Arrival
MANILA NINOY AQUINO INTL HONG KONG INTERNATIONAL PR318 09:55 12:25
Operated by: PHILIPPINE AIRLINES
HONG KONG INTERNATIONAL MANILA NINOY AQUINO INTL PR307 18:20 20:40
Marketed by: PHILIPPINE AIRLINES
PAYMENT DETAILS FARE DETAILS
Form of payment: CC VI XXXXXXXXXXXX6003
Total Amount: PHP 6458
ELECTRONIC MISCELLANEOUS DOCUMENT RECEIPT (EMD)
Document Number: 079 4560234121 Booking ref: ABC123
Coupon Service Date
1 Seat Reservation 05Sep2025
Flight: PR318
Fare: PHP 857
ELECTRONIC MISCELLANEOUS DOCUMENT RECEIPT (EMD)
Document Number: 079 4560234120 Booking ref: ABC123
Coupon Service Date
1 Seat Reservation 09Sep2025
Flight: PR307
Fare: PHP 857
`;

const preview = parseAirlineTicketReceiptText(sample);
assert.ok(preview, "Airline electronic ticket must be recognized as a receipt.");
assert.equal(preview.receiptType, "travel_ticket");
assert.equal(preview.merchantName, "PHILIPPINE AIRLINES");
assert.equal(preview.billDate, "2025-08-13T12:00:00.000Z");
assert.equal(preview.bookingReference, "ABC123");
assert.equal(preview.documentNumber, "0792537473925");
assert.equal(preview.paymentMethod, "Visa ending 6003");
assert.equal(preview.total, "8172.00");
assert.deepEqual(
  preview.items.map((item) => [item.description, item.amount]),
  [
    ["Round-trip flight booking", "6458.00"],
    ["Seat Reservation PR318", "857.00"],
    ["Seat Reservation PR307", "857.00"],
  ]
);
assert.equal(assessReceiptPreviewQuality(preview).reliableForFastPath, true);

const workerSource = readFileSync(resolve(process.cwd(), "workers/import-processor.ts"), "utf8");
const fileTextSource = readFileSync(resolve(process.cwd(), "lib/import-file-text.server.ts"), "utf8");
assert.match(
  workerSource,
  /parseAirlineTicketReceiptText\(text\)[\s\S]*importMode = "receipt"[\s\S]*trainedReceiptDetails = buildReceiptDetailsFromPreview/,
  "A recognized airline ticket PDF must enter the deterministic receipt path."
);
assert.match(
  workerSource,
  /promotesNotesSplitBillToReceipt \|\| deterministicAirlineReceiptPreview[\s\S]*\? \[\]/,
  "Airline document fragments must be suppressed instead of becoming transactions."
);
assert.match(
  fileTextSource,
  /shouldPreferPdfTextLayerWithoutStatementGate[\s\S]*electronic\[\\s_-\]\*ticket[\s\S]*const textLayer = await extractTextFromPdfBytes[\s\S]*if \(textLayer\.trim\(\)\)/,
  "Text-native airline receipts must bypass rendered OCR while scanned PDFs retain the OCR fallback."
);

console.log("Airline ticket receipt regression passed.");
