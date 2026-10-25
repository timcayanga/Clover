# Driver earnings and wallet settlement reports

A `Driver Statement` with `Weekly Total`, `Earnings details`, and separate `Cash Wallet` / `Credit Wallet` columns is an earnings/settlement report, not a passenger receipt or a GCash wallet history. A GCash payout suffix does not establish the complete receiving account.

The current parser must preserve this report and require source review before generic financial parsing. Weekly earnings, detailed deliveries, tips, incentives, reimbursements and wallet cashouts overlap; importing each as independent income/expense would count the same money more than once. Loan balances and zero repayment attempts are not expenses. A complete reporting period does not supply an exact date for an undated incentive.

Future acceptance needs an independently reviewed earnings-versus-settlement representation, dated incentives, cash/cashless reconciliation and complete account evidence. Do not invent these fields, backdate incentives to the period end, or import only a convenient subset as a complete ledger.

The native reader retains the decisive report text without unnecessary OCR. The refusal uses the existing visible source-review phase and never creates financial rows, accounts, templates or learning observations. Independent synthetic negative examples and real-worker tests cover both statement and receipt import modes; a title alone cannot establish this source family.
