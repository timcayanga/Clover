# Onboarding upload navigation and Google billing — 2 October 2026

## Fixes

Onboarding previously replaced its route with the transparent Add modal. It could become the root screen, leaving Back without a usable destination and subsequent navigation under modal presentation. The first upload now replaces onboarding with the full-screen Add tab, preselects Upload, and invokes the chosen picker. Back returns to Home. Ordinary Add-button entry retains its sheet and has a Home fallback if no previous route exists. The tab's automatic header is suppressed in favor of the existing Upload header.

RevenueCat's v1 Google response can provide the subscription ID and product_plan_identifier separately, while Clover's SDK catalog uses subscription:basePlan. The server verifier now normalizes those verified fields before exact catalog matching. Unknown, missing, and inconsistent base plans fail closed. Ownership, timestamp, sandbox allowlist, refund, expiry, and tier safeguards remain enforced. Neither SDK assertions nor webhook payloads directly grant access.

Primary implementation reference: https://github.com/RevenueCat/purchases-android/blob/main/purchases/src/main/kotlin/com/revenuecat/purchases/common/CustomerInfoFactory.kt (parseDates); fixture: purchases/src/test/java/com/revenuecat/purchases/utils/Responses.kt.

## Validation

- Native component tests cover all three picker sources, cancellation, permission denial, one-time invocation, upload registration/import routing, Back to Home, and ordinary-sheet fallback.
- Store-tier regression covers split Google IDs for Plus/Pro monthly/yearly, missing/conflicting/unknown base plans, exact sandbox testers, refunds and expiry.
- Isolated PostgreSQL fixture confirms server sync persists canonical Google IDs and updates shared Plus access. No production subscriptions or financial records were changed.
- Google Play test receipts confirm completed Plus and Pro purchases and renewals today. RevenueCat ties them to a different Clover login from the previously allowed tester. That new login is not in the production sandbox tester allowlist.
- A read-only replay of the actual RevenueCat response reproduces denied access without the tester allowance and verifies Pro with the patched product normalization plus the exact tester allowance. No production entitlement was manually granted. The user confirmed the additional test login. Its exact production Clerk ID was added to REVENUECAT_SANDBOX_APP_USER_IDS, preserving the existing tester. A fresh Vercel environment pull verified both entries. This setting takes effect on the next production deployment; the product-normalization fix must also be deployed.
- The complete `npm run qa:prepush` now passes, including the dependency security gate, web/mobile typechecks, release regressions, both native bundle exports, and optimized web build. This followed a clean mobile dependency installation and the verified security backport documented below.

## Dependency blocker resolved locally

The initial required `qa:prepush` failed on GHSA-86w9-cpqp-85rv (node-forge <=1.4.0), introduced through Expo's CLI/code-signing dependencies. npm latest is still 1.4.0 as checked on 2 October 2026. A hash-pinned backport of the proposed upstream verifier fix now rejects malformed nested DigestAlgorithm elements. The mobile gate verifies the installed patch and security regressions before accounting for this exact advisory; all other high/critical advisories remain blocking. The mitigation must be reviewed before 1 November 2026 UTC. See [security backport evidence](node-forge-security-backport-2026-10-02.md).

These checks do not replace device verification of the new onboarding navigation or an active Google Play sandbox purchase after the server fix is promoted to production.

https://github.com/advisories/GHSA-86w9-cpqp-85rv
