# Team workspace: authentication and persistence

## Implemented

Hosted pages and every `/api/team/*` operation require a real Clerk identity with verified `hello@clover.ph`. Missing sessions return 401; other or unverified addresses return 403. A local page preview is available only when `NODE_ENV=development`, the host is loopback, and `CLOVER_STUDIO_DESIGN_PREVIEW=1`. That flag never bypasses API authorization.

Three new PostgreSQL tables are independent of customer financial records:

- `TeamStudioState`: owner-scoped drafts, role instructions, assignment briefs, and current state revision.
- `TeamStudioAudit`: append-only application snapshots for every successful save, written in the same transaction as state.
- `TeamStudioMedia`: owner-scoped upload metadata and the immutable final R2 object key.

All tables have RLS enabled, no public API policies, and no grants to Supabase API roles. Prisma accesses them from trusted server code using Clover's existing database connection. No customer financial schema or records are modified.

Saves use a compare-and-swap revision. A stale tab receives 409 and cannot overwrite newer work. The UI keeps the unsaved form open and asks the owner to copy edits before reloading. Server logic derives draft revisions and approval invalidation; submitted history and revision numbers are never trusted. Prior audit snapshots persist even when the compact display history reaches its 100-entry limit. Draft deletion and brief-history rewriting are not supported in this phase.

Signed-in work uses PostgreSQL and private R2. Only the explicitly labeled design preview uses localStorage/IndexedDB. Prototype data is not automatically promoted to server storage or treated as approved content. Existing local prototype data remains available in the design preview.

## Private media

Media uploads support PNG, JPEG, WebP, MP4, and WebM up to 100 MB. They go directly to R2 via a five-minute signed PUT URL, avoiding the hosting function's request-body limit. On completion the server verifies ownership, content length, declared MIME type, and file signature. It copies the staged object to a fresh private final key using an ETag precondition and atomically marks the media ready. Replayed staging uploads or racing completion requests cannot replace the media referenced by a draft or approval. Temporary read URLs expire after five minutes; the UI offers retry if playback or an image URL expires.

The existing private statement bucket (`R2_BUCKET_NAME`) is the default. `CLOVER_TEAM_MEDIA_BUCKET` can select a separate private bucket using the same R2 credentials. Do not use a public assets bucket. No new provider account or paid service is required.

Allow browser uploads from the studio origin by **adding** an R2 CORS rule while preserving existing import rules:

```json
{
  "AllowedOrigins": ["https://team.clover.ph"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["Content-Type"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}
```

Add any protected preview origin used for acceptance testing explicitly; do not use a wildcard. Configure expiry for `team-staging/` objects after one day. Unattached finalized uploads are retained; automated garbage collection is a later maintenance task and must preserve historical media references.

## Deployment status and activation

Vercel metadata confirms the production Clerk and R2 variables exist and are marked **sensitive**. Vercel deliberately does not return their values in environment exports. Blank exports do not imply the deployed credentials are missing. The credentials have not been replaced or exposed, and the owner's password has not been changed.

The migration `20260928000000_team_studio` has been applied and tested in a disposable local PostgreSQL database, not production. Before activating hosted persistence:

1. Review pending migrations for the intended release; do not apply unrelated unfinished migrations from this shared checkout.
2. Apply the additive Team migration to the target database, using the normal Prisma migration deployment process for that release.
3. Deploy the application with the existing Clerk, database, and R2 environment configuration. Verify the R2 bucket remains private and add the studio CORS origin.
4. Sign in as the verified owner, create a draft, reload from another browser, upload media, and verify approval invalidation. Separately verify non-owner denial.
5. Complete DNS and the gated Admin move described in `team-workspace-spec.md`. Leave `CLOVER_INTERNAL_ORIGIN` unset until the team domain and authentication work.

Live agent execution, social publishing, and image/video generation remain separate future integrations. Saving a brief does not start an agent run.

## Verification

- `npx tsc --noEmit --pretty false`
- `npx tsx scripts/team-studio-regression.ts`
- `DATABASE_URL=postgresql://clover_test@127.0.0.1:55432/postgres npx tsx scripts/team-storage-regression.ts`
- `DATABASE_URL=postgresql://clover_test@127.0.0.1:55432/postgres npx tsx scripts/team-api-regression.ts`
- `DATABASE_URL=postgresql://clover_test@127.0.0.1:55432/postgres npx tsx scripts/team-api-regression.ts --media` (R2 adapter simulated; database real)

The storage and API regressions deliberately refuse other database addresses. Initialize a disposable PostgreSQL instance on port 55432 with role `clover_test` and apply only the Team migration before running them. The API runner bundles a test-only Clerk adapter; it verifies authorization behavior but does not establish that production Clerk sign-in works. Browser storage-flow tests likewise use a simulated identity against the real disposable database. No test authentication adapter is included in the application build.

Browser verification confirmed a draft and caption created in one browser session appeared in a separate session, with no draft records in localStorage. A stale edit from the first session was rejected while keeping the unsaved text visible. The production migration-status check did not finish within the bounded timeout against the transaction-pooler address; production migration readiness remains unverified. Use the deployment's direct/session database connection for Prisma migration operations.
