# Backup Parser Rules

The backup parser exists to keep Clover usable when the deterministic parser is unsupported, incomplete, or low-confidence.

## Routing

- Run a quick deterministic scan first.
- Make the route decision within the first 5 seconds of processing when possible.
- Prefer the local parser when the file has a trusted institution match, usable account identity, coherent dates, and structurally valid rows.
- Escalate to the backup parser immediately when OCR is weak, the institution is unknown, screenshot text is sparse, account identity is missing, or the local parse looks suspicious.
- Use hybrid enrichment when the local parser found real rows but the result is incomplete or low-confidence.

## Extraction Contract

- Preserve raw values separately from normalized values.
- Preserve account identity, visible balances, visible currencies, date coverage, and source order.
- Preserve notes and parser evidence when the source is blurry, cropped, fragmented, or multi-currency.
- Never invent account numbers, balances, or transactions.
- Return only rows supported by visible evidence.

## Screenshot Rules

- Ignore mobile status bars, search bars, filters, pagination chrome, and overlapping screenshot edges.
- Avoid duplicating transactions when adjacent screenshots overlap.
- For wallet screenshots with two amounts, use the amount debited from the user's wallet/account as the canonical amount and preserve the merchant currency in notes or evidence.
- Treat `+`, `Added`, `Received`, `Refunded`, `Deposit`, and `Cash In` as inbound movement unless the file clearly says otherwise.

## Generic Categorization Rules

- Use keyword and context clues before falling back to `Other`.
- Person-like names usually map to `Transfers`.
- Grocery, market, supermarket, cafe, restaurant, sushi, dumplings, coffee, and bar merchants usually map to `Food & Dining`.
- Airport, train, bus, parking, transport agencies, and transit merchants usually map to `Transport`.
- Souvenir, tourism, relay, convenience, and obvious retail merchants usually map to `Shopping` or `Travel & Lifestyle` depending on context.
- ATM withdrawals, cash withdrawals, and cash advances usually map to `Cash & ATM` unless they are clearly fees.

## Confidence And Review

- Lower confidence when the file is blurry, OCR is fragmented, rows cannot be reconciled, or the source is only partially visible.
- Keep low-confidence rows reviewable instead of forcing aggressive normalization.
- Do not override confirmed user data.
