import { Pool } from "pg";

type CountRow = {
  count: number;
};

const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is required for the Supabase security audit.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 8_000,
  idleTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

const count = async (query: string) => {
  const result = await pool.query<CountRow>(query);
  return Number(result.rows[0]?.count ?? 0);
};

const main = async () => {
  try {
    const publicTables = await count(`
      SELECT count(*)::int AS count
      FROM pg_tables
      WHERE schemaname = 'public'
    `);
    const rlsDisabledTables = await count(`
      SELECT count(*)::int AS count
      FROM pg_tables
      WHERE schemaname = 'public'
        AND NOT rowsecurity
    `);
    const apiRoleTableGrants = await count(`
      SELECT count(*)::int AS count
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('anon', 'authenticated', 'service_role')
    `);
    const apiRoleSequenceGrants = await count(`
      SELECT count(*)::int AS count
      FROM information_schema.role_usage_grants
      WHERE object_schema = 'public'
        AND object_type = 'SEQUENCE'
        AND grantee IN ('anon', 'authenticated', 'service_role')
    `);
    const apiRoleFunctionGrants = await count(`
      SELECT count(*)::int AS count
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    `);

    const findings = {
      publicTables,
      rlsDisabledTables,
      apiRoleTableGrants,
      apiRoleSequenceGrants,
      apiRoleFunctionGrants,
    };
    const failureCount =
      rlsDisabledTables + apiRoleTableGrants + apiRoleSequenceGrants + apiRoleFunctionGrants;

    console.log(JSON.stringify(findings, null, 2));

    if (failureCount > 0) {
      throw new Error(`Supabase public-schema security audit found ${failureCount} unresolved exposure(s).`);
    }
  } finally {
    await pool.end();
  }
};

void main();
