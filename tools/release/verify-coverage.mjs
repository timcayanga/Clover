import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const requirements=JSON.parse(fs.readFileSync(new URL("../../docs/releases/mobile-115-116-coverage.json",import.meta.url)));
const file=process.argv[2];
if(!file) throw Error("Provide a release evidence JSON. Source presence or web deployment alone is not package verification.");
const record=JSON.parse(fs.readFileSync(file,"utf8"));
assert.match(record.sourceCommit,/^[a-f0-9]{40}$/);
for(const target of ["staging","production"]){
  const deployed=record.deployments?.[target];assert.equal(deployed?.sourceCommit,record.sourceCommit,`${target} must use the release commit`);
  assert.match(deployed?.deploymentId??"",/^dpl_/);assert.equal(deployed?.healthVerified,true,`${target} health is unverified`);
  assert.equal(deployed?.financialRecordChanges,false,`${target} must preserve confirmed records`);
}
let version,build,fingerprint;
for(const platform of ["ios","android"]){
 const pkg=record.packages?.[platform];assert.equal(pkg?.sourceCommit,record.sourceCommit,`${platform} package source is unverified`);
 assert.match(pkg?.sourceFingerprint??"",/^[a-f0-9]{64}$/);
 version??=pkg.version;build??=pkg.build;fingerprint??=pkg.sourceFingerprint;
 assert.equal(pkg.version,version);assert.equal(pkg.build,build);assert.equal(pkg.sourceFingerprint,fingerprint,"Both platforms must use the same frozen source");
 const bytes=fs.readFileSync(path.resolve(path.dirname(file),pkg.artifactPath));
 assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),pkg.artifactSha256,"Package bytes differ from tested artifact");
 assert.equal(pkg.embeddedProvenanceVerified,true,`${platform} embedded provenance not inspected`);
 for(const row of requirements.filter(row=>row.platforms.includes(platform))){
  const proof=pkg.checks?.[row.id];assert.equal(proof?.status,"passed",`${platform}: ${row.id} not verified`);
  assert.equal(proof?.artifactSha256,pkg.artifactSha256,`${platform}: ${row.id} tested another package`);
  assert(fs.statSync(path.resolve(path.dirname(file),proof.evidencePath)).size>0,`${platform}: missing QA evidence`);
 }
}
for(const row of requirements.filter(row=>row.platforms.includes("web"))){
 const proof=record.webChecks?.[row.id];assert.equal(proof?.status,"passed",`web: ${row.id} not verified`);
 assert.equal(proof.sourceCommit,record.sourceCommit);assert(fs.statSync(path.resolve(path.dirname(file),proof.evidencePath)).size>0);
}
console.log(`PASS release coverage for ${version} (${build}): staging, production and both exact packages`);
