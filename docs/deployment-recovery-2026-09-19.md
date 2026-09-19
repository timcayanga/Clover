# Production deployment recovery — 2026-09-19

## Cause

Production deployment `dpl_GaPfTwoNwbA8bsUc1Wfc3Uc4vn1N` stopped at Prisma P3009: migration `20260914140000_brankas_statement_tables` had a started record but no completion record. The script treated every migration failure as a connection failure, retried on the runtime Supabase transaction pooler (6543), and had no process timeout. Staging's migration history was healthy, so the same commit built there.

## Repair

Read-only inspection of production confirmed both Brankas tables, all31 columns,13 indexes including primary keys,3 foreign keys,8 enum labels, row-level security and revoked public/API-role grants matched the checked-in migration. Only migration history was repaired with `prisma migrate resolve --applied 20260914140000_brankas_statement_tables`, using the existing session pooler on5432. No financial records or application schema were changed. Subsequent `prisma migrate status` reported95 migrations and “Database schema is up to date!”

## Prevention

The build runner now invokes the installed Prisma CLI directly, uses a direct/session connection, rejects Supabase transaction pooling and `pgbouncer=true`, never blindly retries a migration error, and fails the build after180 seconds rather than waiting indefinitely. Missing connection configuration also fails clearly on Vercel. Local builds retain their existing migration skip.

Regression coverage tests valid session/direct targets, invalid and missing URLs, transaction-pooler rejection, failure/signal/timeout propagation, and exactly one CLI invocation. The regression is part of root `qa:prepush`, which is also the GitHub quality-gate command.

Supabase documents session-mode connections for migrations: https://supabase.com/docs/guides/database/prisma

## Deployment verification

Production retry uses the previously tested staging commit6565874b, deployment `dpl_B8ohcsgTLJUFwjmg1keCfrkjHrmn`. Build completion is recorded after verification. The preventive runner changes are separately validated and released to staging.
