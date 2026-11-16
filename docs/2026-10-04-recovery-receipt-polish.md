# Purchase recovery, receipt currency and mobile polish

## Behavior

- RevenueCat may preserve an anonymous original identity after a deleted-account transfer. Clover accepts that identity only after a completed recovery audit for the current deployment and fresh RevenueCat transaction-owner checks for every returned subscription. Another active Clover account is never accepted as an alias.
- Native Restore allows anonymous historical identities to reach server verification. Checkout requires a fresh, authenticated server verification of the exact alias. Recovery displays progress and an explicit result, and billing requests allow enough time for provider verification.
- A missing receipt currency is suggested from unambiguous printed location evidence before falling back to the user's default currency. Explicit currencies and raw evidence are preserved. Suggestions remain editable and reviewable.
- Local device processing remains excluded from Clover token usage. Native percentage meters cap at 100%; the usage explanation distinguishes cloud use from on-device processing. Raw metering is unchanged.
- Settings resets its scroll position when changing sections and disables overscroll. Billing cleanup failure no longer reports logout failure after successful authentication sign-out.
- Opening scenes use Maya and GStocks, a Philippine flag and a six-bank grid, and a spending donut. Figma exports remain the source for native scene images.
- Desktop Ask Clover header icons are 40px. Add selectors use a versioned mascot asset URL to avoid stale cached artwork.

## Validation

Targeted regression coverage includes transferred anonymous identities, mismatched identities, absent/incomplete recovery audits, native checkout preflight, restore, cancellation, default and location currency, conflicting locations, explicit currency preservation, and percentage display boundaries. The complete pre-push quality gate and signed binary checks must pass before release.

Physical-device confirmation remains required for StoreKit recovery prompts and Settings gesture behavior. Tests never modify confirmed financial records.
