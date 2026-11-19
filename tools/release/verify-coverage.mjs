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
async function sha256(file) { const hash=crypto.createHash("sha256"); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }
let version,build,fingerprint;
for(const platform of ["ios","android"]){
 const pkg=record.packages?.[platform];assert.match(pkg?.version??"",/^\d+\.\d+\.\d+$/);
 assert(Number.isSafeInteger(pkg?.build)&&pkg.build>0,"Package build number is missing");
 assert.equal(pkg?.sourceCommit,record.sourceCommit,`${platform} package source is unverified`);
 assert.match(pkg?.sourceFingerprint??"",/^[a-f0-9]{64}$/);
 version??=pkg.version;build??=pkg.build;fingerprint??=pkg.sourceFingerprint;
 assert.equal(pkg.version,version);assert.equal(pkg.build,build);assert.equal(pkg.sourceFingerprint,fingerprint,"Both platforms must use the same frozen source");
 assert.equal(await sha256(path.resolve(path.dirname(file),pkg.artifactPath)),pkg.artifactSha256,"Package bytes differ from tested artifact");
 assert.equal(pkg.embeddedProvenanceVerified,true,`${platform} embedded provenance not inspected`);
 const inspection=JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),pkg.inspectionEvidencePath),"utf8"));
 assert.equal(inspection.provenanceVerified,true);assert.equal(inspection.artifactSha256,pkg.artifactSha256);
 assert.equal(inspection.sourceCommit,pkg.sourceCommit);assert.equal(inspection.sourceFingerprint,pkg.sourceFingerprint);
 assert.equal(inspection.version,pkg.version);assert.equal(inspection.build,pkg.build);
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
