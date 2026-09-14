# Clover iOS and Android store setup

Expo account: `cloverph`. Organization/project owner: `clover-innovations`. Mac login verified and EAS project created: `@clover-innovations/clover-mobile`, project ID `742a3fe2-1cb2-4d71-8ed7-bc7e2e89b0ff`. Local Expo config contains this project link.

Status updated September 14, 2026: the user has created the Apple App ID and App Store Connect record, and a Google Play draft for **Clover: Personal Finance**, under **Clover Innovations OPC**. Google developer account type: **Organization**. Both app identifiers are `ph.clover.app`. Apple Team ID: `6XX38GYURG`; App Store Connect numeric app ID: `6811711508`. Subscription products remain pending. No signed build or submission is claimed by this configuration work.

`mobile/eas.json` now prepares a `store-test` profile for TestFlight and Google Play internal testing, pointing at staging. Development builds retain the preview identifier and scheme. Store-test builds use the `clover` scheme; configure matching Clerk callbacks before authentication testing.

Next: sign in to Expo/EAS and link this app to a project, configure its preview public Clerk key, set up Apple distribution signing and the Android upload keystore, and connect submission credentials privately. The first Android AAB must be uploaded manually in Play Console before automated API submissions. Then, from `mobile/`, use `eas build --profile store-test --platform ios` (or `android`) and submit the selected build with `eas submit --profile store-test --platform ios` (or `android`). Store-test is staging-only and must not be promoted to public production.

The subscription integration is prepared and sales remain disabled. Live purchase, restore, renewal and refund tests remain blocked on product/provider setup.

## Prepared integration

- Native RevenueCat adapter: authenticated Clerk ID, current offering, localized price, purchase, explicit restore and store management.
- `GET/POST /api/mobile/v1/billing/store`: authenticated status and server verification. Clients cannot submit a Pro flag, expiry or another identity.
- `/api/billing/revenuecat/webhook`: secret authorization, current-state refetch, duplicate/out-of-order protection. `StoreAccess` stays separate from web billing and Admin grants.
- Sandbox cannot grant production access. Unsupported products, expired/refunded purchases, malformed responses and ownership mismatch do not grant access.

## Create apps and products

1. Registered identifiers: `ph.clover.app` for both stores. The separate development identifier remains `ph.clover.preview`.
2. Apple app registration is complete. Configure required capabilities, complete outstanding agreements/tax/banking, and add sandbox testers.
3. Google Play draft creation is complete. Configure Play App Signing, complete outstanding app requirements, upload a signed internal-test AAB, and add license/internal testers.
4. Build with `CLOVER_IOS_BUNDLE_ID` and `CLOVER_ANDROID_PACKAGE_ID` matching the registered IDs. Update Clerk native redirects for that build. Keep staging identifiers/configuration separate.
5. Apple: create one Clover Pro subscription group with monthly and annual auto-renewing products. Proposed IDs: `clover.pro.monthly` and `clover.pro.annual` (not created).
6. Google: create Clover Pro with monthly/annual auto-renewing base plans. Record the exact product identifiers RevenueCat returns, including base-plan suffixes where applicable.
7. Configure **advertised regional pricing** in both consoles. Native uses the store's local price; it does not guess exchange-rate conversions. Complete subscription descriptions, review screenshots, availability and disclosures.

## RevenueCat and environment setup

Use separate staging/production RevenueCat projects, as prepared in Clover's existing architecture. Connect Apple/Google credentials privately in its dashboard. Never put private keys or service-account JSON in the app, repository or chat.

Import store products; create a Pro entitlement and a current offering containing monthly/annual packages. Set restore behavior to **Keep with original App User ID**. Do not enable automatic transfer between Clover accounts. Family sharing and anonymous-purchase migration need a separately tested policy.

Server environment, matching the deployment:

```
CLOVER_NATIVE_PURCHASES_ENABLED=false
REVENUECAT_SECRET_API_KEY=<server-only secret key>
REVENUECAT_WEBHOOK_SECRET=<unique random secret>
REVENUECAT_ENTITLEMENT_ID=<actual Pro entitlement identifier>
CLOVER_STORE_PRODUCT_IDS=<comma-separated exact product identifiers>
```

Native build environment, public SDK keys only:

```
EXPO_PUBLIC_API_URL=https://staging.clover.ph
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<public key from the matching Clerk instance>
EXPO_PUBLIC_REVENUECAT_IOS_KEY=<appl_... public SDK key>
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<goog_... public SDK key>
CLOVER_IOS_BUNDLE_ID=<registered bundle ID>
CLOVER_ANDROID_PACKAGE_ID=<registered package ID>
```

Webhook URL: the matching deployment's `/api/billing/revenuecat/webhook`, authorization `Bearer <REVENUECAT_WEBHOOK_SECRET>`. Configure store server notifications/Google RTDN through RevenueCat. Enable the server flag in **staging only** after verifying configuration and webhook delivery. Build a native development/TestFlight/internal-test app; Expo Go and RN-web do not prove store billing works.

## Required tests before production sales

Run on both installed platforms:

- Monthly/annual price, currency and billing interval for advertised regions.
- Purchase success, cancellation, pending approval, network interruption and restart; uncertain outcomes must not prompt another purchase.
- Same-account restore on another device; different Clover accounts cannot inherit the purchase.
- Renewal, canceled-but-paid-through access, expiry, grace, billing retry, refunds and revocation.
- Duplicate/out-of-order webhooks, provider outage and recovery.
- Overlapping web subscription and temporary Admin grant; store events cannot revoke unrelated access. Manual plan locks retain precedence.
- Logout/account switching, sandbox isolation, subscription management, account deletion disclosures and store review.

Do not enable production sales until these pass. Clover account deletion does not cancel an Apple/Google subscription; manage it through the store. This document does not create subscriptions, make purchases or deploy to production.

References checked September 13, 2026: [RevenueCat Expo](https://www.revenuecat.com/docs/getting-started/installation/expo), [customer API](https://www.revenuecat.com/docs/api-v1/customers), [webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior), [Apple server API](https://developer.apple.com/documentation/appstoreserverapi), [Google subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions).
