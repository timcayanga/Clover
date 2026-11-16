import assert from "node:assert/strict";
import { hasReceiptPhotoEvidence } from "../lib/receipt-intake";
import { joinRestaurantBillColumns } from "../lib/restaurant-bill-columns";
import { parseReceiptText, isSuspiciousReceiptMerchantName } from "../lib/split-bill";
// Independently invented source: restaurant labels precede the amount column.
export const restaurantBill = `SAMPLE GRILL
BILL
Order: TABLE 3
Dine in
Chicken Meal
1 x P200.00
Rice Meal
2 x P50.00
Drink
1 x P40.00
Subtotal
SERVICE CHARGE, 10%
Amount due
22/10/2026 4:06 pm
P200.00
P100.00
P40.00
P340.00
P34.00
P374.00`;
assert.equal(hasReceiptPhotoEvidence(restaurantBill),true);
const joined=joinRestaurantBillColumns(restaurantBill);
assert.match(joined,/Amount due P374\.00/);
assert.equal(joinRestaurantBillColumns(joined),joined);
const receipt=parseReceiptText(restaurantBill);
assert.equal(receipt.total,"374.00");
assert.equal(receipt.billDate?.slice(0,10),"2026-10-22");
assert.equal(receipt.receiptText,restaurantBill,"Original source survives reconstructed reading order");
for(const invalid of [restaurantBill.replace("P374.00","P375.00"),restaurantBill.replace("10%","12%"),
 restaurantBill.replace("P100.00","P101.00"),restaurantBill.replace("2 x P50.00","2 x P51.00"),
 restaurantBill+"\nUnknown fee",restaurantBill+"\nSubtotal",restaurantBill.replace("P34.00","$34.00")]) {
 assert.equal(joinRestaurantBillColumns(invalid),invalid,"Ambiguous arithmetic/currency/layout remains unresolved");
}
assert.equal(hasReceiptPhotoEvidence(restaurantBill+"\nTransaction History\nOpening Balance 1000.00"),false,"Bank ledgers cannot be rerouted by incidental BILL text");
assert.equal(hasReceiptPhotoEvidence("BILL\nAmount due P374.00"),false,"A bill label alone is not evidence of an itemized receipt");
const slip = "SAMPLE STORE\nMERCHANT ID\nTEST123\nTERMINAL ID\n123456\nPAYMENT CHANNEL\nCard\nCARD TYPE\nVISA\nTRANSACTION TYPE\nSALE\nAPPROVED\nSALE AMOUNT\nPHP 149.00\nCustomer COPY";
assert(hasReceiptPhotoEvidence(slip),"Card-terminal sales slips are receipts, not bank ledgers");
assert(!hasReceiptPhotoEvidence(slip.replace("SALE AMOUNT","Unknown value")));
assert(!hasReceiptPhotoEvidence(slip.replace("TRANSACTION TYPE\nSALE","TRANSACTION TYPE\nREFUND")),"A refund/void terminal operation is not classified as a purchase");
assert(!hasReceiptPhotoEvidence(slip+"\nTransaction History\nOpening Balance 100.00"));
assert(hasReceiptPhotoEvidence("SAMPLE RETAIL STORE\nVAT REG TIN\nSUBTOTAL\nAMOUNT TO PAY\nPHP 149.00\nGCASH"));
for(const footer of ["RETAIN THIS COPY FOR YOUR RECORDS","RETAI THIS COPY FON YOUR RECONDS","Customer COPY","MERCHANT COPY"]) assert(isSuspiciousReceiptMerchantName(footer),"A terminal footer cannot establish a merchant for the fast path");
console.log("Restaurant BILL routing: independent item/quantity/subtotal/service-charge/total proof, date, raw evidence and unsafe negatives passed.");
