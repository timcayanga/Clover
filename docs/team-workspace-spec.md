# Clover private workspace — first implementation

**Update:** Authentication and server persistence have now been implemented. See [team-workspace-storage.md](team-workspace-storage.md) for current behavior, tests, and deployment steps. The local-only descriptions below document the original design preview.

## Address and entry points

Use `https://team.clover.ph` as the shared private home. The home shows two entry points:

- `/team`: distribution studio.
- `/admin`: existing Clover operational tools.

`/office` is the chooser's internal route. On the team hostname, middleware rewrites `/` and `/continue` to this chooser. The customer homepage remains unchanged.

## Current implementation

- Three editable role profiles: distribution lead, content creator, community researcher.
- Assignment briefs, explicitly marked saved/not started.
- Responsive content board with labeled sample concepts, draft creation, search, status filters, and review.
- Local image and video attachments; video playback; caption editing; feedback; revision history.
- Approval tied to a revision. Changes to content, channel, media, or planned date invalidate approval.
- Planning agenda; no automated scheduler.
- Social connection cards explicitly show not connected.
- Existing Admin pages and endpoints retain their server authorization. New Admin layout provides workspace navigation and an authentication boundary.

This is a functional design prototype, not a live agent service. Text is stored in localStorage and media in IndexedDB, scoped to the signed-in Clerk user ID. Storage is not synchronized across devices or origins. Moving from localhost to the production domain does not transfer these drafts. Local approvals are design interactions, not a trusted server-side publishing authorization. Browser storage is not an encrypted vault; do not place credentials or customer financial data in briefs or media.

Before enabling agent execution or publishing, move content and revision-bound approvals to server storage with owner authorization on every operation, preserve immutable creative snapshots and media versions, and enforce approval at execution time. Agents must not be allowed to approve their own work. Add job processing, audit history, failure handling, budget limits, and provider-specific connections. Publishing, messaging, account analytics, image generation, and video generation are all separate capabilities; none are currently connected.

## Owner access

Hosted Team and chooser pages require a Clerk account with verified `hello@clover.ph`. Other verified emails and unverified owner emails are rejected. This email is also an explicit Admin allowlist entry; existing configured Admin identities are preserved. No password is included in the repository.

Only a development-mode server on `localhost` or `127.0.0.1` receives the labeled local design preview. Production and hosted previews do not get a guest bypass. Admin's previous production loopback-host bypass has been removed.

The account itself has **not** been provisioned or its password changed. Vercel marks production Clerk credentials as sensitive and intentionally omits their values from exports; their presence has now been confirmed via metadata. Complete this using the real production Clerk instance and verify sign-in before activation. Preserve any existing owner account instead of creating a duplicate.

## Migration activation

1. Integrate this change with the intended release checkout. The working directory contained substantial pre-existing uncommitted work; it was not deployed wholesale.
2. Configure the team hostname in Vercel for the application that contains these routes. Verify the deployment's production credentials without exposing them to client code.
3. Set the DNS record requested by Vercel. Inspection on 2026-09-28 reported the third-party DNS was not configured for `team.clover.ph`, and requested `A team 76.76.21.21` in the `clover.ph` zone. Recheck the project's domain instructions at deployment time.
4. Verify Clerk supports sign-in and session cookies on the team subdomain with the actual production configuration. Verify sign-out and a non-owner denial. No account-provisioning verification has been performed yet.
5. Verify all Admin pages and their same-origin API requests on the team hostname.
6. Only then set server environment variable `CLOVER_INTERNAL_ORIGIN=https://team.clover.ph` and redeploy. Customer-domain `/admin`, `/team`, and `/office` paths redirect to their equivalents on the team hostname, preserving query parameters. Customer-domain `/api/admin` requests return 421 instead of replaying writes across origins. Customer finance routes and staging Admin routes are unaffected.
7. Roll back the routing switch by removing that variable and redeploying if needed. The new domain and routes can remain available.

DNS, production deployment, account provisioning, and migration activation remain outstanding. Neither the supplied password nor authentication tokens were written to application code.

## Verification

- `cd web && npx tsc --noEmit --pretty false`
- `cd web && npx tsx scripts/team-studio-regression.ts`
- Reopen the isolated local preview: `cd web && npx tsx scripts/preview-team-studio.ts`, then visit `http://127.0.0.1:3100/office`. Its Admin door opens the existing customer-domain Admin while migration is pending.
- Browser checks: chooser navigation, new draft, media attachment, approval invalidation, reload persistence, editable roles/briefs, mobile overflow, and console errors.
- The full repository's local dev server encountered `EMFILE` during route discovery. An isolated Next.js preview using the same studio source and the app's global styles was used for visual/interaction verification. This does not verify the deployed Clerk login or existing Admin data APIs.
