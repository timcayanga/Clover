# Google Play October 29, 2026 policy assessment

Reviewed November 5, 2026 against the staging source and the signed-in Play Console.
This is a source and configuration assessment, not a claim that a future APK or
Google's account declarations have already been approved. No new binaries were requested.

## Changes implemented

- Receipt currency suggestions request only `ACCESS_COARSE_LOCATION` on Android,
  through PermissionsAndroid. Expo's convenience method requests fine and coarse
  together, so Android does not call it. iOS retains its foreground consent flow.
- Explicit manifest-merge removal markers block fine/background/service location,
  contacts read/write/manage, local network, all-files access, broad media/read
  storage, SMS and call-log permissions. Camera, microphone and approximate location
  remain available only for the existing user-triggered features.
- WRITE_EXTERNAL_STORAGE is capped at API 28. expo-image-picker's external camera
  requires it on Android 8–9; its own SDK manifest otherwise declares maxSdk 32.
  API 29+ uses the camera without it; library/document selection uses system pickers.
- Location is not requested while the app is in the background, and results are
  discarded if the app has left the foreground. Invalid/future/stale/mocked fixes
  are discarded. Only country/time/accuracy leave the helper, never coordinates.
  Existing denial, four-second acquisition bound, border uncertainty rejection,
  printed-currency priority and user-default fallback remain unchanged.
- Enabled `android.r8.optimizedResourceShrinking=true` and full R8 mode in the
  prebuild plugin. Release minification, resource shrinking, optimized ProGuard
  defaults and bounded Clerk photo decoding were already present.
- Added actual Expo introspection checks to `check:android-release`, which is
  part of `qa:mobile` and the required local/CI pre-push gate. Checks verify removal
  markers, approximate location availability, the legacy-camera cap and all four
  optimization properties after plugins run. Receipt tests cover both OS paths.

## Applicability and remaining release/account checks

| Policy | Clover assessment / action |
| --- | --- |
| Minimum-scope location, Jan 27, 2027 | Country-only currency personalization can use coarse location; no technical justification for precise permission. Changes remove it from the next Android build. Google's detailed guide requires the Android 17 location button for transactional **precise** access. Clover's pinned React Native template currently targets API 36 and now uses coarse only. Reassess on an API 37/feature upgrade; do not add precise permission just to use a button. |
| Contacts, Jan 27, 2027; Manage Contacts, Aug 25, 2027 | No device address-book feature found. Circle/Split Bill people are Clover app records/manual entries, not OS contacts. Broad contacts blocked. If adding phone contacts later, use the system picker/intents. |
| Local network, Aug 25, 2027 | No LAN discovery/core local-network feature. Blocked. Internet access to Clover's HTTPS API is unaffected. |
| All-files / photo access | System document/photo pickers, not all-files access or broad library scanning. Preserve old camera compatibility only through API 28. |
| Accessibility / SMS / call logs | No accessibility service or SMS/call-log verification feature found. Auth is handled by Clerk. Relevant broad permissions blocked. |
| AppFunctions, Apr 14, 2027 | No AppFunctions integration. Ask Clover is an in-app chat, not Android AppFunctions. Reassess if integrating OS agents. |
| AI purchases | Native Plan uses RevenueCat/Google Play, with explicit user selection and store confirmation. Ask Clover's inspected financial/planning tool routing has no purchase/trade/checkout execution tool. Continue routing any future AI upgrade action to the native Plan/store flow, never an external digital checkout. |
| Ongoing eligibility discounts, Jan 27, 2027 | No ongoing student/eligibility subscription tier. Switch to Clover is a reviewed one-time 30-day Plus grant, with no card/automatic renewal, not an eligibility-priced recurring subscription. New signups start Free. Keep those distinctions and existing campaign disclosures. |
| Hong Kong cryptocurrency licensing | Clover records investments; no exchange, custody, token sales or trade execution found in the reviewed app. Do not declare a trading license merely because users can track crypto. Reassess before adding trading or wallet custody. |
| Families / Age Signals / XR / car games | No child-directed/ads/XR/car-game feature found. Age Signals availability alone does not mean every finance app must integrate it. Reassess audience/regions if adding age-dependent features. |
| Trader declaration, Feb 1, 2027 | Account-level Manage account → Account details → About you, then app-level App content. Clover is operated as a business with paid subscriptions; trader classification should reflect that. Verified the account was already a trader. Saved the app confirmation with https://clover.ph/terms-of-service and submitted the single Trader status change for Google review; Publishing overview showed Changes in review with quick checks running. No binary or other metadata was submitted. |
| Japan payment authorization, Dec 1, 2026 announcement deadline | If selling subscriptions into Japan, complete the Payments Center/Play invitation. Includes collection authorization and possibly organization/representative/legal-history disclosures. Verify Japan distribution and invitation. Do not guess answers or accept legal authorization automatically. |
| Memory/DEX quality, Feb 2027 | Play's build 54 warning says optimized resource shrinking is off and recommends AGP 9+. Enable the supported AGP 8.12 option now; defer AGP major migration to an Expo/RN-compatible upgrade. Actual DEX optimization/obfuscation/shrinking must each meet 25% if app DEX exceeds 10 MB. Recheck uploaded release's App Bundle Explorer metrics and Android vitals; source flags alone cannot prove percentages or memory compliance. |
| Zero-tap sign-in restoration, Apr 2027 | The linked quality page adds a separate requirement. Clover's secure local session persistence is **not** device-transfer credential restoration. Plan a Clerk-compatible Android Restore Credentials integration (server challenge, verified restore exchange, revoke on explicit sign-out/account deletion, new-device tests), or a genuinely applicable approved exemption. Not implemented here; do not enable financial-data or token backup as a shortcut. |

## Console observations

Monitor and improve displayed “No policy issues found.” Build
“Clover 1.1.1 (54) - Ask Clover on every page” had an R8 recommendation:
“Optimized resource shrinking isn't enabled” and “Upgrade your Android Gradle
plugin to version 9.0 or higher.” Vitals metrics shown on that overview had
insufficient data. App content initially showed one incomplete declaration: app-level trader status. The existing account trader classification was confirmed for Clover, the public Terms of Service URL (HTTP 200, applies to Android/iOS/web) was added, and that one metadata change was submitted for review. These observations do not establish compliance with future deadlines.

## Release checklist

1. Run `npm run qa:prepush`; no failed gate may be bypassed.
2. At the next authorized Android binary build, inspect the **merged release**
   manifest/AAB, not just Expo config. Confirm removal markers have eliminated
   precise/background/contact/LAN/all-files/media permissions and legacy write
   permission is maxSdk 28. Test camera/library/document picker on old and current
   Android, plus approximate-location grant/denial/location-off behavior.
3. Exercise the optimized **release** app: sign-in, SQLCipher, receipt import,
   profile photos, navigation, Ask Clover and billing. Resource optimization can
   affect dynamically referenced resources; JS bundles alone do not prove safety.
4. Compare release DEX and memory metrics with the actual Play thresholds; retain
   mapping.txt for deobfuscation. Do not report those metrics as passed before upload.
5. Review Data safety against the shipped build: optional approximate country
   capture, receipt processing, account data and SDK collection. Do not remove
   declarations for an older active build just because future source was narrowed.
6. Verify the submitted trader declaration is approved; complete any applicable Japan account authorization separately; track the
   Restore Credentials requirement before April 2027.

## Primary sources

- https://support.google.com/googleplay/android-developer/answer/18100766
- https://support.google.com/googleplay/android-developer/answer/16909972
- https://support.google.com/googleplay/android-developer/answer/17033915
- https://support.google.com/googleplay/android-developer/answer/18204939
- https://support.google.com/googleplay/android-developer/answer/10281818
- https://support.google.com/googleplay/android-developer/answer/17492799
- https://support.google.com/googleplay/android-developer/answer/17594752
- https://support.google.com/paymentscenter/answer/17595997
- https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
