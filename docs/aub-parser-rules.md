# AUB Parser Rules

This document captures the AUB parsing rules learned from the synthetic training bundles and should be used as a reference for future AUB import work.

## Scope

- Applies to AUB savings and AUB credit-card statement PDFs.
- Treat savings and credit-card statements as different statement shapes.
- Preserve raw and normalized records separately.
- Bank-specific title normalization is backed by `web/lib/merchant-labels.ts`.

## Savings Statement Rules

- Treat `ASIA UNITED BANK` and `AUB Teller 360` statements as a ledger-style savings import.
- Name the account as `AUB <last4>` when the statement exposes a savings account number.
- Use running balance as a first-class field.
- Row shape: `Date / Check No. / Transaction Code / Debit / Credit / Ending Balance`.
- Keep `Instapay Credit` and `Instapay Debit` as transfer-style rows.
- Keep `ATMWD` as `ATM Withdrawal`.
- Keep `AFCINQ` and `Finance Charge` as `Financial`.
- Keep `INT` and `Interest Earned` as `Income`.
- Keep `TAX` and `Service Fee - Below Minimum` as `Financial`.
- Keep check and cash movement codes as transfer-like ledger rows.

## Credit Card Rules

- Treat `CARD NUMBER`, `TOTAL AMOUNT DUE`, `MINIMUM AMOUNT DUE`, and `TRANSACTION DETAILS` as the credit-card statement shape.
- Name the account as `AUB <last4>` when the statement exposes a card number.
- Row shape: `Transaction Date / Post Date / Description / Amount`.
- Keep `PAYMENT - THANK YOU` as a card-payment credit, not income.
- Keep finance charges as `Financial`.
- Preserve payment and fee rows even when they are short code fragments.

## Review Gating

- Review unknown code fragments until repeated examples exist.
- Review rows that look like paired liquidity movements or check routing.
- Review any row whose description is truncated or mixed with boilerplate.

## Expected Outcome

- AUB savings should import as a ledger with reliable balances and transfer handling.
- AUB credit cards should import as a liability stream with clean payment and fee handling.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, and payment wording instead of collapsing it into generic spend.
- The AUB simplifier registry covers `PAYMENT - THANK YOU`, `FINANCE CHARGE`, `ATMWD`, `AFCINQ`, `INSTAPAY CREDIT`, `INSTAPAY DEBIT`, `CHECK ISSUED`, `CASH DEPOSIT`, `CREDIT MOVEMENT`, `DEBIT MOVEMENT`, `ENCASHMENT`, `CHECK DEPOSIT`, `INTERNAL CLEARING`, `INTERNAL CLEARING ON-US`, `ON-US TRANSACTION`, `INT`, `TAX`, and `Service Fee - Below Minimum`.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
