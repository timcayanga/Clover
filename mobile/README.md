# Clover mobile · first native preview

React Native + Expo SDK 57, with one app implementation for iOS and Android.
This is **not a WebView wrapper** and does not replace the existing Next.js site.
It is an early vertical slice, not a store-ready or feature-complete release.

## What works in this source build

- Native Home, Transactions, Add, Account, and full-page transaction detail screens.
- Search and paginated transaction lists; names, descriptions, and tags can be edited.
- Explicit sample mode with fictional data. Sample edits stay in memory and never call the API.
- Clerk hosted sign-in integration and encrypted native session-token storage.
- Explicit Profile selection and account-level Free/Pro status from the shared backend.
- Native document picker, photo library, and receipt camera; per-file confirmation before upload.
- Existing Clover import processing, visible-completion status, and saved-import recovery.
- Safe areas, keyboard-aware forms, scalable text, screen-reader labels, pull-to-refresh, and a background privacy cover.

The Adviser tab is explicitly marked unfinished. Accounts, Recurring, Reports,
Investments, Budgets, Goals, Circles, Split Bills, native onboarding, full financial
field editing, and final import confirmation are not implemented natively yet.
Use the regular website for those workflows. Nothing here grants free Pro or
pretends a payment succeeded.

## Preview now (no store memberships needed)

From the repository root:

```sh
npm ci --prefix mobile
npm --prefix mobile run web
```

Choose **Explore sample Clover**. This browser rendering is a convenient layout
and interaction preview, **not an iOS/Android emulator or native runtime test**.

For a lower-memory preview without a live Metro bundler, run
`npm --prefix mobile run build:preview`, then
`npm --prefix mobile run serve:preview` and open `http://127.0.0.1:8127`.

For a phone with a compatible Expo Go client:

```sh
npm --prefix mobile run start -- --go
```

Scan its QR code. Start in sample mode. For configured account authentication and
release-like behavior, use development builds and verify the callback on both OSes.
Expo Go compatibility has not been tested on a physical phone in this task.

## Build and validate

```sh
npm run qa:mobile
npm --prefix mobile run build:preview
npm --prefix mobile run check:toolchains
```

`qa:mobile` checks TypeScript, Expo dependency compatibility, the server API
boundary regression, and exports **both** native JavaScript/Hermes bundles to
`mobile/dist/native`. These bundles are not `.ipa` or `.apk` installers.

Generate native project files without installing native dependencies:

```sh
cd mobile
npx expo prebuild --no-install
```

Expo's generated `ios/` and `android/` directories stay ignored; app configuration
and plugins are the reproducible source. Do not hand-edit generated projects.

After installing the toolchains:

```sh
npm run build:ios
npm run build:android
```

Requirements for this version:

- iOS: full Xcode 26.4+, an iOS Simulator runtime, CocoaPods 1.15.2+.
  Clerk's native dependency raises this app's minimum iOS target to **17.0**.
- Android: Android Studio or equivalent SDK tooling, JDK 17+, SDK platform 36,
  platform-tools, and an emulator system image. Set `ANDROID_HOME`.
- This Mac currently lacks those full toolchains. Native project generation and
  bundle export are verified; native compilation, camera/picker behavior, and
  installed-app testing are **not yet verified**.
- Run one emulator at a time on this 8 GB Mac. Keep Metro at two workers if needed.
- `npm run doctor` checks source dependencies and, once native directories exist,
  local toolchains too; it will flag the missing CocoaPods installation on this Mac.

## Connect an existing staging account

1. Put public settings from `.env.example` in a git-ignored `.env.local`.
2. Use the publishable key from the **same Clerk instance** as staging. No Clerk
   secret, database credential, payment key, or financial export belongs in mobile.
3. In Clerk, deliberately enable Native API and register the preview application
   and hosted-auth callback as described in Clerk's Expo documentation. This
   changes the authentication surface and has not been automatically enabled.
4. After authenticated integration testing, set server-only
   `CLOVER_MOBILE_API_ENABLED=true` on staging. It defaults off everywhere.
5. Sign in with an existing non-Admin test account. Complete website onboarding
   first; choose the intended Profile in the app.

The gateway rejects the web server's `local` fixture environment, which has
development-only automatic Pro behavior. Use the isolated staging deployment for
native account tests rather than pointing the app at a guest-enabled local server.

Preview identifiers: `ph.clover.preview` on both platforms, scheme
`clover-preview`. These are development identifiers, not reserved store listings.
Native Apple Sign In entitlements are disabled before developer enrollment;
hosted authentication uses the methods configured in Clerk. Configure and test
the required production sign-in methods before store submission.

## API and security boundary

`/api/mobile/v1/...` requires a verified Clerk **session JWT** in `Authorization:
Bearer ...`. Browser cookies, staging guest access, remembered sessions, user-ID
headers, and local-admin fallbacks never authenticate the mobile API.

The allowlisted API dispatches existing Clover handlers within a verified,
request-local principal. Workspace ownership is checked before dispatch; an edit
or import ID must match the explicitly selected workspace. Browser CSRF behavior
is unchanged. Native origin exemption only applies to the exact authenticated
Request, not arbitrary requests made in the same server process.

Responses are private/no-store and omit raw statement payloads, storage keys,
grant audit reasons, and unnecessary internal fields. Financial lists remain in
memory, not persistent unencrypted device storage. Sign-out/account changes
unmount the session and clear its financial cache. Profile changes reset tabs.
Token storage uses Clerk's SecureStore integration.

Only user-selected files are held in session memory; file URIs are not accepted
from deep links. App-cache copies are cleaned after upload or session teardown.
This is not a guarantee against every OS screenshot/app-switcher capture; verify
native privacy behavior on devices before release.

### Upload limits and recovery

This first native transport accepts one file up to **3.5 MB**, below the hosting
request-body ceiling. Larger files still use Clover's existing website. Expand
to direct-to-storage native upload before general launch.

Each selected upload gets a stable import ID. Network timeouts never automatically
resend the file; poll or resume the saved import first. Recent imports are reloaded
from Clover so an app restart does not require re-uploading. Passwords are not
stored persistently. Native background file transfer and full offline editing are
not implemented. A password error may require returning to the website in this preview.

## Pro and future RevenueCat integration

The backend's existing `getProAccess` determines native access, including paid
subscriptions, cancellation periods, Admin overrides, and complimentary grants.
Mobile cannot set its own entitlement. Native paid purchases are **disabled**;
there is no Paddle/PayMongo checkout inside the app.

When RevenueCat is ready, add an SDK adapter keyed to the same Clerk user ID and
verified webhooks feeding a multi-provider backend subscription ledger. The
backend must handle idempotent events, refunds, revocations, renewals, restore
purchases, and overlapping grants before enabling sales. RevenueCat is not needed
to develop or run this preview and has not been configured here.

## Release checklist (not completed)

- Full native feature parity and no unfinished primary tabs.
- Staging sign-in, MFA/SSO, token expiration, logout, Profile isolation, and API tests.
- Real iOS/Android import, background/resume, password and failure-path tests.
- VoiceOver/TalkBack, large font sizes, landscape/tablet, keyboard and back gestures.
- Push notifications, account deletion, production privacy/data-safety disclosures.
- Final store identifiers, signing credentials, icons/splash, screenshots, review notes.
- RevenueCat/store products, purchase/restore/refund tests and cross-device access.
- Review dependency advisories. Current audit reports moderate transitive Expo/Clerk
  advisories, no high/critical findings; do not blindly force incompatible upgrades.

See `docs/mobile-app-architecture.md` at the repository root for the rollout plan.
