// Independently invented negative examples. These assert refusal/review, never
// accepted financial labels, model training, or user-confirmed transactions.
export const reviewCases = [
  { id: 'driver-settlement', reason: /Driver earnings need review/, text: `Driver Statement
1 August, 2026 - 7 August, 2026
Paid to Example Driver
PH | Globe - GCash 0001
Weekly Total PHP 30.00
Earnings details
Deliveries net earnings 20.00
Incentives 10.00
Date / Time Booking ID Cash Wallet Credit Wallet Subtotal
2026-08-02 10:00 A-INVENTED 20.00 0.00 20.00` },
  { id: 'tax-summary', reason: /SeaBank tax summary needs review/, text: `SUPPORTING WITHHOLDING TAX DOCUMENT
SEABANK ACCOUNT: 901000000001
INTEREST AND TAX SUMMARY
ACCOUNT NAME INTEREST AMOUNT TAX AMOUNT ENDING BALANCE
SAVINGS 2 0 102
The Summary of Interest and Tax is generated from Bank Statement.` },
  { id: 'cimb-summary-conflict', reason: /CIMB statement needs review/, text: `Statement of Account
For Aug 01, 2026 to Aug 07, 2026
SUMMARY
Opening Balance PHP 10.00
Total Deposit PHP 20.00
Total Withdrawal PHP 5.00
Closing Balance as of Aug 07, 2026 PHP 26.00
GSave - Savings Account No. 00000000000001
Date Detail Deposit Withdrawal Balance
Aug 01, 2026 Opening Balance PHP 10.00` },
  { id: 'gcash-running-conflict', reason: /1 running balance disagree/, text: `GCash Transaction History
Date and Time Description Reference No. Debit Credit Balance
STARTING BALANCE 100.00
2026-08-01 03:01 Sent GCash to Example 1000000000001 10.00 90.00
2026-08-01 03:02 Sent GCash to Example 1000000000002 20.00 80.00
ENDING BALANCE 80.00
Total Debit 30.00
Total Credit 0.00` },
  { id: 'gcash-totals-conflict', reason: /debit\/credit totals do not reconcile/, text: `GCash Transaction History
Date and Time Description Reference No. Debit Credit Balance
STARTING BALANCE 100.00
2026-08-01 03:01 Sent GCash to Example 1000000000001 10.00 90.00
2026-08-01 03:02 Sent GCash to Example 1000000000002 20.00 70.00
ENDING BALANCE 70.00
Total Debit 31.00
Total Credit 0.00` },
];
