# Optional upgrades during onboarding

Figma: https://www.figma.com/design/eMYZz1h88TR3Vv40WAV6Mz?node-id=2-2

After authentication, a new Free user sees Plus and Pro before financial knowledge. Plus leads with two linked bank accounts and Pro with five, using the shared plan catalog. The Free continuation is secondary, visible after the cards, and never requires payment. Existing effective paid access skips the offer. No new trial is created.

The first-action screen presents Connect a bank and Upload documents, with manual entry retained. Free users selecting bank connection see both paid offers inside onboarding; they can still upload or skip. Verified upgrades return to this screen without repeating knowledge or completing onboarding. The bank API remains responsible for enforcing current access.

Web checkout uses the existing verified regional offers, Paddle overlay and PayPal dialog. The screen never navigates to Settings or Pricing. Cancellation leaves the offer usable. Callback handlers are stable while a provider checkout is open, and PayPal dialogs close on approval/cancellation. Provider completion starts bounded server-entitlement checks; it does not grant access. Pending verification blocks another purchase but permits setup to continue. A user-scoped session draft retains the setup step, knowledge choice and pending state across reloads; it contains no payment details. Auth redirects and Circle/campaign completion destinations stay intact.

Native source uses existing RevenueCat Apple/Google products, ownership checks and server verification. Store prices and currencies come from actual product metadata. Canceled purchases return to the offer, pending payments block repeat purchase, and restore/status refresh remain available. Returning from background resumes a bounded verification check. Checkout completion releases the parent busy state before the bank action becomes available.

Plan view, selection, checkout preparation, checkout start and outcomes retain onboarding attribution and displayed currency. A completed provider callback remains distinct from verified billing outcomes and activation.

Checks include actual component lifecycle/provider callback tests, native onboarding return paths, SSR, approved regional pricing, and a real isolated database API test. Database QA verifies approval-pending versus paid, both tiers and store products, identity isolation, expiry, incomplete onboarding preservation, and exact confirmed transaction/account snapshots.

Release is web/backend plus native source only. No new IPA/AAB is created. Existing installed native apps require a future verified binary while OTA updates are disabled.

The web bank handoff enters `/accounts/new?onboarding=connect` directly. This preserves the Sync intent on both desktop and mobile; the older `/accounts?add=1` conversion dropped that intent before the account form mounted. The regression clicks through the actual Free-to-Plus first-action component and checks the creation hook at both viewport sizes.
