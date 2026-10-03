import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import { mobileRoot, hash } from './forge-security-patch.mjs';
import { verifyBracesPatch } from './braces-security-patch.mjs';
const paths=verifyBracesPatch();
const manifest=JSON.parse(readFileSync(new URL('./braces-security-manifest.json',import.meta.url),'utf8'));
for(const path of paths){
 const req=createRequire(join(mobileRoot,path,'index.js')),braces=req('./');
 assert.deepEqual(braces.expand('src/{app,lib}/*.{ts,tsx}'),['src/app/*.ts','src/app/*.tsx','src/lib/*.ts','src/lib/*.tsx']);
 assert.deepEqual(braces.expand('{1..3}'),['1','2','3']);
 const nested='{'.repeat(4000)+'a,b'+'}'.repeat(4000);
 for(const method of ['parse','compile','expand'])assert.throws(()=>braces[method](nested),/nesting exceeds/);
 let ast={type:'text',value:'x'};for(let i=0;i<500;i++)ast={type:'root',nodes:[ast]};
 for(const method of ['compile','expand','stringify'])assert.throws(()=>braces[method](ast),/nesting exceeds/);
 // Reconstruct the hash-verified vulnerable compile control, independently of the guard.
 let source=readFileSync(join(mobileRoot,path,'lib/compile.js'),'utf8');
 for(const [a,b] of manifest['compile.js'].replacements)source=source.split(b).join(a);
 assert.equal(hash(source),manifest['compile.js'].original);
 const mod={exports:{}};vm.runInNewContext(source,{module:mod,require:createRequire(join(mobileRoot,path,'lib/compile.js'))});
 let deep={type:'text',value:'x'};for(let i=0;i<12000;i++)deep={type:'root',nodes:[deep]};
 assert.throws(()=>mod.exports(deep),/call stack/);
}
console.log('PASS braces mitigation: vulnerable control, deep strings/ASTs, parser/walkers, ordinary Metro glob patterns and source integrity');
const { assessAudit } = await import('./production-audit-policy.mjs');
const { bracesAdvisory } = await import('./braces-security-patch.mjs');
const report={auditReportVersion:2,metadata:{vulnerabilities:{high:3,critical:0}},vulnerabilities:{
 metro:{severity:'high',via:['metro-config','braces']},'metro-config':{severity:'high',via:['metro']},
 braces:{severity:'high',nodes:paths,via:[{name:'braces',severity:'high',url:bracesAdvisory}]}
}};
assert.equal(assessAudit(report,['node_modules/node-forge'],Date.parse('2026-10-03'),paths).mitigated,true);
assert.throws(()=>assessAudit(report,['node_modules/node-forge'],Date.parse('2026-10-03'),[]),/Unmitigated/);
report.vulnerabilities.braces.via.push({name:'braces',severity:'critical',url:'https://example.invalid/new-advisory'});
assert.throws(()=>assessAudit(report,['node_modules/node-forge'],Date.parse('2026-10-03'),paths),/Unmitigated/);
console.log('PASS cyclic audit graph resolves real advisory leaves; missing patches and new advisories still block');
