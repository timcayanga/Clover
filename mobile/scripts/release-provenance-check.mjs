import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
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
  // EAS reads the config as ESM before installing project dependencies. Exercise
  // that loader shape rather than relying on local CommonJS config evaluation.
  const ts=createRequire(import.meta.url)("typescript");
  const config=ts.transpileModule(readFileSync(new URL("../app.config.ts",import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText;
  writeFileSync(join(dir,"mobile/app.config.mjs"),config);
  git("add",".");git("-c","user.name=QA","-c","user.email=qa@example.invalid","commit","-m","ESM store config fixture");
  const frozen=prepare(options);
  const envKeys=["CLOVER_IOS_BUNDLE_ID","CLOVER_ANDROID_PACKAGE_ID","EXPO_PUBLIC_API_URL"];
  const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  try {
    process.env.CLOVER_IOS_BUNDLE_ID="ph.clover.app";
    process.env.CLOVER_ANDROID_PACKAGE_ID="ph.clover.app";
    process.env.EXPO_PUBLIC_API_URL=options.apiUrl;
    const loaded=(await import(pathToFileURL(join(dir,"mobile/app.config.mjs")).href)).default;
    assert.equal(loaded.version,options.version);
    assert.equal(loaded.android.versionCode,options.build);
    assert.equal(loaded.extra.release.sourceCommit,frozen.sourceCommit);
    assert.equal(loaded.extra.release.sourceFingerprint,frozen.sourceFingerprint);
  } finally {
    for(const k of envKeys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];
  }
  console.log("PASS ESM store config loads frozen provenance before dependency installation");
  console.log("PASS source freeze rejects missing stamp, changed source, wrong environment, untracked source and stale checkout; identical source validates");
} finally {
  rmSync(dir,{recursive:true,force:true});
  for(const [name,value] of inheritedGit) { if(value===undefined) delete process.env[name]; else process.env[name]=value; }
}
