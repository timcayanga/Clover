# Displayed figures — 19 September 2026

## Root causes and fixes

- R02: Reports' weekly text began six days before the end date without resetting the time to midnight. Its chart did reset the start, so transactions on the first day appeared only in the chart. Summary values now come directly from the chart's latest two aggregated buckets, including their date boundaries.
- P03: Goal directory/native progress used a bounded rolling 30-day ledger, while the web detail used signed SQL sums from a moving timestamp with no upper bound. Future entries could inflate progress, currencies could be combined for a legacy goal, and investment progress used a 180-row preview. Web details now reuse the directory/native activity loader, currency selection, complete ledger totals, and identical 30-day boundaries. Previous-period comparisons use the immediately preceding non-overlapping period.
- Annual goal percentages describe monthly pace. Legacy annual plans now use the same cadence conversion as Profile goals. Directory cards and web details show the period used, distinguishing recent financial activity from funds reserved for a goal.
- Supporting detail queries now exclude future dates and cache under a date/currency-specific versioned key.

No financial records, balances, goal targets or confirmed transactions are rewritten. These changes affect read-time calculations and labels.

## Regression coverage

Weekly start/end and year boundaries; first-day transactions; negative expense magnitudes; transfer exclusion; more than 180 activity rows; annual targets converted to monthly pace; detail use of the shared activity source and upper date bound. Included in the required pre-push gate.
