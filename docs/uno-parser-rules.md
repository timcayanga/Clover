# UNO Digital Bank Parser Rules

This document captures the UNO Digital Bank / GSave parsing rules learned from the training bundles and should be used as a reference for future UNO imports.

## Scope

- Applies to `UNO Digital Bank` screenshots surfaced through `GSave` inside GCash.
- Covers `#UNOready@GCash` savings accounts and `#UNOboost@GCash` time-deposit screens.
- Treat screenshot-only account and product screens as `account_detail` imports, not transaction ledgers.
- Preserve raw and normalized data separately.

## Identity Rules

- When the screenshot clearly belongs to GSave-hosted UNO products, use `GSave` as the institution shown in Clover while preserving `UNO Digital Bank` as the provider institution in raw payloads.
- `#UNOready@GCash` should behave like a bank/savings account.
- `#UNOboost@GCash` should behave like an investment/time-deposit account.
- Name accounts with the visible product plus the visible last four digits:
  - `GSave #UNOready 4132`
  - `GSave #UNOboost 1330`
- If the screenshot only shows masked digits, keep the visible last four and do not invent the missing prefix.
- GSave overview and account-list screens often show only the visible last four digits, while time-deposit detail screens can show the full UNO account number.
- Clover should treat these as the same imported account when all of the following agree:
  - institution is `GSave`
  - product stem matches (for example `GSave #UNOboost`)
  - account type matches
  - the short account number is the suffix of the full account number
- Clover must not merge different `#UNOboost` deposits together just because they share the same product family.

## Summary Screen Rules

- GSave overview screens that show product cards and balances are account snapshots, not transaction history.
- UNO account-list screens that show `Savings Accounts` and `Deposit Accounts` are account snapshots, not transaction history.
- Emit one hidden snapshot marker row per visible account/product card.
- Use the visible balance or deposit amount as the account snapshot balance.
- Do not create synthetic transactions from labels like `Available Balance`, `Deposit Amount`, `Savings Accounts`, or `Deposit Accounts`.

## Time Deposit Rules

- `Time Deposit Account Details` screens are account-detail snapshots, not transaction history.
- Extract and preserve, when visible:
  - product name
  - full account number
  - deposit amount
  - interest rate
  - tenure
  - maturity amount
  - maturity interest
  - maturity instruction
  - maturity date
  - payout account number
- Use the deposit amount as the current snapshot balance unless a more explicit current value is shown.
- Preserve the maturity amount separately in raw payload rather than replacing the current balance with it.
- When Clover creates or updates an imported `#UNOboost@GCash` account from these screenshots, enrich the account as a fixed-income investment:
  - `type = investment`
  - `investmentSubtype = time_deposit`
  - `investmentPrincipal = deposit amount`
  - `investmentInterestRate = visible annual rate`
  - `investmentMaturityValue = maturity amount`
  - `investmentMaturityDate = visible maturity date`

## Review Gating

- If a continuation screenshot does not show enough identity to anchor the time deposit to a specific account number, do not invent one.
- Continuation screenshots that only restate maturity fields should attach to the previously identified time-deposit account context when that context is already available from the paired detail screenshot; otherwise they should stay metadata-only and create no synthetic account or transaction.
- Do not let labels like `Interest Rate`, `Tenure`, `Maturity Date`, or `Payout Acc No` become standalone transactions.

## Expected Outcome

- UNO / GSave screenshots should create or update the correct savings and time-deposit accounts in Clover.
- Time-deposit detail screens should enrich account snapshots with maturity details instead of generating bogus income or expense rows.
