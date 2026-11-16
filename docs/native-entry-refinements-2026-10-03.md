# Entry, balances, and Ask Clover refinements

Design source: [Screens / release refinements](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1986-112391). The approved six-pose mascot is documented in `assets/mascots/README.md`.

## Navigation and onboarding

- Native onboarding adopts the starter Profile returned by the authenticated server. While it is being created, show the Home shell instead of a second Profile setup form. Keep failed setup retryable and do not invent a local Profile ID.
- Native tab and detail navigation share a 72px glass capsule with a centered add control and circular Account avatar. Safe-area padding sits outside that capsule. Route transitions must not animate a glass ancestor through zero opacity.
- Ask Clover replaces the user-facing Adviser name. Internal routes, API names, consent gates, plan access, and stored identifiers remain compatible.
- Reuse the approved transparent mascot for Ask Clover and empty collections. Decorative artwork has no duplicate screen-reader label.

## Manual and suggested entry

- Restore category suggestions while typing, using existing classification/learning rules. Never replace a category the user selected manually or rewrite a confirmed transaction.
- A new manual account with an empty opening amount starts at zero. Existing unknown balances from imported evidence remain unknown.
- Cash has no overdraft: reduce its derived available balance to zero when an expense exceeds the available amount. Preserve the full transaction amount and raw evidence. Later cash income increases the available balance without paying down a hidden negative balance.
- Ask Clover may propose a missing payment account alongside a transaction. Show the proposed account, type, currency and starting balance in review. Ask which account when matches are ambiguous; ask the account type for an unrecognized institution. Persist only when the user confirms, with the existing atomic save, ownership and plan-limit checks.
- Speech recognition belongs to the visible input. Use a supported language and provide permission/retry guidance; never send or save a transcript automatically.

## Investments

- New investment entry uses Purchase Value. Ticker Name and Quantity live under More Details. Use type-specific names such as Stock Name and Fund Name; display investment types in Proper Case.
- Purchase Value maps to the existing cost-basis field; do not delete prior cost data.
- Suggest tickers only from a reliable exact security match. Ambiguous share classes require selection. Unknown names can use a manually supplied ticker.
- Estimated current value uses a recent, verified matching-currency quote multiplied by quantity. Do not relabel a quote with the user's selected currency. When no suitable quote is available, preserve the recorded value. Live valuation is a read-only display and never overwrites confirmed account records.

## Release verification

Run the complete pre-push gate plus focused cash, account entry, onboarding, category, speech and investment regressions. Verify staging before rebuilding the tested commit with production configuration. Native UI, navigation and speech-provider configuration require new iOS/Android binaries before existing installed apps can show those changes; a Vercel deployment alone does not update them.
