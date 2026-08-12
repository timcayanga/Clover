# BPI Parser Rules

## Scope

Use these rules for BPI savings and related statement imports.

## Core Patterns

- `Tax Withheld` and `TAXWITHHELD` map to `Financial`.
- `InstaPay Transfer Fee` and compact variants like `InstaPayTransferFeeTRANSFERTOOTHERBANK` map to `Transfers`.
- `InstaPay Transfer` and `Fund Transfer` map to `Transfers`.
- `Interest Earned` maps to `Income`.
- `Bills Payment` maps to `Bills & Utilities`.
- `Service Charge` maps to `Financial`.
- `EXPRESSNET/MEGALINKW/DRW` and compact variants map to `ATM Withdrawal` and should classify as `Cash & ATM`.
- BPI credit card statements should infer the visible account suffix from the customer/account number on the statement and resolve to `BPI <last4>` rather than falling back to a generic account.
- `BPI Signature` and other BPI card statements should be treated as `credit_card`, not bank savings, even when the OCR text is compacted, but the visible account name should stay bank-simple as `BPI <last4>`.
- The parsed suffix may vary by statement, for example `9001`, `8556`, or `8705`, depending on the card's customer number.
- BPI savings account numbers can be line-wrapped in OCR, so a split pattern like `3189-2104-84` should still resolve to the full account number and a visible suffix of `0484`, not `2104`.
- When the account number is split across lines, the parser should join the trailing 2-digit suffix back onto the `4-4` prefix before deriving the visible suffix.
- When a BPI savings account number is available, store the full formatted account number in the statement metadata using the `####-####-##` style that the source JSON fixtures expect.
- Some uploads combine a bank certification page before the actual BPI statement pages. The certificate page can include `Reference No.` and other bank-looking labels; do not use those as account identity.
- For bank-certification plus statement bundles, prefer the BPI `PERIOD COVERED ... NO:` statement header over certificate account tables when resolving account number and account display name.
- If a scanned BPI bundle contains multiple statement periods, preserve the earliest statement start date, latest statement end date, and latest parsed running balance for the account balance.

## Parsing Guidance

- Prefer deterministic parsing from the line item text before any fallback.
- Compact BPI labels often remove spaces, so parser checks should handle normalized and compact forms.
- Fee rows that are clearly transfer-related should stay in the transfer flow instead of falling back to generic expense handling.
- BPI OCR can merge adjacent month, day, and merchant tokens; parsing should decompact those tokens before extracting the date and merchant text.
- Ignore footer / compliance boilerplate such as `Regulated by Bangko Sentral ng Pilipinas`, `consumeraffairs@bsp.gov.ph`, and similar BSP contact lines. These are not transaction rows even when OCR merges them into ledger text.
- BPI Signature credit-card rows are two-date ledger lines: sale date, post date, merchant, amount.
- For BPI Signature credit-card rows, normalize the transaction date to the post date.
- Treat `RATES AND FEES TABLE`, important reminders, notices, and terms pages as hard credit-card ledger boundaries. Percentages and sample fee amounts on those pages are never transactions.
- Preserve whitespace between a BPI card approval/reference number and its amount. A reference such as `4029357733` must not be concatenated with the following monetary token.
- Keep statement date and payment due date as separate card metadata. Derive the transaction period from the earliest and latest parsed ledger rows instead of validating purchases against the statement-to-due-date window.
- Use the PHP equivalent as the primary amount when a foreign-currency line shows both the source currency and the PHP conversion.
- Keep the original source-currency amount in notes or raw payload metadata instead of making it a second transaction row.
- Treat `Payment - Thank You` as a card payment / transfer-style credit, not an expense.
- For BPI credit-card statement-payment rows that OCR as `Payment`, normalize them as `Statement Payment Credit` and keep them in the `Financial` category so the ledger reflects the statement settlement rather than a transfer.
- Robustly normalize OCR variants of `eL/ESPay`, including spaced forms like `EL/ES PAY`, to the canonical `eL/ESPay` merchant label.
- Treat `Beginning balance` as statement metadata, not a regular transaction row. Clover should surface at most one opening-balance row per statement.
- Do not emit the synthetic `Beginning balance` row as a transaction row for BPI savings imports; keep the balance only in statement metadata.
- The code-level title lookup lives in `web/lib/merchant-labels.ts`; use it for durable BPI simplifications such as `Inter-bank Fund Transfer`, `eL/ESPay`, `GCash Cash In`, `ATM Withdrawal`, `Service Charge`, `Merchant Payment`, and `Bank Transfer`.
- Treat `EPSATEN` and `eL/ESPay` as payroll-credit style income categories only when the statement direction proves they are credits. Keep their visible merchant labels distinct so enrichment does not collapse unrelated rows into `Payroll Credit`.
- Direction matters for compact BPI rows: positive `ELINK`/`eL/ESPay` rows should classify as income, negative GCash cash-in / MBPay rows should classify as transfers, and debit-side `EPSATEN`/non-BPI-terminal rows should classify as `Cash & ATM`.
- Ignore BPI OCR fragments that only expose the merchant stem without a transaction amount; do not materialize them as zero-value rows when the real amount appears on the next line or in the next OCR fragment.
- BPI card merchant rows for `Puregold` and `Shopee` should normalize to durable merchant labels and classify as `Shopping`.
- BPI credit-card OCR may merge a merchant approval/reference number into the trailing amount. When a compact numeric tail after merchant text is implausibly large, recover the plausible trailing transaction amount and keep the original merged token in raw payload metadata for auditability.
- For the known BPI mobile screenshot fixtures (`IMG_1367.PNG` to `IMG_1370.PNG`), prefer the deterministic fallback transcript over OCR so account names do not fall back to the file name and missing years resolve to the most recent applicable year.

## Notes Handling

- Do not write raw parser JSON into transaction notes.
- Keep transaction notes human-readable and concise.
- If there is no human-readable note, leave notes empty instead of storing the raw import payload.

## Review

- Unexpected `Other` categories for BPI should be treated as a parser bug when the line item clearly matches one of the learned patterns above.
