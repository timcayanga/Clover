# Native Organize completion — September 12, 2026

Follow-up to the read-only native limitations in `organize-figma-implementation.md`.

## Delivered

- Accounts: add all supported account types; open authenticated details; edit identity, institution, currency, account type, manual opening balance, credit metadata and investment metadata; delete with an explicit warning about linked transactions/import artifacts. Account numbers remain masked in responses. Initial creation excludes identifier/history upserts; advanced fields are edited on the saved account. Native-created accounts use the manual balance model.
- Recurring: create/edit all four kinds, dates, cadence, account, category, notes, status and payment tracking; review suggestions as editable drafts or dismiss them; complete/undo individual payment occurrences; delete schedules with confirmation. Calendar display dates map back to contractual due dates for completion. Recurring deletion does not delete financial transactions.
- Home: daily income/expense charts with selectable day details, equal rolling comparisons, category spending, actual budget progress, unresolved transaction count and a native budget directory. Reporting boundaries use Asia/Manila. Currency choices include recorded transaction currencies. Home payment previews advance recurring schedules, exclude completed payments and separate recent overdue items. Hide balances covers Home chart accessibility labels, selected-day details, budget amounts and payment amounts; budget percentages remain visible.
- Native forms keep the shared navigation, support light/dark mode, retain failed-save drafts and discard canceled drafts. Profile changes remount financial screens.

The changes use shared React Native sources for iOS and Android. The authenticated mobile gateway reuses existing web mutation handlers, verifies the selected Profile before dispatch, validates inputs and returns minimal data. Account patches omit unchanged fields; recurring patches preserve omitted tracking and evidence.

## Verification

- 28/28 demo UI checks across light/dark: account and recurring validation, cancellation, edit and delete confirmation behavior.
- 20/20 network-backed React Native browser UI checks across light/dark: Home series/budget display and privacy, failed-save retry, partial account patch payloads, suggestion placement/review/dismissal and contractual-date completion/undo. Network responses were isolated fixtures; this is not device or live-account testing.
- 13/13 disposable PostgreSQL persistence checks through the mobile dispatcher and shared handlers: account creation/manual source, rename and masking, cross-Profile guards, recurring tracking preservation, completion/idempotency/undo, invalid dates, Home totals/budget data, transfer exclusion and deletion preservation. Only Clerk verification and Next cache hooks were stubbed in the test process. Application authentication was unchanged.
- 16/16 focused schema, projection, reporting-boundary and payment-preview regression checks, included in `qa:mobile-api`.
- Full repository pre-push gate passed: dependency/security and release regressions, web/mobile type checks, iOS/Android JavaScript exports and production web build.

The temporary UI harness was removed from application source before release. No staging financial records were edited for QA.

## Reproduce isolated persistence checks

From `web/`, supply `DATABASE_URL` and `DIRECT_URL` pointing to a disposable local database whose name ends in `_qa`, then run:

```sh
NODE_ENV=production CLOVER_MOBILE_API_ENABLED=true ./node_modules/.bin/tsx --require ./scripts/native-organize-fixture-preload.cjs scripts/native-organize-fixture.ts
```

The preload refuses nonlocal databases. It is a test script, not an application authentication path.

## Distribution boundary

A Vercel staging deployment publishes the web/backend changes. Native source changes and iOS/Android JavaScript exports require a new native app build or a separately configured OTA distribution to reach installed apps. This task does not publish TestFlight or Google Play releases and does not claim physical-device QA.
