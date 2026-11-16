# Transactions Figma implementation — 2026-09-12

Design reference: Screens / 01 — Organize, file `FNnCmCj90szZAnZ6twMPCy`.

Inspected main desktop/mobile screens `50:505`, `50:723`; Add `52:413`; Quick Add panel `478:3220`; selection `403:1822`, `403:2103`; detail `52:290`; inline edit `403:1434`; filters `429:2077`, `429:2710`; review `403:2210`; and search/empty/error variants in `403:2592`. The design-context connector reached its quota after four successful screen responses. Remaining labels and layout properties were read through the read-only Figma document API.

## Changes

- Amount-first entry, currency code pill, compact relation/date rows, optional details and primary action hierarchy, using existing Clover components and exported icons.
- Manual / Ask Clover / Upload tabs on desktop Add and shared Quick Add, with draft preservation between tabs. Global desktop Quick Add starts on Manual. Mobile keeps its existing creation route and bottom navigation.
- Persistent mobile search, category-led rows with dates and signed amounts, review indicators, removable filter chips and a visible selection count with Edit, Tags, Delete and Clear.
- Reordered expandable filter rows, presets, Reset, review status, source and extraction-confidence filters. Extra filters are carried through API queries, local matching, pagination, cache keys, export, reload/Profile context and import-completion reset. Source means whether a transaction has a linked import file; extraction confidence uses the stored parser score (high >=85, medium 65–84, low <65), separate from the combined confidence shown in details.
- Explicit Save/Cancel inline editors with saving/error feedback. Leaving an inline field no longer commits a change.
- Distinct no-results and empty-history guidance, retaining retry/skeleton behavior and existing add/upload paths. Detail drawer width and row spacing follow the inspected design.

No schema migration or production financial-data mutation is included. Existing detail, receipt, review and transfer business rules remain in place; edits in QA used only synthetic local records.

## Verification

45 focused checks passed against the real components and APIs with isolated local PostgreSQL/Redis fixtures:

- 9 API checks: all, pending, confirmed, manual, imported, high/medium/low confidence and combined filters.
- 21 desktop/mobile browser checks: list/search layout, no-results recovery, review filter persistence, reset, selection/delete cancellation, amount-first entry, types/destination, optional receipt mismatch, tab draft preservation, canceled-draft reset and inline cancellation.
- 7 state/save checks: empty history, loading and error/retry on both viewport sizes, plus a successful persisted manual save.
- 4 inline/Quick Add checks: explicit inline save, tab preservation, focus trapping and focus restoration.
- 4 final visual checks: mobile name/metadata width, Add action reachability above navigation, mobile detail page, desktop detail/source context. Visual review found and corrected inherited mobile grid styles that squeezed the transaction name and relation fields.

Desktop and mobile web were exercised at 1440px and 390px. Native iOS/Android runtime testing and live AI generation were not performed. AI tab rendering and draft preservation were checked without submitting a model request. Temporary local QA routes are removed before the release build.

Targeted TypeScript and existing manual-entry/filter regressions passed. The full `npm run qa:prepush` gate passed, including web release regressions, mobile TypeScript/API/dependency checks, iOS/Android Expo bundle exports, and the Next.js production build. The repository pre-push hook repeats this gate before staging publication. Existing source-based checks were updated for the new mobile toolbar placement and added filter variables.
