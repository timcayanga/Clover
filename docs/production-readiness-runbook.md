# Clover Production Readiness Runbook

## Release Rule

Promote only a staging deployment built from the exact commit that passed the
quality gate. Do not rebuild a different commit for production.

## Automated Gate

Run from the repository root:

```bash
npm ci
npx prisma generate --schema web/prisma/schema.prisma
npm run typecheck
npm run qa:release
npm run build
```

With target-environment database variables loaded, also run:

```bash
npm run qa:release:live
```

The live gate is read-only unless the reconciliation command is explicitly
given `--apply`.

## Production Canary

Use a dedicated QA account and label every disposable record with a timestamp.

1. Sign in and load Home, Accounts, Transactions, Recurring, Reports, Adviser,
   Split Bills, Budgeting, Goals, Investments, Settings, and Admin where
   applicable.
2. Create one account with an opening balance.
3. Add, edit, review, and delete one income and one expense.
4. Verify Home, account balances, Reports, Recurring, and Adviser reflect the
   same confirmed records.
5. Create and delete one investment, budget, goal, and split bill.
6. Upload one deterministic CSV and one representative image or PDF.
7. Verify raw source data, confidence, review state, account assignment, and
   duplicate handling.
8. Delete only the timestamped QA records and confirm unrelated records remain.

Never run destructive canary actions in a real user's profile.

## Billing

Before enabling paid acquisition:

1. Confirm `/api/admin/readiness` reports all PayPal checks as passing.
2. Confirm production uses `PAYPAL_ENV=live` and non-production uses sandbox.
3. Verify monthly and annual plan IDs are distinct.
4. In PayPal sandbox, exercise approval pending, activation, plan revision,
   cancellation, suspension, expiration, duplicate webhook delivery, and
   account deletion.
5. Confirm a verified active configured plan grants Pro and every terminal or
   unrecognized state resolves to Free unless an Admin lock is active.

Never complete a live purchase as an automated test.

## Backup And Restore Drill

At least monthly:

1. Confirm the Supabase backup schedule and retention in the dashboard.
2. Restore the latest backup into an isolated project or database.
3. Point a temporary preview deployment at the restored database.
4. Run `npm run qa:release:live`.
5. Verify a sample import retains its source file metadata, parsed rows,
   normalized transactions, confidence, review state, account, and learned
   rules.
6. Record the backup timestamp, restore duration, row-count checks, tester, and
   outcome. Never point production at the drill database.

## Monitoring

After every promotion:

1. Confirm `/api/health` returns the expected build and environment.
2. Review Vercel runtime logs for the new deployment.
3. Review Admin Operations, Errors, Data QA, and Analytics.
4. Investigate any stale import, failed import, suspended subscription,
   elevated page error, or workspace reconciliation issue.
5. Roll back immediately if authentication, financial CRUD, imports, or data
   isolation regress.

## Rollback

Keep the previous READY production deployment available. If a release fails a
critical canary check, move the production aliases back to that deployment,
capture the failed build ID, and reproduce the issue on staging before another
promotion.
