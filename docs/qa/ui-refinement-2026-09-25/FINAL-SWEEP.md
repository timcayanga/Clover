# Populated-state parity sweep — September 25

Scope: close the previous mobile-web verification gaps for Bill/Group details and investment portfolio/history controls, then compare the installed local iOS and Android previews. No Expo cloud builds.

## Fixtures and safety

- Web used the existing staging profile `QA Transactions 20260908`, separate from Personal.
- Created synthetic `QA Sweep Guest 20260925`, `QA Parity Sweep Group 20260925`, `QA Parity Sweep Dinner 20260925` (PHP 560, equal PHP 280 shares), and `QA Sweep Bond 20260925` (PHP 100 current value, PHP 90 principal, September 1 start date).
- Native used the existing disposable QA sign-in and its `QA groceries`, `QA Parity Circle`, `QA Balanced Fund`, and `QA Refinement Bond 20260925` fixtures.
- No real financial records were edited. No payment requests, settlements, bank syncs or external messages were submitted.

## Findings fixed

1. Mobile Add Person and Add Group forms were clipped inside a zero-height overlay. Moved both forms into body portals and reused the shared dismissible sheet handle and viewport overlay/card rules, avoiding the header backdrop as a containing block.
2. Mobile Bill/Group detail headers rendered underneath the page header. Raised the detail dialog above page chrome, retained sticky Back/Adviser controls, and reserved bottom-navigation space.
3. Web group cards opened only from the View Group button. Added a card click handler while retaining the keyboard-accessible View Group button; its handler stops propagation to prevent duplicate opens.

4. At 360px, Bill Details had a nested horizontal scrollbar and a collapsed line-item table. Constrained the detail grid/fields and sized grid rows to their content; the allocation table retains its own horizontal scrolling.

These restore the already approved shared design; no new Figma layout was introduced.

## Exercised

- Web 390px: bill create and detail, PHP 560 total, two PHP 280 shares; group Overview with its bill allocation, participant balances and next action.
- Web investments: populated portfolio row, asset details, MAX and 1M recorded-value chart, allocation pies, investment picker. A single remaining selection is intentionally retained. Picker and range both measured 36px high on the same row (y=403.97).
- iOS: populated bill details and group card navigation; Back/Adviser and bottom navigation; populated two-holding investment overview/portfolio, MAX to 1M, deselect/reselect one holding, portfolio icons and premium tab color. Home has one converted Income/Expense pair and no month/year in My Balance.
- Android: populated bill details; header bounds remain y=81–213 after scrolling content; full group-card tap opens named detail; populated two-holding overview and portfolio; range changes to 1M and selection changes from two to one then restores to two; Home/Adviser assets visually correct.
- Native group fixture is empty: named header/card behavior was exercised there; populated group allocation/balances were exercised on web.

## Release verification

- Full required pre-push gate passed: TypeScript, web/native regressions, offline checks, local iOS/Android exports, and production web build.
- Preserved concurrent staging changes by merging them; no force push or gate bypass.
- Staging commit `3344575b2539da4a3ff6b7ce7329f9ddb283b5e1`; Vercel `dpl_HBBzRCanuK4juDvdjY748WS3mJFk` READY and aliased to https://staging.clover.ph.
- Final live 360px check: group title/body tap opens the populated detail. Add Group opens a visible sheet and dismisses. Add Person card clientWidth and scrollWidth both 360px, height 202.71px, save button visible above navigation.
- Bill detail body clientWidth and scrollWidth both 309px; line-item table height 243px with its own horizontal scroll. Header remains at y=0 after content scrollTop=800.
- Temporary viewport reset and active web profile restored to Personal. Synthetic QA fixtures retained in the separate QA profile for repeat checks.
- This is a targeted closeout of the prior verification gaps, not a claim that every native and desktop secondary feature is identical. Native group fixtures were empty; populated allocations were checked on web.
