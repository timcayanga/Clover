import assert from "node:assert/strict";
import type { spawnSync } from "node:child_process";
import { deployMigrations, migrationEnvironment } from "./migration-runner";

const direct = "postgresql://test:fixture@aws-1-test.pooler.supabase.com:5432/postgres";
const runtime = direct.replace(":5432", ":6543");
const env = { DIRECT_URL: direct, DATABASE_URL: runtime };
assert.equal(migrationEnvironment(env).DIRECT_URL, direct);
assert.equal(migrationEnvironment(env).DATABASE_URL, runtime);
assert.equal(migrationEnvironment({ DATABASE_URL: direct }).DIRECT_URL, direct);
assert.throws(() => migrationEnvironment({ DATABASE_URL: runtime }), /transaction pooling/);
assert.throws(() => migrationEnvironment({ DIRECT_URL: runtime, DATABASE_URL: direct }), /transaction pooling/);
assert.throws(() => migrationEnvironment({ DIRECT_URL: direct + "?pgbouncer=true" }), /session semantics/);
assert.throws(() => migrationEnvironment({}), /require/);
assert.throws(() => migrationEnvironment({ DIRECT_URL: "secret-invalid" }), /Invalid migration database URL/);
assert.equal(migrationEnvironment({ DIRECT_URL: "postgresql://test:fixture@db.example.com:5432/db" }).DIRECT_URL, "postgresql://test:fixture@db.example.com:5432/db");
for (const result of [ { status: 0 }, { status: 1 }, { status: null, signal: "SIGTERM" }, { status: null, error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) } ]) {
  let calls = 0;
  const run = ((command: string, args: string[], options: Record<string, unknown>) => {
    calls++;
    assert.equal(command, process.execPath);
    assert.ok(args[0].endsWith("node_modules/prisma/build/index.js"));
    assert.deepEqual(args.slice(1), ["migrate", "deploy", "--schema", "prisma/schema.prisma"]);
    assert.equal(options.timeout, 180_000);
    assert.equal(options.killSignal, "SIGKILL");
    assert.equal((options.env as NodeJS.ProcessEnv).DIRECT_URL, direct);
    return result;
  }) as typeof spawnSync;
  assert.equal(deployMigrations(env, run), result.status === 0 ? 0 : 1);
  assert.equal(calls, 1, "Never retry schema failures or timeouts against the runtime pooler");
}
console.log("Migration runner regressions passed.");
