import { accessSync, appendFileSync, constants, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = ['initdb', 'pg_ctl', 'psql'];

export function postgresCandidates(environment = process.env) {
  const candidates = [environment.CLOVER_QA_PG_BIN];
  try {
    candidates.push(execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch { /* A runner can have versioned server tools without pg_config. */ }
  try {
    const versions = readdirSync('/usr/lib/postgresql').filter(name => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a));
    candidates.push(...versions.map(version => `/usr/lib/postgresql/${version}/bin`));
  } catch { /* Non-Linux hosts normally resolve through pg_config. */ }
  return [...new Set(candidates.filter(Boolean))];
}

/** Inspect binaries only. Never start, reuse or connect to an existing database. */
export function findPostgres(candidates) {
  for (const directory of candidates) {
    if (!directory || /[\r\n]/.test(directory)) continue;
    try {
      const versions = tools.map(tool => {
        const executable = join(directory, tool);
        accessSync(executable, constants.X_OK);
        const output = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
        const major = /\(PostgreSQL\)\s+(\d+)(?:\.|\b)/.exec(output)?.[1];
        if (!major) throw new Error('Unrecognized PostgreSQL version');
        return Number(major);
      });
      if (versions[0] >= 16 && versions.every(version => version === versions[0])) {
        return { directory: resolve(directory), major: versions[0] };
      }
    } catch { /* Missing, non-executable or mixed-version tools are not usable. */ }
  }
  return null;
}

export function configurePostgres(environment = process.env) {
  const selected = findPostgres(postgresCandidates(environment));
  if (!selected) throw new Error('PostgreSQL 16+ server tools are unavailable. Install the distribution postgresql package, then retry. No database was accessed.');
  if (environment.GITHUB_ENV) appendFileSync(environment.GITHUB_ENV, `CLOVER_QA_PG_BIN=${selected.directory}\n`);
  console.log(`Disposable QA database tools: PostgreSQL ${selected.major}, ${selected.directory}`);
  return selected;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { configurePostgres(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
