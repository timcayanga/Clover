# Metrobank Parser Rules

This document captures the Metrobank parsing rules learned from the synthetic training bundles and should be used as a reference for future Metrobank import work.

## Scope

- Applies to Metrobank savings and Metrobank credit-card statement PDFs.
- Treat savings and credit-card statements as different statement shapes.
- Preserve raw and normalized records separately.
- Bank-specific title normalization is backed by `web/lib/merchant-labels.ts`.

## Savings Statement Rules

- Use running balance as a first-class field.
- Treat Metrobank savings statements with `DATE DESCRIPTION DEBIT CREDIT BALANCE` as the canonical savings shape.
- Prefer the Metrobank savings detector over generic RCBC savings logic when the statement has Metrobank branding and account-type savings metadata.
- Keep salary credits as `Income`.
- Keep `Fund Transfer` rows as `Transfers`.
- Keep `InstaPay Fee` as `Financial`.
- Keep `Bills Payment - Meralco` and similar utility payments as `Bills & Utilities`.
- Keep `ATM Withdrawal` and `ATM Fee` as separate rows.
- Preserve `Interest Earned` and `Tax Withheld` separately.
- Treat `Investment Sweep` as a special transfer-like mapping.
- Keep `Cash Payment - Thank You - MB` and bill payments to other cards as transfer-like settlement rows.
- Keep `WA CR` as `Incoming Transfer`, `WA DB` as `Outgoing Transfer`, `ET CR IBFT` as `Incoming Interbank Transfer`, `ET DB IBFT` as `Outgoing Interbank Transfer`, `ET WDL` as `ATM Withdrawal`, and Metrobank service-charge rows as `Financial`.

## Credit Card Rules

- Keep `Cash Payment` as a card-payment credit, not income.
- Preserve merchant rows when they have valid dates and amounts.
- Keep travel, shopping, food, transport, and business merchants as learned category candidates.
- Keep `OpenAI ChatGPT Subscription` as `Business` for this user.
- Capture `Payment Due Date` and `Total Amount Due` from the statement footer when present.
- Use the payment due date to infer the statement year for Metrobank credit-card rows when the row dates only show month/day.
- When the statement prints both a generic `Account Number` and a card-specific `Credit Card Account Number`, prefer the card-specific suffix for account identity.
- Treat `Cash Payment - Thank You - MB ATM` as a transfer/payment row.
- Keep `Mercury Drug` as `Health & Wellness`, `Puregold` and supermarket rows as `Food & Dining`, `Ateneo de Manila` as `Education`, and `RAE Auto Electrical` as `Transport`.
- Keep `Finance Charges` as a normalized merchant label and classify it as `Financial`.

## Review Gating

- Review adjustment-like entries and sweep-like rows when the intent is unclear.
- Review rows that look like statement housekeeping rather than actual transactions.

## Expected Outcome

- Metrobank savings should import as a ledger with reliable balances and transfer handling.
- Metrobank credit cards should import as a merchant stream with clean payment handling.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, sweep, and adjustment wording instead of collapsing it into generic spend.
- The Metrobank simplifier registry covers `ET CR IBFT`, `ET DB IBFT`, `ET IBFT SVCHG`, `ET WD ACQ SVCHG`, `ET WDL`, `WA CR`, `WA DB`, `ST DM GEN`, `ST CM GEN`, `MO DM`, `Cash Payment - Thank You - MB`, `Bills Payment to Metrobank Credit Card`, `Bills Payment to BDO Credit Card`, `Bills Payment to Bankard/RCBC`, `Salary Credit`, `InstaPay Fee`, `Meralco`, `Apple`, `Grab`, and `OpenAI ChatGPT Subscription`.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
