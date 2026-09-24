# Clover iOS and Android store setup

Updated September 24, 2026. Setup status below is based on the user's confirmations; live purchase tests are still pending.

## Apps and build environments

- Expo: `@clover-innovations/clover-mobile`, project `742a3fe2-1cb2-4d71-8ed7-bc7e2e89b0ff`; username `cloverph`.
- Apple and Google app identifiers: `ph.clover.app`. App: **Clover: Personal Finance**, organization **Clover Innovations OPC**.
- Apple Team ID `6XX38GYURG`; App Store Connect app ID `6811711508`. TestFlight access works.
- Google organization developer account and internal-testing setup exist.
- `mobile/eas.json` profile `store-test` uses EAS Preview, staging API, registered store identifiers and `clover` scheme. These builds must not be promoted to public production.
- No replacement signed build is created by this integration change. Compile/bundle checks do not test store purchases.

## Configured RevenueCat catalog

The user uses one RevenueCat **Clover** project with Apple, Google, Paddle Sandbox and Paddle Live apps. Native verification accepts only Apple/Google subscriptions whose sandbox flag matches Clover's deployment and whose owner matches the signed-in Clerk ID. Paddle billing remains handled separately.

| Tier | Entitlement | Custom package | Apple product | Google product/base plan |
|---|---|---|---|---|
| Pro | `clover_pro` | `pro_monthly` | `clover.pro.monthly` | `clover.pro:monthly` |
| Pro | `clover_pro` | `pro_annual` | `clover.pro.annual` | `clover.pro:annual` |
| Plus | `clover_plus` | `plus_monthly` | `clover.plus.monthly` | `clover.plus:monthly` |
| Plus | `clover_plus` | `plus_annual` | `clover.plus.annual` | `clover.plus:annual` |

All four packages belong to **`clover_membership`**. The app selects that offering explicitly. Keep the old `default` Test Store offering unchanged; it cannot grant native access. Shared catalog: `shared/store-catalog.ts`. The persisted tier `pro` means Plus; `premium` means current Pro. Verified native product IDs determine this mapping without a data migration.

Plus has eight attached products across Apple, Google and the two Paddle apps. Pro has ten including two legacy Test Store products. Product membership alone never grants access: Clover verifies entitlement, exact product, store, environment, ownership and expiry. Restore behavior: **Keep with original App User ID**.

## Provider setup status

- Apple: Clover Membership subscription group with Pro at level 1 and Plus at level 2; four products imported into RevenueCat. Review screenshots/remaining metadata and submission are pending. App Store Connect and In-App Purchase credentials were entered privately.
- Apple production and sandbox server-notification URLs point to RevenueCat. Notification version and receipt remain unverified.
- Google: Plus and Pro monthly/annual base plans created. Activation has not yet been confirmed. Credentials validated in RevenueCat.
- Google RTDN topic `projects/clover-493710/topics/Play-Store-Notifications` connected; user confirmed a test notification received by RevenueCat.
- Regional store pricing configured: Plus US$7.99/month or US$59.99/year, Philippines ₱169/month or ₱1,259/year; Pro US$12.99/month or US$99.99/year, Philippines ₱349/month or ₱2,999/year. Store checkout supplies final localized prices.

## Secrets and webhooks

Vercel Preview, scoped to staging:

```
CLOVER_NATIVE_PURCHASES_ENABLED=false
REVENUECAT_SECRET_API_KEY=<RevenueCat V1 server secret>
REVENUECAT_WEBHOOK_SECRET=<shared random secret, without Bearer prefix>
```

The catalog is explicit in code. Old `REVENUECAT_ENTITLEMENT_ID` and `CLOVER_STORE_PRODUCT_IDS` values no longer determine tier mappings.

Two RevenueCat webhooks, each Sandbox only / All events:

- iOS app: `https://staging.clover.ph/api/billing/revenuecat/webhook?source=ios`
- Android app: `https://staging.clover.ph/api/billing/revenuecat/webhook?source=android`

Both use `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`. The source query differentiates dashboard URLs; it does not authorize a request. Authenticated TEST events work while purchases are disabled. Real events return 503 while disabled so they cannot silently disappear. Once enabled, the server refetches current customer state; webhook claims and SDK CustomerInfo cannot grant access directly. Store access stays separate from web billing and Admin grants, with snapshot ordering protection.

EAS Preview public keys added by user:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=<appl_...>
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<goog_...>
```

The Clerk publishable key and API URL must match staging. Never place private API keys, P8 files or service-account JSON in the native bundle or repository.

## Remaining before purchase tests and production

1. Redeploy staging with new secret variables and integration code, then send RevenueCat TEST events from both webhooks and verify HTTP 200.
2. Confirm Google base-plan activation, Apple product metadata and required store agreements. Capture real native paywall screenshots for Apple review.
3. Enable native purchases in staging only when ready for controlled sandbox testing, then create/install fresh store-test builds with the Preview public keys.
4. Test each of four packages on both platforms: localized price/period, purchase, cancel, pending approval, restore, expiry, refund, renewal, grace, network interruption and restart.
5. Check correct Plus/Pro limits, account switching, ownership protection, sandbox isolation, webhook retries, and independent web subscription/Admin-grant preservation. Existing paid users use provider management; this change does not introduce a cross-provider upgrade checkout.
6. Configure and validate production separately after sandbox tests pass. Production sales remain disabled.

Automated coverage: `npm --prefix web run qa:store-tiers` (included in the required pre-push gate); isolated DB persistence fixture: `web/scripts/store-access-fixture.ts`. Neither substitutes for installed store purchase tests.

References: [RevenueCat Android products](https://www.revenuecat.com/docs/getting-started/entitlements/android-products), [customer API](https://www.revenuecat.com/docs/api-v1/customers), [webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior).
