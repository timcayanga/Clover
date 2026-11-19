import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
// Git hooks export repository-local variables. Clear them in this test process
// before `git init`, including calls made by the copied provenance helper.
// Otherwise the fixture can reinitialize the caller's real Git directory.
const gitVariables=execFileSync("git",["rev-parse","--local-env-vars"],{encoding:"utf8"}).trim().split("\n");
const inheritedGit=new Map(gitVariables.map(name=>[name,process.env[name]]));
for(const name of gitVariables) delete process.env[name];
const dir=mkdtempSync(join(tmpdir(),"clover-release-contract-"));
try {
  mkdirSync(join(dir,"mobile/scripts"),{recursive:true});mkdirSync(join(dir,"shared"));
  copyFileSync(new URL("./release-provenance.cjs",import.meta.url),join(dir,"mobile/scripts/release-provenance.cjs"));
  writeFileSync(join(dir,"mobile/.gitignore"),"release-source.json\n");
  writeFileSync(join(dir,"mobile/app.ts"),"export const current = 1;");
  writeFileSync(join(dir,"shared/source.ts"),"export const shared = 1;");
  const git=(...args)=>execFileSync("git",args,{cwd:dir,stdio:"pipe"});
  git("init");git("add",".");git("-c","user.name=QA","-c","user.email=qa@example.invalid","commit","-m","fixture");
  const {prepare,read}=createRequire(import.meta.url)(join(dir,"mobile/scripts/release-provenance.cjs"));
  const options={version:"1.1.7",build:60,apiUrl:"https://clover.ph"};
  assert.throws(()=>read(options.apiUrl),/require release-source/);
  const stamp=prepare(options);assert.equal(read(options.apiUrl).sourceCommit,stamp.sourceCommit);
  assert.throws(()=>read("https://staging.clover.ph"),/environment mismatch/);
  writeFileSync(join(dir,"mobile/app.ts"),"export const current = 2;");
  assert.throws(()=>read(options.apiUrl),/changed after/);assert.throws(()=>prepare(options),/Commit all/);
  git("checkout","--","mobile/app.ts");
  writeFileSync(join(dir,"shared/new.ts"),"export const missing=1;");
  assert.throws(()=>prepare(options),/Commit all/);assert.throws(()=>read(options.apiUrl),/uncommitted/);
  git("add",".");git("-c","user.name=QA","-c","user.email=qa@example.invalid","commit","-m","new source");
  assert.throws(()=>read(options.apiUrl),/Checkout differs/);
  assert.throws(()=>prepare({...options,build:0}),/explicit release/);
  prepare(options);assert.equal(read(options.apiUrl).build,60);
  console.log("PASS source freeze rejects missing stamp, changed source, wrong environment, untracked source and stale checkout; identical source validates");
} finally {
  rmSync(dir,{recursive:true,force:true});
  for(const [name,value] of inheritedGit) { if(value===undefined) delete process.env[name]; else process.env[name]=value; }
}
