import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
const requirements=JSON.parse(fs.readFileSync(new URL("../../docs/releases/mobile-115-116-coverage.json",import.meta.url)));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"clover-coverage-gate-"));
try{
 const sourceCommit="a".repeat(40), sourceFingerprint="b".repeat(64), artifactSha256=crypto.createHash("sha256").update("test package").digest("hex");
 fs.writeFileSync(path.join(dir,"package"),"test package");fs.writeFileSync(path.join(dir,"proof"),"fixture QA evidence");
 const checks=platform=>Object.fromEntries(requirements.filter(row=>row.platforms.includes(platform)).map(row=>[row.id,{status:"passed",sourceCommit,artifactSha256,evidencePath:"proof"}]));
 const deployment={sourceCommit,deploymentId:"dpl_fixture",healthVerified:true,financialRecordChanges:false};
 const pkg=platform=>({sourceCommit,sourceFingerprint,version:"1.1.7",build:60,artifactPath:"package",artifactSha256,embeddedProvenanceVerified:true,checks:checks(platform)});
 const record={sourceCommit,deployments:{staging:deployment,production:deployment},packages:{ios:pkg("ios"),android:pkg("android")},webChecks:checks("web")};
 const run=value=>{fs.writeFileSync(path.join(dir,"record.json"),JSON.stringify(value));return spawnSync(process.execPath,[fileURLToPath(new URL("./verify-coverage.mjs",import.meta.url)),path.join(dir,"record.json")],{encoding:"utf8"});};
 assert.equal(run(record).status,0);
 let changed=structuredClone(record);changed.packages.android.sourceCommit="c".repeat(40);assert.notEqual(run(changed).status,0);
 changed=structuredClone(record);changed.packages.ios.checks.greeting.artifactSha256="d".repeat(64);assert.notEqual(run(changed).status,0);
 changed=structuredClone(record);delete changed.packages.android.checks.subtabs;assert.notEqual(run(changed).status,0);
 changed=structuredClone(record);changed.deployments.production.sourceCommit="e".repeat(40);assert.notEqual(run(changed).status,0);
 fs.writeFileSync(path.join(dir,"package"),"untested replacement package");assert.notEqual(run(record).status,0);
 console.log("PASS coverage gate accepts complete fixture and rejects mismatched checkout, prior-package QA, missing surface, stale production and changed package bytes");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
