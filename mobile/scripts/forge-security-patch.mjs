import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Temporary backport of the exact rsa.js change proposed in forge PR #1152.
// This is not a released/upstream-approved fix. Remove after upgrading to a
// published fix and re-running the security regressions. No download at install.
export const mitigation = Object.freeze({
  advisory: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
  upstream: 'https://github.com/digitalbazaar/forge/commit/ceba34402e329f0365134f23fe19898756527d65',
  reviewBy: '2026-11-01T00:00:00Z',
  version: '1.4.0',
  integrity: 'sha512-LarFH0+6VfriEhqMMcLX2F7SwSXeWwnEAJEsYm5QKWchiVYVvJyV9v7UDvUv+w5HO23ZpQTXDv/GxdDdMyOuoQ==',
  originalHash: 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50',
  patchedHash: 'acc22e5d36e27832c34e02dd3933aad7977d45b047eead5016520735efedc9c5',
});

export const originalBlock = `          // validate DigestInfo structure and element count
          var capture = {};
          var errors = [];
          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||
            obj.value.length !== 2) {`;
export const patchedBlock = `          // validate DigestInfo structure and element counts (outer DigestInfo
          // and nested DigestAlgorithm). asn1.validate ignores extra children,
          // so length must be checked explicitly at each nesting level to
          // prevent low-exponent PKCS#1 v1.5 signature forgery (CVE-2026-85393).
          var capture = {};
          var errors = [];
          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||
            obj.value.length !== 2 ||
            obj.value[0].value.length !==
              (('parameters' in capture) ? 2 : 1)) {`;

export const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const hash = (source) => createHash('sha256').update(source).digest('hex');

export function forgePaths(root = mobileRoot) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path.endsWith('/node-forge'));
  if (!entries.length) throw new Error('Expected node-forge in the mobile lockfile; review/remove the mitigation.');
  for (const [path, entry] of entries) {
    if (!/^node_modules\/(?:[^.][^/]*\/)*node-forge$/.test(path) ||
        entry.version !== mitigation.version || entry.integrity !== mitigation.integrity) {
      throw new Error(`Unexpected node-forge dependency at ${path}; review the mitigation before upgrading.`);
    }
    const installed = JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8'));
    if (installed.name !== 'node-forge' || installed.version !== mitigation.version) {
      throw new Error(`Unexpected installed node-forge at ${path}`);
    }
  }
  return entries.map(([path]) => path);
}

export function verifyForgePatch(root = mobileRoot) {
  const paths = forgePaths(root);
  for (const path of paths) {
    if (hash(readFileSync(join(root, path, 'lib/rsa.js'))) !== mitigation.patchedHash) {
      throw new Error(`Unpatched or changed RSA verifier at ${path}. Run npm ci with lifecycle scripts enabled.`);
    }
  }
  return paths;
}

export function applyForgePatch(root = mobileRoot) {
  for (const path of forgePaths(root)) {
    const file = join(root, path, 'lib/rsa.js');
    const source = readFileSync(file, 'utf8');
    if (hash(source) === mitigation.patchedHash) continue;
    if (hash(source) !== mitigation.originalHash) throw new Error(`Refusing to patch an unknown RSA verifier at ${path}`);
    const patched = source.replace(originalBlock, patchedBlock);
    if (hash(patched) !== mitigation.patchedHash) throw new Error('RSA backport does not match the reviewed upstream file.');
    writeFileSync(file, patched);
  }
  verifyForgePatch(root);
  console.log('Verified node-forge nested DigestAlgorithm backport (GHSA-86w9-cpqp-85rv).');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) applyForgePatch();
