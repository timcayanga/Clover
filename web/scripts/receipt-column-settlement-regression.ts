import assert from 'node:assert/strict';
import { joinReceiptColumnSettlement } from '../lib/receipt-column-settlement';
import { parseReceiptText } from '../lib/split-bill';

// Invented source reproducing column-order OCR, not a customer receipt.
export const columnReceipt = `QUICK MEALS CORPORATION
SALES INVOICE
Invoice #: 00001234
Qty
Price
Description (S)
DINE IN
Rice Meal
1.00 @90.00
Chicken Meal
1.00 @160.00
2.00 Item (s)
Sub Total
TOTAL
Tendered:
CASH
Change:
VATable Sales (V)
VAT Amount
VAT Exempt
Sales(E)
Zero-Rated
Sales (Z)
90.00 V
160.00 V
250.00
250.00
1,000.00
750.00
223.21
26.79
0.00
0.00
10/23/2026 05:25:13 PM
BIR Accr. No. : SAMPLE-123
Date Issued: 03/01/2013
Valid Until: 07/31/2025
This serves as a Sales Invoice.`;
const prepared = joinReceiptColumnSettlement(columnReceipt);
assert.match(prepared, /TOTAL 250\.00/);
assert.match(prepared, /CASH 1,000\.00/);
const receipt = parseReceiptText(columnReceipt);
assert.equal(receipt.merchantName, 'QUICK MEALS CORPORATION');
assert.equal(receipt.total, '250.00');
assert.equal(receipt.subtotal, '250.00');
assert.equal(receipt.billDate?.slice(0,10), '2026-10-23', 'Purchase date outranks old printer permit dates');
assert.equal(receipt.receiptText, columnReceipt, 'Preserve the exact source independently of reconstructed cells');
assert.equal(receipt.currency, 'MIXED', 'Source parser must not manufacture a printed currency');
assert.equal(parseReceiptText(columnReceipt.replace('10/23/2026 05:25:13 PM\n','')).billDate, null, 'Printer accreditation/expiry dates are not purchase dates');
assert.equal(parseReceiptText('QUICK MEALS\nSALES INVOICE\nDate Issued: 10/23/2026\nTotal PHP 250.00').billDate?.slice(0,10), '2026-10-23', 'An invoice issue date without printer context remains valid');
assert.equal(parseReceiptText(columnReceipt.replace('10/23/2026 05:25:13 PM\n','').replace('Date Issued: ', 'Date Issued:\n').replace('Valid Until: ', 'Valid Until:\n')).billDate, null, 'Wrapped administrative labels remain excluded');


assert.equal(joinReceiptColumnSettlement(prepared), prepared, 'Normalization is idempotent');
for (const invalid of [
  columnReceipt.replace('750.00','751.00'),
  columnReceipt.replace('160.00 V','161.00 V'),
  columnReceipt.replace('250.00\n250.00','250.00\n251.00'),
  columnReceipt.replace('CASH\n','VISA\n'),
  columnReceipt.replace('Change:\n','Change:\nTOTAL\n'),
  columnReceipt.replace('1,000.00\n750.00','1000\n750'),
  columnReceipt.replace('VATable Sales (V)','Unknown fee'),
  columnReceipt.replace('90.00 V','90.00'),
  columnReceipt + '\nSub Total',
]) assert.equal(joinReceiptColumnSettlement(invalid), invalid, 'Unsafe/ambiguous alignment must remain unresolved');
assert.equal(joinReceiptColumnSettlement('RECEIPT\nTOTAL\n250.00'), 'RECEIPT\nTOTAL\n250.00');
console.log('Receipt columns: printed item/subtotal/total/cash/change agreement, exact source, purchase dates, idempotence and unsafe negatives passed.');
