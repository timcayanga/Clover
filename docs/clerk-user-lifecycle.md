# Clerk and Clover user lifecycle

## Incident and intended behavior

A user created in Clerk Development did not appear in Admin because Clover had no Clerk user webhook and the directory selected production rows. Login was the only path that created a local User. Vercel's CLI export masked existing sensitive values as blanks; that observation does not establish a missing runtime secret. The matching Development key was explicitly configured for this release. Development users belong in staging's isolated database and Admin; they must never be moved into production by matching email addresses.

The user confirmed that deleting a user should permanently erase their financial records. Admin identity deletion retains the previously approved different-Owner review requirement. Clerk dashboard deletion is authorized in Clerk itself and does not wait for a Clover approval.

## Controls

- Staging Admin reads staging records, including Development accounts with test email addresses. Production Admin continues to read production records. The Clerk panel labels the environment.
- **Create user** creates a Free Clerk user and its Clover record immediately. Email and names are accepted; no password or invitation email is sent. Clerk treats Backend API supplied emails as verified, and the form explains this. Users use the instance's configured sign-in/recovery methods.
- Creation uses a unique Clerk external ID for retries. If a request fails after Clerk created the identity, retry unchanged or use **Sync from Clerk**. Never reassign an existing Clover identity by matching its email.
- **Sync from Clerk** walks provider users in pages of 25, creates missing records, refreshes primary email/name/verification, and resumes pending erasure requests. It does not infer deletion from absence in a provider list.
- **Data → Delete User Permanently** requests `delete_identity` approval. A different active Owner must approve; the requester then executes it in Admin Approvals. Self-deletion and active/bootstrapped staff identities are rejected by Admin until staff access is removed.
- Existing transaction/account data-only deletion actions remain separate from identity deletion.

## Webhook

Endpoint: `https://staging.clover.ph/api/webhooks/clerk`

Clerk instance: **Clover Development**. Subscribe to `user.created`, `user.updated`, and `user.deleted`. Store that endpoint's secret as `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel **Preview / staging**. Use the matching Development `CLERK_SECRET_KEY` and public key. Production requires a separate endpoint, signing secret, live key and production-marked database; this release does not deploy production.

The handler uses Clerk's `verifyWebhook` on the raw request. Missing configuration returns 503; invalid signatures return 400; processing failures return 503 so Clerk retries. Profile events read fresh provider state rather than trusting delayed payload fields. Before applying a deletion event, the handler verifies the configured Clerk instance no longer contains that ID. Credential type and database marker must match the deployment.

## Permanent erasure and recovery from failures

A non-financial Clerk ID tombstone blocks login, API access and resurrection from delayed events. Deletion removes Clerk identity, cancels supported web billing, deletes stored import objects, recovery snapshots, billing-event payloads, and the User with dependent Profiles/accounts/transactions/import data/planning records. Contributions, memberships and activity attributable to the user in other Circles are explicitly removed rather than left as orphaned financial records. A minimal identity-deletion marker and administrative action history remain for operational safety; provider-managed backups follow their retention policies. App Store/Play subscriptions remain governed by their store cancellation process.

Shared Circles owned by the user must first have ownership transferred; deleting one user's identity must not cascade into other members' financial records. Admin rejects this before removing the Clerk identity. If the identity was already removed directly in Clerk, the tombstone blocks access and erasure remains pending until shared ownership is resolved. Storage/billing failures also remain pending and retryable. The webhook or Admin sync resumes the request without recreating the user. No recovery snapshot is created by permanent identity deletion.

## Verification

`web/scripts/clerk-identity-fixture.ts` exercises the actual Prisma database and route handlers with isolated Clerk/storage substitutes and real webhook signature verification. It refuses non-local databases and databases whose names do not end in `_qa`.

Run with an explicitly configured local QA `DATABASE_URL` and `DIRECT_URL`:

```
npm --prefix web run qa:clerk-identity
```

23 checks cover first-login-independent sync, Free defaults, primary email verification, idempotency, profile freshness, entitlement/confirmed-transaction preservation, signature rejection, wrong-instance deletion, environment isolation, email conflicts, create retries, staff permissions, Owner approvals, shared-data protection, partial erasure, tombstones, file/snapshot removal and both deletion origins. Admin component browser checks cover paginated sync, form submission and mobile/desktop light/dark layouts with mocked API responses.

For a controlled backfill after deployment, use the environment-checked script with a private Vercel export:

```
cd web
npx tsx scripts/sync-clerk-users.ts --env-file /private/path/staging.env
```

Do not use the local `.env.local` for staging reconciliation: the investigated local configuration pointed to a production-marked database.

Clerk references: [Syncing users](https://clerk.com/docs/guides/development/webhooks/syncing), [Create user](https://clerk.com/docs/reference/backend/user/create-user).
