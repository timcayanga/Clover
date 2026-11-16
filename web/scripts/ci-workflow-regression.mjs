import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync(new URL('../../.github/workflows/quality-gate.yml', import.meta.url), 'utf8');
const block = /- name: Run the same pre-push quality gate used locally\n        run: \|\n((?:          [^\n]*\n)+)/.exec(workflow)?.[1];
assert(block, 'The workflow must invoke the shared root gate');
const script = block.replace(/^          /gm, '');
const root = mkdtempSync(join(tmpdir(), 'clover-ci-exit-'));
try {
  const bin = join(root, 'bin'); mkdirSync(bin);
  const npm = join(bin, 'npm');
  writeFileSync(npm, '#!/bin/sh\n[ "$1 $2" = "run qa:prepush" ] || exit 99\nprintf "%s\\n" "fixture gate output"\nexit "$FIXTURE_GATE_EXIT"\n');
  chmodSync(npm, 0o755);
  for (const status of [0, 42]) {
    const result = spawnSync('bash', ['-c', script], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE_GATE_EXIT: String(status) } });
    assert.equal(result.status, status, `Log capture must preserve gate exit ${status}: ${result.stderr}`);
    assert.match(readFileSync(join(root, 'artifacts/quality-gate.log'), 'utf8'), /fixture gate output/);
  }
  console.log('CI workflow: actual gate wrapper retains success/failure exit codes and captures output; no app/database commands executed.');
} finally { rmSync(root, { recursive: true, force: true }); }
