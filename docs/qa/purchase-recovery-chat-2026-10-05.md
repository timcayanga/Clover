# Purchase recovery, receipt warnings, and Ask Clover

## Changes

- Receipt currency inference retains its source and remains editable. Choosing the default or printed-location currency no longer reduces extraction confidence or creates a currency-only warning. Actual date, amount, merchant, category, account, and duplicate issues keep their existing checks. Historical currency-resolution flags alone no longer create a warning.
- Production sandbox verification can opt in explicitly configured QA emails through `REVENUECAT_SANDBOX_TESTER_EMAILS`. Each use checks the exact authenticated Clerk identity's verified primary email through Clerk's backend. This grants no entitlement and does not identify the purchase owner. Exact Clerk ID allowlisting remains supported. Never populate this setting from a client request or public signup.
- Purchase recovery resolves an anonymous RevenueCat subscription owner through the provider's aliases endpoint, requiring exactly one Clover identity and no further pages. Existing signed Apple proof, completed-deletion, live-account, environment, erasure, and concurrency checks remain required. Ambiguous aliases fail closed.
- A transferred subscription can retain a deleted original Clover ID. Acceptance requires the matching completed recovery audit and fresh provider ownership verification of every subscription.
- Native initial and follow-up suggestion chips submit the selected question directly, retaining in-flight and history-loading guards. Web already submitted chips directly.
- Ask Clover history uses rows, with Your Chats left and a blue + New Chat action right. Assistant messages include the guiding mascot beside Clover.

## Design

Updated the existing Ask Clover designs on the main Screens file's Understand & Plan page, including mobile/desktop history and assistant replies. Visually checked mobile history and reply/chart screenshots.

## Verification and release boundaries

Regression fixtures cover anonymous-owner recovery, no/multiple/paginated aliases, live/deleted identity guards, repeated recovery, unknown transfer outcomes, verified/unverified QA emails, wrong primary email, wrong identity, wildcard rejection, and unchanged receipt issues. Physical StoreKit authentication and a successful transfer into the user's latest account still require their Recover Purchase action after deployment. No manual paid grant or purchase is performed.

Web/API fixes can deploy without new binaries. Native Ask Clover UI changes require the next iOS/Android binaries; Expo Updates is not configured. No binary creation requested in this change.
