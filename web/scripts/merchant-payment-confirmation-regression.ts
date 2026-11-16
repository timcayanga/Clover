import assert from "node:assert/strict";
import { readMerchantPaymentConfirmation } from "../lib/merchant-payment-confirmation";
import { hasReceiptPhotoEvidence } from "../lib/receipt-intake";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
// Independently invented merchant, amount, date, payee code and reference.
export const paymentConfirmation = `11:44
Transaction Details
Payment to Sample Bakery Inc
1122
Amount
Date & Time
-80.00
Oct 29, 2026 10:30AM
Reference Number
1234567890
Have questions or concerns? Get Help`;
const proof=readMerchantPaymentConfirmation(paymentConfirmation)!;
assert.deepEqual(proof,{merchant:"Sample Bakery Inc",amount:80,date:"2026-10-29",reference:"1234567890"});
assert(hasReceiptPhotoEvidence(paymentConfirmation));
const p=parseReceiptText(paymentConfirmation);
assert.equal(p.merchantName,proof.merchant);assert.equal(p.total,"80.00");
assert.equal(p.billDate?.slice(0,10),proof.date);assert.equal(p.documentNumber,proof.reference);
assert.equal(p.receiptText,paymentConfirmation);assert.equal(p.receiptType,"generic_receipt");
assert.equal(p.currency,"MIXED","Absent currency remains absent in source extraction");
assert.equal(p.receiptAccountMatch,null,"Merchant code is not the user's account suffix");
assert.equal(p.paymentMethod,null,"No issuer or payment method is fabricated");
assert.equal(p.subtotal,null);assert.equal(p.items.length,0);assert.equal(p.requiresReview,true);
assert(assessReceiptPreviewQuality({...p,currency:"PHP",currencyWarning:null,requiresReview:false}).reliableForFastPath,"Validated merchant/date/debit/reference core does not need a second model read");
assert(!assessReceiptPreviewQuality({...p,total:"800.00",currency:"PHP",currencyWarning:null,requiresReview:false}).reliableForFastPath,"A conflicting amount loses the source-specific evidence bonus");
for(const invalid of [paymentConfirmation.replace("-80.00","+80.00"),paymentConfirmation.replace("-80.00","80.00"),
 paymentConfirmation.replace("-80.00","-8,00.00"),paymentConfirmation.replace("-80.00","-80.00\n5.00"),
 paymentConfirmation.replace("-80.00","-80.00\n-5.00"),paymentConfirmation+"\nFee 5.00",
 paymentConfirmation.replace("Oct 29","Feb 30"),paymentConfirmation.replace("10:30AM","25:30AM"),
 paymentConfirmation.replace("Reference Number","Unknown identifier"),paymentConfirmation+"\nReference Number\n9876543210",
 paymentConfirmation.replace("Sample Bakery Inc","BPI"),paymentConfirmation.replace("Sample Bakery Inc","GCash"),
 paymentConfirmation.replace("Sample Bakery Inc","Unknown Savings Bank"),paymentConfirmation.replace("Sample Bakery Inc","Sample\nBakery Inc"),
 paymentConfirmation.replace("Payment to","Sent to"),paymentConfirmation.replace("Payment to","Transfer to"),
 ...["Pending","Processing","Declined","Cancelled","Refund","Transaction History","Opening Balance 100.00","Account number 12345678","Paid from Example Bank"].map(s=>paymentConfirmation+"\n"+s)]) {
 assert.equal(readMerchantPaymentConfirmation(invalid),null,"Ambiguous, incomplete, non-purchase or conflicting source cannot establish a merchant expense");
}
console.log("Merchant payment confirmation: exact source debit/date/reference, editable unknown currency, no invented account/items, and unsafe transfer/refund/fee/history negatives passed.");
