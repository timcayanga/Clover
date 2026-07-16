# Generic Screenshot Parser Rules

These rules apply when an uploaded screenshot does not match a trained institution parser.

## Account and product overviews

- Recognize repeated account cards only when the screen has account/product overview signals such as `Your products`, `My accounts`, or `Balances`.
- Emit one `account_snapshot_marker` per visible account card when an account identity and balance are present.
- Keep the row review-required and preserve the OCR source text in `rawPayload`.
- Do not infer an institution, account type, currency, or investment units beyond what the screenshot explicitly supports.

## Mobile activity screens

- Recognize a generic activity/transaction screen only when it contains both transaction-history signals and signed monetary values.
- Pair a date header, following description lines, and the next signed amount conservatively.
- Emit low-confidence, review-required rows with `rawPayload.kind = generic_mobile_screenshot_transaction`.
- Never let the generic fallback override a trained parser, a deterministic statement parser, or confirmed financial data.

## Investment semantics

- Shares, units, and principal are optional fields and must only be emitted when the screenshot labels them.
- Time deposits should carry deposit, maturity, interest-rate, tenure, and maturity-date metadata when visible, but must not be represented as share/unit holdings.
- Ambiguous values belong in the review queue rather than being auto-confirmed.
