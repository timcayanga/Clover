# Pro Planner parity pass — 20 September 2026

## Changes

- Web and native use shared product presets and comparison data. All scenarios plot on one scale, with lines ending at their chosen terms.
- Mobile web fields stack; milestone amounts wrap rather than truncate; chart time labels render at 12 CSS pixels instead of shrinking with the SVG.
- Native adds product selection, editable scenario names, terms, compounding, taxes, fees, liquidity, minimum holding, early exit penalty, reinvestment, add/remove/select scenarios, comparisons and an editable Adviser draft.
- Native scenarios use the existing encrypted, per-user offline store with profile/currency keys. Demo mode remains session-only. No portfolio or transaction records are written.
- Early exit penalties are explicitly separate from maturity projections and included in the Adviser prompt with the other assumptions.
- Eight Figma Planner source frames (desktop/mobile, collapsed/expanded, light/dark) receive scenario name/product fields, primary Ask Clover buttons and mobile-height reflow. Existing 3%/4%/5% illustrations remain example scenarios, not current offers.

## Verification

- Shared growth regression: tax, simple/compound growth, mixed-term chart endpoints, shared value scale, declining returns, empty data.
- iPhone 17 Pro / iOS 26.5 development client: sample Planner opens, expanded assumptions visible, scenario comparisons render, bottom navigation persists; Ask Clover populates a draft without sending.
- Live authenticated native persistence is not covered by sample-mode verification.
- Full pre-push suite and staging/browser/emulator checks: results recorded after completion below.

- Full `npm run qa:prepush` passed, including type checks, release regressions, native bundle exports, and optimized Next.js build. Existing CSS autoprefixer warnings remain unrelated to Planner.
- Android runtime verification is pending: two API 35 AVDs stalled during boot; Android's system process reported stack-trace deadlines exceeded. Reclaimed approximately 4.5 GB of rebuildable caches after the initial disk-space failure. Do not treat bundle success as Android device verification.
- Web empty-portfolio Planner currency now falls back to the user's default currency, including its Adviser draft.
