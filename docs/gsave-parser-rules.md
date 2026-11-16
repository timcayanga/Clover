# GSave Parser Rules

This document captures the GSave parsing rules learned from the screenshot training work and should be used as a reference for future GSave import work.

## Scope

- Applies to GSave screenshots surfaced through GCash.
- Covers both CIMB-backed savings views and UNO-backed savings / time-deposit views.
- Treat screenshot-only product, account, and detail pages as account snapshots unless the screen clearly shows a transaction history.
- Preserve raw and normalized data separately.

## Identity Rules

- Show `GSave` as the Clover institution for GSave-hosted products.
- Group GSave savings products and time deposits under one GSave institution card in Accounts while preserving each underlying account and account number.
- Preserve the provider institution separately in raw payloads:
  - `CIMB` for GSave savings screenshots
  - `UNO Digital Bank` for `#UNOready@GCash` and `#UNOboost@GCash`
- For account-inventory files labeled `GSave (UNO)`, persist `GSave` as the displayed institution and retain `UNO Digital Bank` only as provider metadata. Use the customer-facing GSave/GCash mark instead of an UNO Bank or generic investment icon.
- Do not invent missing account numbers.
- If only the visible last four digits are shown, use only the visible suffix.
- Do not let screenshot filenames become account numbers.

## Screenshot OCR Rules

- GSave-family screenshots often contain OCR variants that should be normalized before statement detection and parsing:
  - `CiMB` -> `CIMB`
  - `unoreadyeccash`, `unoreadyccash` -> `#UNOready@GCash`
  - `unoboosteccash`, `unoboostccash` -> `#UNOboost@GCash`
  - duplicated markers like `##UNOready@GCash` should collapse to a single `#`
- On GSave-family screenshots, OCR may misread `₱` as `£` or `$`; normalize those back to peso amounts before parsing.
- Treat UI labels like `Hub`, `FAQ`, `Need Help`, `Auto Deposit`, `Savings Accounts`, `Deposit Accounts`, and similar shell text as layout noise unless they are needed to identify the screen type.

## Overview And Account-List Rules

- GSave overview screens that show `My Accounts` or multiple visible product cards are account snapshots, not transaction history.
- UNO list screens that show both `Savings Accounts` and `Deposit Accounts` are multi-account snapshot screens.
- Emit one hidden snapshot marker row per visible product/account card.
- If the screen clearly shows multiple visible product cards but the local parser only recovers one account snapshot, treat the parse as incomplete and escalate early to transcript repair or backup parsing.

## CIMB Rules

- Treat GSave / CIMB overview cards as bank accounts.
- Name CIMB-backed screenshots as `GSave CIMB <last4>`.
- Use the visible card balance as the account snapshot balance.

## UNO Rules

- `#UNOready@GCash` behaves like a bank/savings account.
- `#UNOboost@GCash` behaves like an investment / time-deposit account.
- Keep the visible product stem plus visible digits in the account name:
  - `GSave #UNOready 4132`
  - `GSave #UNOboost 1330`
- Time-deposit detail screens should preserve maturity metadata without fabricating transactions.
- Render each `#UNOboost` time-deposit account as a GSave holding using its deposit amount. Do not treat unrelated GCash investment snapshots, including GCrypto holdings, as GSave assets.
- Repair a legacy uploaded time deposit from its preserved snapshot row only when its time-deposit subtype or principal metadata was never materialized. Do not overwrite a complete time deposit that a user later changes or closes.

## Review Gating

- If a continuation screenshot does not show enough identity to anchor a specific account, do not invent one.
- If OCR only recovers partial shell text, malformed amounts, or one snapshot from a clearly multi-account screen, route it to repair / backup parsing rather than silently confirming a partial result.
- Do not let screenshot UI chrome become transactions.

## Expected Outcome

- GSave screenshots should quickly produce the correct savings or investment accounts in Clover.
- Partial screenshot parses should escalate earlier instead of failing later in the UI.
