/* A fresh database per run; no caller database URL, credentials or cloud env. */
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const net = require('node:net');
const web = resolve(__dirname, '..');
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { NODE_ENV: 'test', TZ: 'UTC', LC_ALL: 'C', LANG: 'C', NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: 'postgresql://clover_qa@127.0.0.1:55441/clover_migration_qa', DIRECT_URL: 'postgresql://clover_qa@127.0.0.1:55441/clover_migration_qa' });
function run(bin, args, extra = {}, quiet = false) {
  const r = spawnSync(bin, args, { cwd: web, env: { ...env, ...extra }, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${bin} ${args.join(' ')} failed: ${r.error?.message ?? r.status}\n${quiet ? r.stderr + r.stdout : ''}`);
  return r.stdout?.trim();
}
function pgBinary(name) {
  const config = spawnSync('pg_config', ['--bindir'], { env, encoding: 'utf8' });
  const candidates = [process.env.CLOVER_QA_PG_BIN, config.status === 0 ? config.stdout.trim() : '', '/opt/homebrew/bin', ...[18,17,16,15].map(v => `/usr/lib/postgresql/${v}/bin`)];
  const bin = candidates.filter(Boolean).map(dir => join(dir, name)).find(existsSync);
  if (!bin) throw new Error('PostgreSQL binaries are required for release preservation checks. Install PostgreSQL 16+ or set CLOVER_QA_PG_BIN. Tests never fall back to a configured database.');
  return bin;
}
async function main() {
  if (process.argv.length !== 2) throw new Error('Release gate accepts no skip, filter or remote-database arguments');
  console.log('Parser release gate: reviewed sources, historical inline contracts, isolated real worker persistence.');
  const tsx = join(web, 'node_modules/tsx/dist/cli.mjs');
  for (const [script, args] of [['parser-regression.ts', ['--portable']], ['reviewed-parser-corpus.ts', []], ...['merchant-enrichment-regression.ts', 'context-corpus-learning-regression.ts', 'training-signal-dedupe.ts', 'account-tombstone-currency-regression.ts', 'account-import-identity-regression.ts'].map(script => [script, []])]) {
    run(process.execPath, [tsx, join('scripts', script), ...args], { NODE_OPTIONS: '--conditions=react-server' });
  }
  // Refuse an occupied port; never reuse or reset any existing database.
  const probe = net.createServer();
  await new Promise((ok, fail) => { probe.once('error', fail); probe.listen(55441, '127.0.0.1', ok); });
  await new Promise(ok => probe.close(ok));
  const pgCtl = pgBinary('pg_ctl'), initdb = pgBinary('initdb'), psql = pgBinary('psql');
  const temp = mkdtempSync(join(tmpdir(), 'clover-parser-release-'));
  const data = join(temp, 'db');
  let started = false;
  try {
    run(initdb, ['-D', data, '-U', 'clover_qa', '-A', 'trust', '--no-locale', '-E', 'UTF8'], {}, true);
    try {
      run(pgCtl, ['-D', data, '-l', join(temp, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55441 -k /tmp -c timezone=UTC', '-w', 'start'], {}, true);
    } catch (error) {
      const log = join(temp, 'postgres.log');
      if (existsSync(log)) console.error(readFileSync(log, 'utf8'));
      throw error;
    }
    started = true;
    run(psql, ['-h', '127.0.0.1', '-p', '55441', '-U', 'clover_qa', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE clover_migration_qa'], {}, true);
    run(process.execPath, [join(web, 'node_modules/prisma/build/index.js'), 'db', 'push', '--schema', 'prisma/schema.prisma'], {}, true);
    for (const script of ['learning-migration-db-regression.ts', 'app-migration-db-regression.ts', 'bank-import-database-regression.ts', 'parser-preservation-db-regression.ts', 'durable-learning-db-regression.ts', 'record-training-signal-regression.ts']) {
      run(process.execPath, [tsx, join('scripts', script), '--execute'], { BANK_IMPORT_QA_DATABASE_URL: env.DATABASE_URL });
    }
    console.log('Parser release gate passed. Disposable PostgreSQL will be removed.');
  } finally {
    if (started || spawnSync(pgCtl, ['-D', data, 'status'], { env, stdio: 'ignore' }).status === 0) run(pgCtl, ['-D', data, '-m', 'immediate', '-w', 'stop'], {}, true);
    rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
