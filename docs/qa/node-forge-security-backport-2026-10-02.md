# Expo dependency security mitigation, 2026-10-02

## Finding and scope

The mobile dependency tree installs `node-forge@1.4.0` through Expo CLI and
`@expo/code-signing-certificates`. npm reports GHSA-86w9-cpqp-85rv
(CVE-2026-85393): RSA PKCS#1 v1.5 verification accepts extra elements inside the
nested DigestAlgorithm sequence. The other four high-severity package findings
are transitive consequences of that same advisory. This finding is not evidence
that a Clover account or financial record was compromised.

Sources:
- Advisory: https://github.com/advisories/GHSA-86w9-cpqp-85rv
- Proposed upstream fix: https://github.com/digitalbazaar/forge/pull/1152
- Pinned revision: `ceba34402e329f0365134f23fe19898756527d65`

At implementation time npm's latest release is still 1.4.0. PR 1152 is an open
proposal, not a released or upstream-approved fix. Clover temporarily backports
its exact `lib/rsa.js` change, enforcing one algorithm OID plus an optional NULL
and rejecting extra nested elements. No other cryptographic behavior is changed.

## Reproducible installation and gate

- `mobile/scripts/forge-security-patch.mjs` runs in `postinstall`, including clean
  npm CI and EAS installations. It contains the small patch locally; installation
  never downloads a mutable GitHub branch.
- The lockfile integrity, installed version and full original/patched RSA file
  hashes must match. Every locked node-forge copy is checked. Unexpected versions
  or modified source fail installation. Applying the patch twice is safe.
- `eas-build-post-install` additionally runs the security regressions. The files
  are under `mobile/scripts`, which is included in the existing EAS archive rules.
- Root `qa:security` runs the normal web audit and the mobile audit wrapper. The
  wrapper verifies the installed patch, runs the security regressions, then
  obtains a fresh npm audit report. Network failures and malformed reports fail.
- Only the exact advisory above and its derived dependency findings are accounted
  for as mitigated. Other high/critical advisories still fail, including a new
  advisory on node-forge itself. npm's raw output will continue to flag version
  1.4.0; this does not rename the package or pretend npm has published a fix.
- The existing moderate findings are still reported by npm and remain outside
  the existing high/critical release threshold.
- The mitigation expires at **2026-11-01 00:00 UTC**. The gate then fails until
  the official fix is adopted or the mitigation is explicitly re-reviewed.

## Regression evidence

`mobile/scripts/forge-security-check.mjs` checks:

1. An isolated, hash-verified original 1.4.0 control accepts malformed nested
   DigestAlgorithm signatures; the patched verifier rejects them. Synthetic
   private-key-signed malformed encodings isolate the acceptance bug; these are
   not presented as a complete private-key-free signature forgery.
2. SHA-1, SHA-256, SHA-384 and SHA-512 signatures work with and without the allowed
   NULL parameter. Standard signatures interoperate in both directions with
   Node/OpenSSL. The tests use a 2048-bit, low-public-exponent (3) test key.
3. Extra nested OCTET STRINGs, NULLs, OIDs and sequences are rejected. Extra outer
   elements and incorrect message digests are still rejected.
4. Actual Expo certificate generation, PEM round-trip, certificate validation,
   bundle signing, CSR creation/verification and development certificate issuance
   continue to work. Expo CLI and the certificate library resolve patched copies.
5. Missing patches, tampered source, unexpected versions, unverified paths, new
   high advisories, expired mitigation, malformed reports and graph cycles fail.

Validation completed on 2 October 2026: a clean `npm ci --prefix mobile` applied
the patch, the EAS post-install security checks passed, and the full repository
`npm run qa:prepush` passed, including both native bundle exports and the web
production build. The push hook runs that same gate again before staging updates.

## Removing this mitigation

When a published release fixes this advisory, review its upstream diff and update
the Expo-compatible dependency/lockfile. Remove the temporary postinstall patch,
expiry and advisory accounting; restore the normal mobile npm audit command.
Retain appropriate exploit and Expo compatibility regressions, then run a clean
installation and the complete pre-push gate. Do not simply remove the hash check,
extend the deadline without review, or suppress all node-forge/Expo findings.
