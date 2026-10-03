import assert from "node:assert/strict";
import { build } from "esbuild";

async function main() {
  const fixture = `
    export const state = { file: {id:'import',workspaceId:'workspace',status:'processing',processingPhase:'reading_file',confirmedTransactionsCount:0,_count:{transactions:0}}, events:[], locked:false };
    const lookup=async()=>state.file;
    const log={findFirst:async({where})=>{if(where.workspaceId!=='workspace')throw Error('unscoped');return state.events.at(-1)||null;},create:async({data})=>{state.events.push(data);return data;}};
    const files={findUnique:lookup,update:async({data})=>Object.assign(state.file,data),updateMany:async({where,data})=>{if(where.confirmedTransactionsCount!==0||!where.transactions.none)throw Error('missing financial guard');if(!state.file.confirmedTransactionsCount&&!state.file._count.transactions)Object.assign(state.file,data);return {count:1};}};
    export const prisma={importFile:files,auditLog:log,$transaction:async run=>run({$queryRaw:async()=>{state.locked=true;return[];},importFile:{...files,findUnique:async()=>{if(!state.locked)throw Error('missing lock');return lookup();}},auditLog:log})};`;
  const bundled = await build({stdin:{contents:"export * from './lib/import-user-control'; export {state} from 'fixture';",resolveDir:process.cwd()}, bundle:true,platform:"node",format:"cjs",packages:"external",write:false, plugins:[{name:"isolated-control-store",setup(b){b.onResolve({filter:/^(fixture|@\/lib\/prisma)$/},()=>({path:"fixture",namespace:"mock"}));b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:fixture,loader:"js"}));}}]});
  const mod={exports:{} as any};new Function("module","exports",bundled.outputFiles[0].text)(mod,mod.exports);
  const {state,setImportUserControl,getImportUserControl,requireImportMayContinue,ImportUserControlError}=mod.exports;
  assert.equal(await getImportUserControl("import","workspace"),"running");
  await setImportUserControl("import","user","pause");assert.equal(state.events.length,1);
  state.file.processingPhase="reading_file";
  await assert.rejects(requireImportMayContinue("import","workspace"),(e:any)=>e instanceof ImportUserControlError&&e.control==="paused");
  assert.equal(state.file.processingPhase,"paused","an unrelated progress update cannot clear durable pause");
  await setImportUserControl("import","user","pause");assert.equal(state.events.length,1);assert.equal(state.file.processingPhase,"paused");
  const resumed=await setImportUserControl("import","user","resume");assert.equal(resumed.restart,true);await requireImportMayContinue("import","workspace");
  await setImportUserControl("import","user","cancel");
  await assert.rejects(requireImportMayContinue("import","workspace"),(e:any)=>e.control==="cancelled");
  assert.equal(state.file.processingPhase,"cancelled");
  await setImportUserControl("import","user","cancel");assert.equal(state.file.status,"failed","repeated cancellation cannot resurrect processing");
  await assert.rejects(setImportUserControl("import","user","resume"),/cancelled/);
  const before=state.events.length;state.file._count.transactions=1;
  await assert.rejects(setImportUserControl("import","user","cancel"),/already saved/);
  assert.equal(state.events.length,before,"cancellation never changes already-confirmed records");
  console.log("Import control checks pass: durable pause, acknowledged resume, cancellation, idempotency and confirmed-record protection.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
