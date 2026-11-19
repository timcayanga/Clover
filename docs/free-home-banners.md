# Free mobile Home banners

Figma: [Clover — Home Banners & Campaigns](https://www.figma.com/design/DXb3uiVR4o4U6tDisTS1Ua?node-id=2-99). Editable Free states, paid exclusion, Admin editor, campaign form and review email use Poppins, Clover source tokens, reusable components and the existing 3D icon assets.

## Presentation

Place the carousel immediately below the Add Expense / Add Income row on mobile Home. It never appears on desktop Home or for effective Plus / Pro access, including complimentary grants. The server checks the effective entitlement; clients do not infer eligibility from an old plan label. Failed or unauthenticated requests hide offers and never block Home.

With two or more enabled offers: swipe, use the dots, or advance every five seconds; the final offer loops to the first. Manual interaction, focus, hovering and backgrounding pause rotation. A Pause control is available. Reduced motion disables automatic rotation. A single offer has no unnecessary carousel controls. Timers, listeners and requests are cleaned up on close/unmount.

The two initial banners are code defaults until Admin saves an environment-specific configuration:

1. Bank sync upgrade → `/settings/plan?source=home_banner&banner=bank-sync`.
2. Existing Switch to Clover campaign → `/settings/plan/switch-to-clover`.

The second banner is hidden if campaign intake is paused or ended; existing application and reward policy stays intact. Both staging and production intake were active at implementation time. Reordering banners does not change campaign configuration or approve applicants.

## Administration

Admin → Home banners (`/admin/home-banners`). Owner/Admin can add up to twelve banners, drag or use arrows to order, enable/disable, edit title/copy/CTA, select Clover artwork/theme, upload optional background artwork and set a supported relative Clover deep link. All changes are saved explicitly and audited. Version checks prevent one editor from silently overwriting another. Support and read-only roles cannot publish.

Recommended artwork: **1200 × 600 px (2:1)**, PNG/JPEG/WebP, up to **2 MB**. Minimum 600 × 300; maximum 2400 × 1200. Keep essential artwork 40px from the edges. Text and CTA are separate accessible content. Genuine raster format, decoded dimensions, animation and pixel limits are checked server-side. Uploaded images are re-encoded to WebP. Only public promotional artwork belongs here; private campaign evidence remains in its existing private store.

Configurations and artwork are isolated by environment. Both new tables have RLS enabled and revoke direct Supabase API-role access; management goes through the authorized application API. Campaign, transaction, account and balance records are not part of banner storage. Production does not copy staging applications or private evidence.

## Campaign alerts

Every accepted submission creates its existing durable reviewer-email outbox entry in the same transaction. After-response work prioritizes reviewer email to **hello@clover.ph**; the existing notification cron recovers missed work. Preview delivery retains `SWITCH_CAMPAIGN_TEST_EMAIL` isolation. Email contains a direct **Review in Admin** link; Admin can inspect the evidence and approve, reject or request information. Existing time-limited review links remain compatible.

Delivery status remains visible in campaign Admin. An ambiguous SMTP failure is not blindly resent or reported as delivered. No user receives Plus merely by clicking a banner or uploading evidence: the established approval and activation rules apply.

## Release scope

Web/backend deployment enables the mobile-web banner. iOS/Android implementation is source-only until a later verified native build, because existing store packages disable OTA updates. This task creates no IPA or AAB.

Checks: `web/scripts/home-banners-regression.cjs` exercises the actual carousel hook lifecycle and shared destination/visibility rules. `web/scripts/home-banners-db-regression.ts` runs with the mandatory isolated database gate and checks real storage/API authorization, conflict races, artwork validation and confirmed-record preservation. Existing reviewer-email database checks retain delivery, review and resubmission safety assertions and verify the new Admin link.
