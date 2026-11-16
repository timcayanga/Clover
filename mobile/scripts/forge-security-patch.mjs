import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Published upstream release, verified without modifying installed source.
export const publishedRelease = Object.freeze({
  version: '1.4.2',
  integrity: 'sha512-rRtAR5XLJ8gCKd9du4qrKAsgCG1ObGP4gLeNJMa4vYSeq4bmBMOJk5IHkrviBV0q7uoAJlVd8HEQYQSVUb4FGQ==',
  rsaHash: '6632e195295ce76f6bb9131ee770dcd6cc1ee4ffac7906302208b00faf95a87f',
  vulnerableRsaHash: 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50',
});

export const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const hash = (source) => createHash('sha256').update(source).digest('hex');

export function forgePaths(root = mobileRoot) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path.endsWith('/node-forge'));
  if (!entries.length) throw new Error('Expected node-forge in the mobile lockfile; review the verified release.');
  for (const [path, entry] of entries) {
    if (!/^node_modules\/(?:[^.][^/]*\/)*node-forge$/.test(path) ||
        entry.version !== publishedRelease.version || entry.integrity !== publishedRelease.integrity) {
      throw new Error(`Unexpected node-forge dependency at ${path}; review the published release before upgrading.`);
    }
    const installed = JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8'));
    if (installed.name !== 'node-forge' || installed.version !== publishedRelease.version) {
      throw new Error(`Unexpected installed node-forge at ${path}`);
    }
  }
  return entries.map(([path]) => path);
}

export function verifyForgePatch(root = mobileRoot) {
  const paths = forgePaths(root);
  for (const path of paths) {
    if (hash(readFileSync(join(root, path, 'lib/rsa.js'))) !== publishedRelease.rsaHash) {
      throw new Error(`Unverified or changed RSA verifier at ${path}. Run npm ci with the reviewed lockfile.`);
    }
  }
  return paths;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyForgePatch();
  console.log('Verified published node-forge 1.4.2 canonical DER verifier; no local patch.');
}
