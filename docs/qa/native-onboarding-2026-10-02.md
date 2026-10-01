# Native onboarding — 2 October 2026

## Findings and fix

Production runtime logs showed repeated POST /api/mobile/v1/onboarding 503 responses caused by User.email global uniqueness: a different staging Clerk identity already occupied the email. All four native entry actions must finish this same setup step, so both Skip and every upload source failed before any picker opened.

Email uniqueness is now scoped to email + environment. Clerk user ID remains unique and is still the only identity lookup used to grant account access. The migration creates the scoped index before removing the old global index, with no user, Profile, transaction, balance, plan, or ownership updates. Same-environment identity collisions remain blocked and return an actionable 409 rather than a generic retry message. Admin email-edit collision checks follow the same scope. Email-addressed Circle invitation listings, notifications, and token access are scoped to the owner’s environment. This accommodates legacy staging rows; deployment databases remain isolated.

Native onboarding now uses the existing transparent Clover symbol and the exact beginner/intermediate/advanced PNG assets from the approved Figma/web designs. System-dependent plant emojis and the opaque launcher icon are removed. The request format stays compatible with existing production clients and servers.

## Figma

Verified existing plant progression and transparent symbol in Screens, Components / Authentication & Onboarding, mobile experience 667:64064. Corrected heading/copy wrapping in mobile upload master 667:81794 and verified its screenshot.

## Verification

- Isolated PostgreSQL fixture reproduces the pre-fix email collision using the actual mobile API handler, then applies the migration and confirms successful setup for the payload used by all four choices.
- Verifies starter Profile/currency, idempotent replay, unchanged legacy account/balance/plan, rejected invalid token/currency, and same-environment collision protection. Provider authentication is mocked; no real identities or financial records are modified.
- Native component harness tests the three fixed artwork sources, transparent logo source, all four destinations, duplicate-tap suppression, failed-request retry and no navigation after failure.
- Device camera/library/file permissions and rendering still require installed replacement binaries. The production onboarding fix requires promoting the staging commit and its migration; a staging deployment alone does not change production.

Fixture command from web/ (disposable local database ending in _qa only): DATABASE_URL=<local QA URL> npm run qa:native-onboarding:fixture.
