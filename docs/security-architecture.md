# Clover Security Architecture

## Authentication

- Clerk is Clover's user authentication provider.
- Supabase Auth is not used by the Clover web application.
- Browser requests authenticate with Clerk and call Clover's server routes.

## Database Access

- Supabase hosts Clover's PostgreSQL database.
- Clover does not use the Supabase JavaScript client or expose its database
  through the Supabase Data API.
- Prisma accesses PostgreSQL only from trusted server code using the `postgres`
  database role.
- Database credentials must remain server-only and must never use a
  `NEXT_PUBLIC_` environment variable.

## Public Schema Boundary

Prisma stores Clover tables in PostgreSQL's `public` schema. Supabase exposes
that schema to its Data API by default, so every Clover table must:

1. Have row-level security enabled.
2. Grant no privileges to `anon`, `authenticated`, or `service_role`.
3. Have no permissive RLS policy unless Clover deliberately adopts a
   browser-facing Supabase workflow later.

The migration
`20260727000000_supabase_public_schema_lockdown` applies this deny-by-default
boundary and removes Supabase's default API grants for future Prisma objects.

## Verification

Run the database security regression against the target environment:

```bash
npm run qa:supabase-security
```

The audit must report zero RLS-disabled public tables and zero API-role grants.

## Change Safety

- Do not add browser-side Supabase access without a dedicated security review.
- Do not create broad policies such as `USING (true)` for financial tables.
- Do not use a Supabase service key in browser code.
- Preserve Clerk authorization and Clover's workspace ownership checks even
  when database protections are added.
- Test account, transaction, import, deletion, billing, and Admin workflows
  after database permission changes.
