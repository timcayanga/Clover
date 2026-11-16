import assert from 'node:assert/strict';
// Load through esbuild to exercise the shared telemetry dependency with Node.
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url), ts=require('typescript');
const fs=require('node:fs');
const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/startup-timing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Math,require:()=>({newTelemetryId:()=>String(Math.random()),telemetry(){}})});
let now=0;const events=[],timing=new exports.StartupTiming((event,p)=>events.push({event,...p}),()=>now);
timing.start('cold');timing.start('cold');now=500;timing.cancel('app_background');
now=500000;timing.foreground();now+=700;timing.visible();timing.visible();timing.foreground();
assert.deepEqual(events.map(e=>e.event),['flow_started','flow_canceled','flow_started','flow_completed']);
assert.equal(events.at(-1).duration_ms,700);assert.equal(events.at(-1).launch_kind,'resume');
assert.equal(new Set(events.map(e=>e.operation_id)).size,2);
timing.start('sign_in');timing.cancel('non_home_destination');timing.visible();timing.foreground();assert.equal(events.length,6);
timing.start('cold');timing.cancel('signed_out_entry');timing.foreground();assert.equal(events.length,8);
timing.start('retry');timing.failed('bootstrap');timing.failed('bootstrap');assert.equal(events.at(-1).event,'flow_failed');timing.foreground();timing.visible();assert.equal(events.at(-1).event,'flow_completed');
console.log('PASS startup timing: one terminal per attempt, suspension excluded, signed-out and non-Home destinations are not successes');
