const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');
const {renderToStaticMarkup} = require('react-dom/server');
function load(file,dependencies,globals={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,Error,URL,Date,AbortController,setTimeout,clearTimeout,...globals,require:name=>{assert(name in dependencies,`Undeclared dependency: ${name}`);return dependencies[name]}});
  return exports;
}
(async()=>{
  let authorized=true, own=true, reads=0;
  const unauthorized = new Error('Private provider reason');
  const route=load('app/api/imports/recent/route.ts',{
    'next/server':{NextResponse:{json:(data,init={})=>({data,status:init.status??200,headers:init.headers})}},
    '@/lib/auth':{requireAuth:async()=>{if(!authorized)throw unauthorized;return {userId:'fictional-user'}}},
    '@/lib/workspace-access':{assertWorkspaceAccess:async(user,profile)=>{assert.equal(user,'fictional-user');assert.equal(profile,'profile');if(!own)throw new Error('WORKSPACE_NOT_FOUND')}},
    '@/lib/data-engine':{listImportFileSummariesCompat:async profile=>{reads++;assert.equal(profile,'profile');return [{id:'file',fileName:'Receipt.png',status:'done',transactionCount:2,accountName:'Savings',rawPayload:'private bytes',processingMessage:'internal error'}]}},
    '@/lib/transient-data':{isUnauthorizedDataError:error=>error===unauthorized},
  });
  authorized=false;assert.equal((await route.GET({url:'https://clover.ph/api/imports/recent?workspaceId=profile'})).status,401);assert.equal(reads,0);
  authorized=true;assert.equal((await route.GET({url:'https://clover.ph/api/imports/recent'})).status,400);assert.equal(reads,0);
  own=false;assert.equal((await route.GET({url:'https://clover.ph/api/imports/recent?workspaceId=profile'})).status,404);assert.equal(reads,0);
  own=true;const response=await route.GET({url:'https://clover.ph/api/imports/recent?workspaceId=profile'});assert.equal(response.status,200);assert.equal(reads,1);
  assert.equal(response.headers['Cache-Control'],'private, no-store');assert(!JSON.stringify(response.data).includes('private bytes'));assert(!JSON.stringify(response.data).includes('internal error'));
  assert(!fs.readFileSync(path.join(__dirname,'../app/api/imports/recent/route.ts'),'utf8').match(/recoverWorkspace|processPending|\.create\(|\.update\(/),'History never starts background recovery or writes');

  const row={id:'file',fileName:'<script>.png',status:'needs_review',createdAt:'2026-11-19T12:00:00Z',accountName:'QA Savings',transactionCount:2};
  let states, effects, writes, fetches, resolve;
  const deps={
    react:{useState:()=>{const value=states.shift();return [value,next=>writes.push(next)]},useEffect:fn=>effects.push(fn)},
    'react/jsx-runtime':jsx,
    '@/lib/workspace-data-sync':{subscribeWorkspaceDataChanges:()=>()=>{}},
  };
  const ui=load('components/recent-import-history.tsx',deps,{fetch:(url,options)=>{fetches.push({url,options});return new Promise(r=>resolve=r)}});
  function render(result,error=false){states=[result,error,0];effects=[];writes=[];fetches=[];return ui.RecentImportHistory({workspaceId:'profile'})}
  const html=renderToStaticMarkup(render({workspaceId:'profile',rows:[row]}));
  assert.match(html,/&lt;script&gt;\.png/);assert.match(html,/QA Savings · 2 transactions · Needs Review/);assert.match(html,/2026/);
  assert.equal(render({workspaceId:'other-profile',rows:[row]}),null,'Never display another Profile cache for one render');
  render({rows:[]});const cleanup=effects[0]();assert.equal(fetches.length,1);assert.equal(fetches[0].url,'/api/imports/recent?workspaceId=profile');
  cleanup();assert.equal(fetches[0].options.signal.aborted,true);resolve({ok:true,json:async()=>({importFiles:[row]})});await new Promise(r=>setImmediate(r));assert.equal(writes.length,1,'Only initial error reset; an unmounted request cannot publish rows');
  render({rows:[]});effects[0]();resolve({ok:false});await new Promise(r=>setImmediate(r));assert.equal(fetches.length,1,'No automatic retry loop');assert.equal(writes.at(-1),true);
  const transactions=fs.readFileSync(path.join(__dirname,'../app/transactions/page.tsx'),'utf8');
  assert.match(transactions,/transactions-mobile-bulk-toolbar[\s\S]{0,1600}onClick=\{editSelection\}>Edit<\/button>/);
  for(const file of ['dashboard-top-actions.tsx','add-entry-methods.tsx'])assert.match(fs.readFileSync(path.join(__dirname,'../components',file),'utf8'),/RecentImportHistory key=\{workspaceId\} workspaceId=\{workspaceId\}/);
  console.log('PASS recent imports: auth/Profile refusal before bounded read, metadata-only/no recovery, escaped compact rows, Profile isolation, abort/stale response, no retry loop and mobile Edit wiring.');
})().catch(error=>{console.error(error);process.exitCode=1});
