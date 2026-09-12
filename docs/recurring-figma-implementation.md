# Recurring Figma implementation — 12 September 2026

Reference: Screens / 01 — Organize, file FNnCmCj90szZAnZ6twMPCy. Overview 439:2142 / 439:2334; section redesigns 441:2159, 441:2355, 441:2538, 441:2721; current Add Recurring states under 547:19570; details 444:2466.

## Changes

- Overview summary, payment calendar, review preview with full queue expansion, and upcoming list. Four section views have summary cards, seven-day strips, account/date filters, compact rows, and desktop drawers/mobile details. All saved items remains available for inactive or out-of-window records. Mobile swipe deletion and shared bottom navigation remain available.
- Four amount-first creation forms with type pills, currency codes, expanded details, validation, schedule recaps, and tracking-only save actions. Supports fixed/variable payments, standard repeat cadences, end dates/counts, debt payment amounts separate from balances, owed repayment plans, installment counts, and month-end timing.
- Nullable JSON tracking stores the new configuration independently of existing financial records. No backfill or financial transaction creation is performed. Existing records retain their original cadence. Counts/end dates bound newly configured schedules; final owed repayments are capped at the remaining scheduled balance.
- Details stage edits until Save changes and send one atomic PATCH, including date pairs. Completion remains a separate occurrence action and maps an earlier planned date to its contractual due date. Existing review confirmation/evidence protections remain in place.
- Currency totals are separate. Existing reminders honor new per-item reminder preferences. Budget/mobile debt previews use a configured payment amount rather than the whole outstanding balance. Home excludes occurrences beyond configured finite terms.

## Data limits

Historical original debt balances are not recorded, so Paid down explicitly shows Not recorded. Expected income covers scheduled money owed; it does not invent salary data. Legacy installment records without explicit terms remain visible and keep their original schedule; only configured terms drive remaining-payment totals. Reminder choices configure the existing in-app due notification system.

## Verification

Isolated local PostgreSQL/Redis, synthetic QA Recurring Profile only. Temporary QA page removed before release. No live financial records were edited for testing.

- 68 browser checks across 1440px desktop and 390px mobile web: all five sections, calendar, detail access, all four creation forms and expanded details, overflow, installment validation, creation/persistence, and close behavior.
- 16 additional desktop/mobile checks: calendar navigation/reset, account filter, staged/canceled edits, saved details, and final overflow.
- 4 final checks: atomic date-pair save, occurrence completion, completion scoped to its date, and mobile active-label contrast.
- 14 API checks: type saves and persisted tracking, variable/finite/one-time configuration, invalid terms/dates/negative values, cross-Profile account rejection, and metadata preservation on edits.
- 17 executable schedule/tracking regressions, including legacy compatibility, terminal months, month-end dates, capped final repayments, and planned-to-due completion mapping.
- Required qa:prepush gate passed locally; the pre-push hook repeats the gate against the committed release. Native TypeScript/export checks are included in that gate; device UI testing is not claimed.
