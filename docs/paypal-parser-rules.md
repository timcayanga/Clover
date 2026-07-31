# PayPal Parser Rules

## Scope

These rules cover PayPal balance and activity statements, plus the separately branded PayPal Credit product.

## Account Classification

- Classify ordinary PayPal balance and activity statements as `wallet`.
- Do not infer a credit-card account merely because an activity statement contains words such as `credit`, `statement date`, or credited transactions.
- Classify an account as `credit_card` only when the product identity explicitly says `PayPal Credit`.
- Keep PayPal payment-rail transactions inside another bank or card statement attached to that source account; a merchant reference to PayPal does not make the source account a PayPal wallet.

## Existing Accounts

- When a normal PayPal upload matches one legacy upload-created PayPal account classified as `credit_card`, repair that account to `wallet`.
- Preserve its account ID, transactions, currency, and balance during the repair.
- Never convert an explicitly labeled PayPal Credit account to a wallet.
