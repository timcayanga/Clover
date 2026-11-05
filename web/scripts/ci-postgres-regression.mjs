import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPostgres } from './ci-postgres.mjs';

const root = mkdtempSync(join(tmpdir(), 'clover-ci-tools-'));
function fixture(name, versions, executable = true) {
  const directory = join(root, name);
  mkdirSync(directory);
  for (const [tool, version] of Object.entries(versions)) {
    const file = join(directory, tool);
    // These fixtures support --version only; executing database operations fails.
    writeFileSync(file, `#!/bin/sh\n[ "$1" = "--version" ] || exit 90\nprintf '%s\\n' '${tool} (PostgreSQL) ${version}'\n`);
    chmodSync(file, executable ? 0o755 : 0o644);
  }
  return directory;
}
try {
  const pg16 = fixture('postgres 16', { initdb: '16.15', pg_ctl: '16.15', psql: '16.15' });
  const pg18 = fixture('postgres 18', { initdb: '18.1', pg_ctl: '18.1', psql: '18.1' });
  const pg15 = fixture('postgres 15', { initdb: '15.5', pg_ctl: '15.5', psql: '15.5' });
  const partial = fixture('partial', { initdb: '16.15', pg_ctl: '16.15' });
  const mixed = fixture('mixed', { initdb: '16.15', pg_ctl: '18.1', psql: '18.1' });
  const blocked = fixture('not executable', { initdb: '18.1', pg_ctl: '18.1', psql: '18.1' }, false);
  const invalid = fixture('unknown version', { initdb: 'unknown', pg_ctl: 'unknown', psql: 'unknown' });
  assert.equal(findPostgres([]), null, 'No implicit fallback to a developer database');
  assert.equal(findPostgres([pg15, partial, mixed, blocked, invalid]), null);
  assert.deepEqual(findPostgres([pg15, partial, pg18]), { directory: pg18, major: 18 });
  assert.deepEqual(findPostgres([pg16, pg18]), { directory: pg16, major: 16 }, 'Honor the configured supported installation');
  assert.deepEqual(findPostgres([root + '\nINJECTED=value', pg18]), { directory: pg18, major: 18 });
  const environmentFile = join(root, 'github-env');
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./ci-postgres.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, CLOVER_QA_PG_BIN: pg18, GITHUB_ENV: environmentFile },
  });
  assert.match(output, /PostgreSQL 18/);
  assert.equal(readFileSync(environmentFile, 'utf8'), `CLOVER_QA_PG_BIN=${pg18}\n`);
  console.log('CI PostgreSQL discovery: supported versions, partial/mixed/old/non-executable rejection, configured precedence, spaced paths, environment-file safety and no database access passed.');
} finally { rmSync(root, { recursive: true, force: true }); }
