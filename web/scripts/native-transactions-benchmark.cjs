const { execFileSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const web = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "clover-transaction-bench-"));
const data = join(directory, "pg");
const port = "56547";
const databaseUrl = `postgresql://clover_benchmark@127.0.0.1:${port}/clover_transaction_bench`;
const baseline = join(web, "app/api/transactions", `.benchmark-baseline-${process.pid}.ts`);
const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "NODE_OPTIONS"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: "test", TZ: "UTC", LC_ALL: "C", LANG: "C", DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, CLOVER_TRANSACTION_BENCH_BASELINE: baseline });
const run = (command, args, stdio = "inherit") => execFileSync(command, args, { cwd: web, env, stdio, timeout: 180_000 });
let stop;
try {
  const bin = run("pg_config", ["--bindir"], "pipe").toString().trim();
  const ref = process.argv[2] ?? "a5268a477";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ref)) throw new Error("Supply a Git ref for the baseline.");
  writeFileSync(baseline, run("git", ["show", `${ref}:web/app/api/transactions/route.ts`], "pipe"), { flag: "wx" });
  run(join(bin, "initdb"), ["-D", data, "-U", "clover_benchmark", "-A", "trust", "--no-locale", "--encoding=UTF8"], "pipe");
  run(join(bin, "pg_ctl"), ["-D", data, "-l", join(directory, "pg.log"), "-o", `-h 127.0.0.1 -p ${port} -k /tmp`, "-w", "start"], "pipe");
  stop = () => run(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], "pipe");
  run(join(bin, "psql"), ["-h", "127.0.0.1", "-p", port, "-U", "clover_benchmark", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE clover_transaction_bench"], "pipe");
  run(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma"], "pipe");
  console.log(`Comparing Transactions route at ${ref} with the working tree on disposable PostgreSQL.`);
  run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/native-transactions-benchmark.ts"]);
} catch (error) {
  const log = join(directory, "pg.log");
  if (!stop && existsSync(log)) console.error(readFileSync(log, "utf8"));
  throw error;
} finally {
  try { stop?.(); } finally {
    rmSync(baseline, { force: true });
    rmSync(directory, { recursive: true, force: true });
  }
}
