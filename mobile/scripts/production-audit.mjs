import { verifyBracesPatch } from './braces-security-patch.mjs';
import { execFileSync } from 'node:child_process';
import { assessAudit } from './production-audit-policy.mjs';
import { mitigation, mobileRoot, verifyForgePatch } from './forge-security-patch.mjs';

const patchedPaths = verifyForgePatch();
const bracesPaths = verifyBracesPatch();
execFileSync(process.execPath, ["scripts/braces-security-check.mjs"], { cwd: mobileRoot, stdio: "inherit" });
// Includes exploit rejection and the real Expo certificate/CSR/signing APIs.
execFileSync(process.execPath, ['scripts/forge-security-check.mjs'], { cwd: mobileRoot, stdio: 'inherit' });
let stdout;
try {
  stdout = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--omit=dev', '--audit-level=high', '--json', '--fetch-retries=2', '--fetch-timeout=45000'],
    { cwd: mobileRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 180000 });
} catch (error) {
  if (error.status !== 1 || !error.stdout) throw error;
  stdout = error.stdout;
}
const result = assessAudit(JSON.parse(stdout), patchedPaths, Date.now(), bracesPaths);
console.log(result.mitigated
  ? `Mobile audit passed: node-forge and braces advisories are locally patched and tested; no other high/critical advisories. Review before ${mitigation.reviewBy}.`
  : 'Mobile audit passed: no high/critical advisories.');
