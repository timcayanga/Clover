# Switch to Clover pilot

This campaign is separate from referral campaigns. It starts as **draft** independently in staging and production; deploying code does not launch the offer.

## Setup

1. Deploy the tested staging commit. The standard build applies the four campaign tables through Prisma migrations.
2. Existing private R2 storage is reused: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. Keep the bucket private; receipts are served only to their owner or permitted Admin reviewers.
3. Existing email uses `ZOHO_SMTP_PASSWORD`; optional existing `ZOHO_SMTP_USER`, `ZOHO_SMTP_HOST`, `ZOHO_SMTP_PORT`, and `CIRCLE_INVITATION_FROM` retain their configured values.
4. For Preview email QA, set **`SWITCH_CAMPAIGN_TEST_EMAIL`** to an inbox you control and redeploy Preview. All campaign emails in non-production go to that inbox. Without this variable they remain pending. Do not set it to a customer's email.
5. The existing `/api/cron/notifications` job and `CRON_SECRET` process expiry, seven-day/two-day reminders, conversion observations and 90-day receipt cleanup. Verify the production cron is enabled. Vercel Preview deployments do not automatically run production cron schedules; invoke the authenticated endpoint for staging QA through a trusted server-side tool, without exposing its secret.
6. Existing PostHog configuration is reused. No new analytics key, Paddle price, RevenueCat product or payment secret is needed for the complimentary grant.
7. As Owner/Admin open **Admin → Campaigns → Switch to Clover**. Set an optional end date (UTC), status Active and an audit reason. There is no participant cap. Leave draft until QA passes. Settings → Plan is the permanent entry. Public notices are visible only during active intake.
8. After production promotion, repeat the Admin configuration in production: the staging campaign and applications are not copied.

## Pilot rules

Verified Free accounts without paid or complimentary paid access may apply once. Accept genuine non-refunded purchases of budgeting/personal-finance apps. Receipts may use a different purchasing email; ask for context rather than forcing a name/email match. Never request full card numbers or identity documents. Duplicate file hashes are reviewer flags, not proof of fraud. AI-generated receipt detection is not claimed.

Review in submission order. Approvals can be activated within seven days. Activation creates exactly 30 days of Plus, with no card or automatic renewal. Redemptions remain counted for reporting after expiry. Pausing/ending intake honors submitted applications, valid approvals and active rewards. There is no capacity limit; the legacy database capacity field is retained for deployment compatibility and ignored.

Evidence accepts PNG/JPEG/PDF up to 3 MB, maximum five files per application. Additional evidence can be submitted after Admin requests information. Evidence is deleted after 90 days and on account deletion; status and consent-version history remain until account deletion. Email delivery is recorded per event; failed/ambiguous sending is not automatically retried to prevent duplicate messages. Investigate the ledger before any manual resend. Application status is always available in-app.

Admin Users → Plan and access shows the campaign status, redemption and expiry alongside the normal grants. Effective access always follows existing billing/grant precedence: campaign expiry does not remove qualifying paid access. Existing records are preserved and excess creation is restricted under the effective plan. The existing bank lifecycle job disconnects connections that exceed that plan.

## Billing limitation

The campaign does **not** change provider billing dates. Buying Plus or Pro through existing checkout charges immediately. Users who want all 30 complimentary days should subscribe to Plus at expiry; reminder copy says this explicitly. Pro can be purchased immediately. Scheduling a paid Plus start after the reward is a separate provider-specific integration and is not enabled or advertised here.

## Verification run

- Draft hides public notices; Active shows offer on Landing/Pricing; paused/ended closes intake.
- Verified Free QA user submits synthetic receipt; unverified/paid user is rejected; a second submission is rejected.
- Owner requests information; user receives notification and (test inbox) email, replies with evidence; reviewer approves.
- Support can review evidence without changing access; Read-only cannot open private receipt files or make decisions; unrelated user cannot read evidence.
- Activation grants Plus for exactly 30 days; repeating activation creates no second grant. Last-place approvals cannot overbook.
- Expired reservation cannot activate; redeemed place remains counted; campaign pause does not invalidate approval.
- Simulate expiry only on disposable local/staging fixtures: records preserved, Free restrictions restored, bank lifecycle respects paid upgrades.
- Verify seven-day/two-day reminders, paid conversion after expiry, retained use via existing activity events joined to the redemption cohort.
- Check receipt cleanup and account-erasure cleanup; ensure notes, receipt filenames and receipt content never enter analytics.

The automated `qa:switch-campaign` exercises the actual review and activation service against isolated persistence boundaries, plus lifecycle and file-signature rules. Live email and bank disconnection must be verified on disposable staging fixtures, not real customer accounts.

## September 25 UI revision
Admin Campaigns lists Switch to Clover and referral campaigns in one table. Select Manage to configure or review. Settings Plan shows usage, three tier cards, the compact offer, and subscription actions. Referral codes are entered in checkout. Closed intake and ineligible accounts see an explicit reason with the receipt area disabled; paid members remain excluded. No additional environment variables are required.

### Application form refinement
- Offer terms are shared bullet items on the public offer and application pages; the stored terms string is unchanged.
- Plus benefits use Clover icons. Consent is a text-sized checkbox labelled “I agree to the offer terms”.
- Receipt, note and consent remain editable while intake is closed or the user is ineligible. Submit validates eligibility/intake and explains restrictions without sending evidence; the server repeats these checks. Inputs disable only during submission. Drafts are not saved.
- Removed redundant Get Plus/Get Pro labels from Plan, retaining clearly named subscription controls.
