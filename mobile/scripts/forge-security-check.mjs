import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessAudit } from './production-audit-policy.mjs';
import { applyForgePatch, hash, mitigation, mobileRoot, originalBlock, patchedBlock, verifyForgePatch } from './forge-security-patch.mjs';

const require = createRequire(import.meta.url);
const paths = verifyForgePatch();
const temporary = mkdtempSync(join(tmpdir(), 'clover-forge-regression-'));
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 3,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const message = Buffer.from('Clover Expo signing regression; synthetic data only');

try {
  // Prove the regression detects the vulnerable release rather than merely
  // asserting that the backported source text exists. Never modify real installs.
  const baselinePath = join(temporary, 'baseline');
  cpSync(join(mobileRoot, paths[0]), baselinePath, { recursive: true });
  const rsaPath = join(baselinePath, 'lib/rsa.js');
  const baselineSource = readFileSync(rsaPath, 'utf8').replace(patchedBlock, originalBlock);
  assert.equal(hash(baselineSource), mitigation.originalHash);
  writeFileSync(rsaPath, baselineSource);
  const baseline = require(baselinePath);
  const baselinePublic = baseline.pki.publicKeyFromPem(publicKey);

  for (const path of paths) {
    const forge = require(join(mobileRoot, path));
    const forgePrivate = forge.pki.privateKeyFromPem(privateKey);
    const forgePublic = forge.pki.publicKeyFromPem(publicKey);
    const a = forge.asn1;
    const node = (type, value, constructed = false) => a.create(a.Class.UNIVERSAL, type, constructed, value);
    const digestInfo = (algorithm, digest, parameters, extraOuter = []) => a.toDer(node(a.Type.SEQUENCE, [
      node(a.Type.SEQUENCE, [node(a.Type.OID, a.oidToDer(forge.pki.oids[algorithm]).getBytes()), ...parameters], true),
      node(a.Type.OCTETSTRING, digest), ...extraOuter,
    ], true)).getBytes();

    for (const algorithm of ['sha1', 'sha256', 'sha384', 'sha512']) {
      const md = forge.md[algorithm].create().update(message.toString('binary'));
      const digest = md.digest().getBytes();
      // Both signing directions agree with Node/OpenSSL on standard signatures.
      assert.equal(forgePublic.verify(digest, sign(algorithm, message, privateKey).toString('binary')), true);
      assert.equal(verify(algorithm, message, publicKey, Buffer.from(forgePrivate.sign(md), 'binary')), true);
      for (const parameters of [[], [node(a.Type.NULL, '')]]) {
        const signature = forgePrivate.sign(digestInfo(algorithm, digest, parameters), 'NONE');
        assert.equal(forgePublic.verify(digest, signature), true, `Valid ${algorithm} optional NULL`);
      }
      const badParameters = [
        [node(a.Type.NULL, ''), node(a.Type.OCTETSTRING, 'garbage'.repeat(12))],
        [node(a.Type.OCTETSTRING, 'garbage')],
        [node(a.Type.NULL, ''), node(a.Type.NULL, '')],
        [node(a.Type.NULL, ''), node(a.Type.OID, a.oidToDer(forge.pki.oids.sha256).getBytes())],
        [node(a.Type.SEQUENCE, [node(a.Type.NULL, '')], true)],
      ];
      for (const parameters of badParameters) {
        // Cryptographically signed malformed DigestInfo isolates the vulnerable
        // ASN.1 acceptance rule; it is not claimed as a private-key-free forgery.
        const signature = forgePrivate.sign(digestInfo(algorithm, digest, parameters), 'NONE');
        assert.equal(baselinePublic.verify(digest, signature), true, 'Unpatched control must reproduce the bug');
        assert.throws(() => forgePublic.verify(digest, signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
        assert.equal(verify(algorithm, message, publicKey, Buffer.from(signature, 'binary')), false);
      }
      const outerGarbage = forgePrivate.sign(digestInfo(algorithm, digest, [node(a.Type.NULL, '')], [node(a.Type.NULL, '')]), 'NONE');
      assert.throws(() => forgePublic.verify(digest, outerGarbage), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
      const wrongDigest = forge.md[algorithm].create().update('tampered message').digest().getBytes();
      assert.equal(forgePublic.verify(wrongDigest, forgePrivate.sign(md)), false);
    }
  }

  // Exercise the actual Expo consumers, not only node-forge in isolation.
  const expo = require('@expo/code-signing-certificates');
  const expoForge = createRequire(require.resolve('@expo/code-signing-certificates')).resolve('node-forge');
  const cliRequire = createRequire(require.resolve('@expo/cli', { paths: [join(mobileRoot, 'node_modules/expo')] }));
  for (const resolved of [expoForge, cliRequire.resolve('node-forge')]) {
    assert(paths.some((path) => resolved.startsWith(join(mobileRoot, path) + '/')), 'Expo must resolve a verified patched copy');
  }
  const keyPair = expo.convertKeyPairPEMToKeyPair({ privateKeyPEM: privateKey, publicKeyPEM: publicKey });
  const cert = expo.generateSelfSignedCodeSigningCertificate({ keyPair, commonName: 'Clover security test',
    validityNotBefore: new Date(Date.now() - 60000), validityNotAfter: new Date(Date.now() + 86400000) });
  const roundTrip = expo.convertCertificatePEMToCertificate(expo.convertCertificateToCertificatePEM(cert));
  expo.validateSelfSignedCertificate(roundTrip, keyPair);
  const signed = expo.signBufferRSASHA256AndVerify(keyPair.privateKey, roundTrip, message);
  assert.equal(verify('sha256', message, publicKey, Buffer.from(signed, 'base64')), true);
  const csr = expo.convertCSRPEMToCSR(expo.convertCSRToCSRPEM(expo.generateCSR(keyPair, 'Clover test CSR')));
  assert.equal(csr.verify(), true);
  const development = expo.generateDevelopmentCertificateFromCSR(keyPair.privateKey, roundTrip, csr,
    '00000000-0000-4000-8000-000000000000', '@clover/security-test');
  assert.equal(roundTrip.verify(development), true);

  // Install-time guarantees: exact version/source, idempotency, all copies checked.
  const fixtureRoot = join(temporary, 'install');
  cpSync(baselinePath, join(fixtureRoot, 'node_modules/node-forge'), { recursive: true });
  const lock = { packages: { 'node_modules/node-forge': { version: mitigation.version, integrity: mitigation.integrity } } };
  writeFileSync(join(fixtureRoot, 'package-lock.json'), JSON.stringify(lock));
  assert.throws(() => verifyForgePatch(fixtureRoot), /Unpatched/);
  applyForgePatch(fixtureRoot);
  applyForgePatch(fixtureRoot);
  const fixtureRsa = join(fixtureRoot, 'node_modules/node-forge/lib/rsa.js');
  writeFileSync(fixtureRsa, readFileSync(fixtureRsa, 'utf8') + '\n// unexpected change');
  assert.throws(() => verifyForgePatch(fixtureRoot), /changed RSA/);
  assert.throws(() => applyForgePatch(fixtureRoot), /unknown RSA/);
  lock.packages['node_modules/node-forge'].version = '1.4.1';
  writeFileSync(join(fixtureRoot, 'package-lock.json'), JSON.stringify(lock));
  assert.throws(() => verifyForgePatch(fixtureRoot), /Unexpected node-forge/);

  const report = {
    auditReportVersion: 2,
    metadata: { vulnerabilities: { high: 2, critical: 0 } },
    vulnerabilities: {
      expo: { severity: 'high', via: ['node-forge'] },
      'node-forge': { severity: 'high', nodes: paths,
        via: [{ name: 'node-forge', severity: 'high', url: mitigation.advisory }] },
    },
  };
  const now = Date.parse('2026-10-02T00:00:00Z');
  assert.equal(assessAudit(report, paths, now).mitigated, true);
  const newAdvisory = structuredClone(report);
  newAdvisory.vulnerabilities['node-forge'].via.push({ name: 'node-forge', severity: 'high', url: 'https://example.invalid/new-advisory' });
  assert.throws(() => assessAudit(newAdvisory, paths, now), /Unmitigated/);
  assert.throws(() => assessAudit(report, ['node_modules/other'], now), /Unmitigated/);
  assert.throws(() => assessAudit(report, [], now), /missing patch/);
  assert.throws(() => assessAudit(report, paths, Date.parse(mitigation.reviewBy)), /review is due/);
  const cycle = structuredClone(report);
  cycle.vulnerabilities.expo.via = ['expo'];
  assert.throws(() => assessAudit(cycle, paths, now), /Invalid npm audit/);
  const missing = structuredClone(report);
  delete missing.vulnerabilities['node-forge'];
  assert.throws(() => assessAudit(missing, paths, now), /Inconsistent/);
  assert.throws(() => assessAudit({ ...report, error: { code: 'ENOAUDIT' } }, paths, now), /Incomplete/);
  console.log('Security regressions passed: vulnerable control, malformed/valid RSA signatures, Expo signing/CSR/certificates, patch integrity and fail-closed audit policy.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
