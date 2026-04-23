# Clover

Clover is a personal finance app focused on statement import, transaction parsing, categorization, and user-guided learning.

## Read First

1. `docs/user-management-spec.md`
2. `docs/bpi-parser-rules.md` when working on BPI imports
3. `docs/rcbc-parser-rules.md` when working on RCBC credit-card imports
4. `docs/bdo-parser-rules.md` when working on BDO imports
5. `docs/unionbank-parser-rules.md` when working on UnionBank imports
6. `docs/gcash-parser-rules.md` when working on GCash imports
7. `docs/metrobank-parser-rules.md` when working on Metrobank imports
8. `docs/citibank-parser-rules.md` when working on Citibank imports
9. `docs/security-bank-parser-rules.md` when working on Security Bank imports
10. `docs/maya-parser-rules.md` when working on Maya imports
11. `docs/landbank-parser-rules.md` when working on LandBank imports
12. `docs/wise-parser-rules.md` when working on Wise imports
13. `docs/maribank-parser-rules.md` when working on MariBank imports
14. `docs/psbank-parser-rules.md` when working on PS Bank imports
15. `docs/chinabank-parser-rules.md` when working on China Bank imports
16. `docs/hsbc-parser-rules.md` when working on HSBC imports
17. `docs/eastwest-parser-rules.md` when working on EastWest imports
18. `docs/gotyme-parser-rules.md` when working on GoTyme imports
19. `docs/bank-of-commerce-parser-rules.md` when working on Bank of Commerce imports
20. `docs/bank-of-china-parser-rules.md` when working on Bank of China imports
21. `docs/cimb-parser-rules.md` when working on CIMB imports
22. `web/prisma/schema.prisma`
23. `web/lib/import-parser.ts`
24. `web/lib/data-engine.ts`
25. `web/workers/import-processor.ts`

If `docs/product-spec.md` is added later, it should become the primary product spec and supersede `docs/user-management-spec.md` for implementation guidance.

## Core Rules

- AI suggests, user confirms, system learns.
- Never overwrite confirmed financial data.
- Keep raw import data separate from normalized data.
- Keep raw descriptions and simplified titles separate when both are available.
- Use confidence scores for all AI or heuristic outputs.
- Send low-confidence results to a review queue instead of auto-confirming them.
- Preserve the raw statement/file payloads needed for traceability.

## Parsing And Categorization

- Prefer deterministic parsing before any AI fallback.
- Reuse existing statement detection, merchant normalization, and category fallback logic before inventing new rules.
- Learn from confirmed user edits and merchant rules.
- Treat merchant rules as durable memory, not one-off guesses.
- Avoid silently changing category or merchant values when a row is already confirmed.
- When a new institution appears, add a dedicated `docs/<institution>-parser-rules.md` file and link it here so the rules persist.

## Data Handling

- Source files, parsed rows, normalized transactions, and learned rules are distinct stages.
- If a change affects the import pipeline, preserve the audit trail from raw file to parsed row to transaction.
- Keep confidence, reason, and review status fields updated together.
- Do not collapse raw and normalized payloads into one structure.

## Implementation Notes

- The main app lives under `web/`.
- Import and categorization logic is primarily in `web/lib/import-parser.ts`, `web/lib/data-engine.ts`, and `web/workers/import-processor.ts`.
- Bank-specific merchant simplifiers live in `web/lib/merchant-labels.ts`; add new bank mappings there when parser notes discover durable title normalization rules.
- Schema changes belong in `web/prisma/schema.prisma`.
- When behavior changes, prefer updating the relevant tests or check scripts in `scripts/` or `web/scripts/`.

## Safety

- If a task could change confirmed financial records, pause and verify the intended behavior before making the change.
- If a rule conflicts with the product spec, the spec wins.
- If a rule conflicts with existing confirmed data, preserve the confirmed data and adapt the new logic around it.
