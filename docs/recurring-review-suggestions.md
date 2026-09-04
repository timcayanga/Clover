# Recurring review suggestions

Updated September 3, 2026.

- Every review supports **Not a recurring payment**. Dismissals are persisted, workspace-authorized, origin-checked, and idempotent. Merchant candidates suppress matching merchant families; a statement/installment suggestion is dismissed individually so a future statement can still be reviewed.
- Known descriptors receive editable display titles (Apple.com/Bill → Apple, Scribd references → Scribd). Unknown names are retained, not guessed. Raw merchant descriptions and confirmed financial records are unchanged.
- Rows show the most common category among detected transactions, with a reason-based fallback when evidence has no category.
- Detected transaction history stays visible. Additional transactions appear only after a nonblank search. Older annual evidence is loaded by ID instead of expanding the entire client payload.

## Eligibility

Suggestions are not declarations that a subscription is active or cancelled. They remain unconfirmed until the user saves them.

| Cadence | Maximum age of latest matching transaction |
| --- | --- |
| Weekly | 21 days |
| Biweekly | 42 days |
| Monthly | 75 days |
| Quarterly | 200 days |
| Annual | 410 days |

Age is measured against the current date, not the last uploaded statement. This intentionally hides old suggestions even if the user has not imported recent history. Uploading new matching evidence can make them eligible again. Saved recurring items are not filtered this way.

Annual cadence requires at least two observations within 21 days of a calendar-year anniversary. A broad ten-to-fourteen-month gap is no longer enough. Detection reads the newest 6,000 normalized transactions within 800 days. Extremely high-volume accounts may still need a wider history window; detection does not claim exhaustive coverage beyond this cap.

Deleted/excluded normalized transactions are not reused from raw parser payloads. Raw parsed rows are a legacy fallback only when the normalized Transaction table does not exist.

## Verification

- `npm run qa:prepush`: full typecheck, regression suites, production build passed.
- `qa:recurring-ledger` includes `recurring-suggestion-regression.ts`: title aliases, preserved unknown names, category selection, current/stopped monthly patterns, annual renewals, expired yearly patterns, rejected irregular intervals, singleton/discretionary exclusions, search-only results, and dismissal route safeguards.
- Synthetic 6,000-row detector-only run: 83 ms locally. This excludes database, network, and rendering time and is not a UI latency promise.
- Signed-in staging account has no candidate suggestions. Live browser checks can verify page layout, but not a real candidate dismissal without adding test financial data.
- Deployed to `https://staging.clover.ph`, preview `dpl_bkupeewN79odZiQYMB7fKpGSY7hn` (READY). `/api/health` returned this exact deployment ID. Desktop and 390px mobile page checks passed with no horizontal page overflow or browser errors. Production was not changed.
