# Receipt intake verification, October 4, 2026

## Incident and change

A real camera receipt was routed as investment history because “Method” matched an unbounded `eth` token. Server OCR and cloud extraction took about 45 seconds. Missing currency and tax already included in the printed total then prevented completion, while a single expensive cloud attempt exhausted the Free account's allowance.

The revised path transmits bounded Apple Vision/Google ML Kit OCR evidence alongside the retained original image, overlapping OCR with upload. Deterministic receipt parsing runs first. A usable merchant/date/total becomes a review-required transaction without a second cloud image read. Missing currency uses the user's default with recorded provenance. Incomplete receipts retain a separate editable draft, even when cloud allowance is exhausted. Unreconciled itemization is omitted from suggestions rather than changing printed amounts or discarding the original OCR.

Local processing no longer consumes cloud allowance. Failed AI extraction has separate, idempotent credits; original usage audit records remain. Clearly irrelevant text is rejected before provider requests, while sparse or uncertain financial evidence is allowed to proceed.

## Measured result

The original private camera photo was replayed through Apple Vision on macOS using the native OCR configuration, then through the current import worker with a disposable Free account whose cloud allowance was exhausted.

| Measurement | Result |
| --- | --- |
| Apple Vision OCR | 912 ms |
| Import worker with local PostgreSQL | 338 ms |
| Combined processing, excluding transport | About 1.25 s |
| External AI requests | 0 |
| Printed amount | 425, correctly extracted |
| Receipt date | September 11, 2026, correctly extracted rather than the footer accreditation date |
| Currency | PHP from user default; editable and marked as a suggestion |
| Category | Food & Dining |
| Review status | Pending review, confidence 45 |

This is one incident replay, not a corpus accuracy score or a physical-phone end-to-end benchmark. Merchant OCR still contained a spelling error and remained review-required. Camera capture, mobile CPU, upload, production database and network latency are excluded. The under-ten-second target requires physical iOS and Android measurements after the next native build.

## Behavioral checks

- Incomplete receipt: readable merchant/date retained, unreadable amount blank, cloud-free edit and confirmation succeed.
- Explicit confirmation preserves the raw receipt payload. Repeating confirmation returns the same transaction.
- Cancellation at 0/25 ms wins with zero transactions; cancellation at 120/450 ms loses to a committed transaction and is rejected. Saved records are never deleted by cancellation.
- Historical failure credit restores the Free monthly and rolling-day allowance exactly once, including concurrent reconciliation.
- Malformed AI responses are not charged. Local compatibility grants work independently of exhausted cloud quota.
- A clearly irrelevant document passed to the exported cloud parser makes zero external calls and emits no usage charge.
- Android native OCR Kotlin compilation passed via `:clover-local-ai:compileDebugKotlin`; no APK or app bundle was produced.
- Full root `npm run qa:prepush` passed after the final changes, including security checks, parser/account regressions, TypeScript, native bundle export and the web production build.
- Browser verification of the actual progress/editor components in a mocked local harness passed at 390 × 844 and 1280 × 900. The compact overlay clears the mobile navigation; pause/resume/cancel states and partial-receipt edit/save work. This verifies web rendering and interaction, not native device behavior.

The disposable database integration is implemented in `web/scripts/receipt-free-cloud-limit-db.ts`. It requires an explicitly marked, isolated local/staging database and intercepts provider calls. Private photo/OCR inputs and detailed runtime logs were retained outside Git. Fixture users were deleted and the temporary PostgreSQL service was stopped after the checks.

See [progress and launch verification](receipt-progress-controls-2026-10-04.md) for Figma references, progress controls and launch branding. Native OCR transport and the splash asset require a new native binary; server changes can ship independently.
