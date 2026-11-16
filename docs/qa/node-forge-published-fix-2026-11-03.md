# Published node-forge upgrade, 3 November 2026

The expired temporary node-forge 1.4.0 backport has been replaced with the
published 1.4.2 release, pinned through the mobile dependency override and npm
lockfile. The npm package integrity is
`sha512-rRtAR5XLJ8gCKd9du4qrKAsgCG1ObGP4gLeNJMa4vYSeq4bmBMOJk5IHkrviBV0q7uoAJlVd8HEQYQSVUb4FGQ==`.
This upgrade changes only node-forge in the resolved dependency tree; the same release also separately upgrades the vulnerable URL decoder as described below.

Sources reviewed:
- https://github.com/digitalbazaar/forge/releases/tag/v1.4.2
- https://github.com/digitalbazaar/forge/blob/v1.4.2/lib/rsa.js
- https://github.com/advisories/GHSA-86w9-cpqp-85rv
- https://registry.npmjs.org/node-forge/1.4.2

Upstream now re-encodes DigestInfo as canonical DER, with and without NULL
parameters, and compares the encoded bytes. This covers extra nested elements
and additional noncanonical encodings. Clover no longer modifies rsa.js and no
longer discounts any node-forge advisory in npm audit. The expired exception was
removed, rather than extending its deadline. The separate braces backport and
its narrowly scoped audit accounting remain in place.

The legacy forge-security-patch.mjs filename is retained for existing Expo
installation hooks, but it only verifies the published version, package
integrity and rsa.js hash. No source patch is applied.

Regression coverage retains a hash-verified vulnerable RSA verifier control,
malformed nested/outer signatures, valid SHA-1/256/384/512 signatures with
optional NULL parameters, OpenSSL interoperability, and the real Expo
certificate, CSR and bundle-signing APIs. Tampering and unexpected versions
fail verification. A synthetic node-forge advisory, including the former
exception, now fails the release audit at every date.

Validation: the published-package verifier, exploit/compatibility regressions,
and fresh mobile production audit passed locally. The complete pre-push gate
is required before the staging release; its execution log is retained with the
contextual Ask Clover release evidence.

## URL decoder release blocker

The refreshed audit also found GHSA-qr28-fpjm-wq7f in the old decoder used by
Expo Router's query-string 7.1.3. Clover pins the official
`decode-uri-component@0.5.1`. Since that release exports an ESM default and
query-string 7 is a CommonJS consumer, a hash-verified install adapter reads
`module.default || module` in that one import. No decoder source is modified
and no advisory is suppressed. An unexpected query-string version or source
fails the adapter check, and the release audit requires the adapter to exist.

Sources: https://github.com/advisories/GHSA-qr28-fpjm-wq7f and
https://registry.npmjs.org/decode-uri-component/0.5.1.

The regression executes the advisory's 32,000 distinct malformed encoded runs
in an isolated process with a five-second timeout. It also checks Unicode,
spaces, malformed escapes, arrays, query round-tripping and Clover callback
URLs through the actual query-string consumer. The fresh npm production audit
reports no high or critical advisories after these upgrades.
