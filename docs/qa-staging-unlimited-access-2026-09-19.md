# Staging speed-QA access override

Authorized by the user on September 19, 2026: restore the dedicated QA account to Pro and remove usage limits for testing.

Identity: `user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z` (`clover.qa.20260914a+clerk_test@example.com`). The server override requires all three deployment markers: Vercel preview, Clover staging environment, and the staging Git branch. Other users, production and other branches retain their normal entitlements.

Entitlement refresh returns Pro and keeps the existing user plan projection current. Billing subscriptions, payments and grants are not edited. The entitlement response names its source `staging QA override`. Existing unlimited-plan logic removes account/Profile caps and monthly/rolling cloud-token limits while retaining usage logs. This does not raise Admin privileges or alter file-validation and request-security controls.

Remove the exact fixture entry in `web/lib/user-limits.ts` when testing ends; the next entitlement refresh resumes ordinary billing/grant-derived access. The isolation regression is included in `qa:auth-access` and the pre-push gate.

On September 20, 2026, the owner also authorized Pro for `timcayanga@gmail.com` on staging so the existing browser session can verify Planner. `hasStagingProAccess` applies the same three deployment guards to this exact email. This additional account receives ordinary Pro entitlements, not the dedicated fixture's unlimited usage. No billing subscription or Admin role is created. Remove the email entry to resume normal entitlement calculation for this account.
