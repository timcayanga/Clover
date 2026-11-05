import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import { isPublicAnalyticsPath, namedAnalyticsAction } from "../../shared/analytics-measurement";
import { classifyAnalyticsIdentity, audienceProperties, measurementConfig } from "../lib/analytics-audience-rules";
import { scopeCustomerAnalyticsQuery } from "../lib/analytics-query-scope";
import { capturePostHogServerEvent } from "../lib/analytics-capture";

async function main() {
  for (const path of ["/", "/help", "/help/imports/receipts", "/guides/migrate", "/refund-policy", "/dispute-resolution", "/business-registration", "/features/accounts"]) assert.equal(isPublicAnalyticsPath(path),true,path);
  for (const path of ["/accounts", "/helpful", "/api/help/feedback", "/guides-private"]) assert.equal(isPublicAnalyticsPath(path),false,path);
  const origin="https://clover.ph";
  for(const [href,action] of [["/pricing","view_pricing"],["/sign-up?intent=pro","signup"],["/sign-in","login"],["/help/imports/receipts","view_help"],["https://apps.apple.com/ph/app/clover-personal-finance/id6811711508","download_ios"],["https://play.google.com/store/apps/details?id=ph.clover.app","download_android"],["https://www.youtube.com/@cloverpersonalfinance","social_youtube"]]) assert.equal(namedAnalyticsAction({href,origin}),action);
  assert.equal(namedAnalyticsAction({action:"signup",label:"PRIVATE",origin}),"signup");
  assert.equal(namedAnalyticsAction({action:"private-account",href:"https://other.invalid/sign-up?password=PRIVATE",label:"PRIVATE",origin}),null);
  assert.equal(namedAnalyticsAction({href:"https://apps.apple.com/app/id999",origin}),null);
  assert.equal(namedAnalyticsAction({href:"https://www.instagram.com/a-private-person/",origin}),null);
  assert.equal(namedAnalyticsAction({label:"Salary PRIVATE 12345",origin}),null);
  const regular={clerkUserId:"user_customer",email:"real@example.org"};
  assert.equal(classifyAnalyticsIdentity(regular).analytics_audience,"customer");
  assert.equal(classifyAnalyticsIdentity(regular,true).analytics_audience,"staff");
  assert.equal(classifyAnalyticsIdentity({...regular,email:"REVIEWER@clover.ph"}).analytics_audience,"test");
  assert.equal(classifyAnalyticsIdentity({...regular,email:"tigercayanga@gmail.com"}).analytics_audience,"test");
  assert.equal(classifyAnalyticsIdentity({...regular,email:"someone@placeholder.local"}).analytics_audience,"test");
  assert.equal(classifyAnalyticsIdentity({...regular,email:"reviewer@clover.ph.attacker.org"}).analytics_audience,"customer");
  process.env.ANALYTICS_TEST_USER_IDS="user_MixedCase";
  assert.ok(measurementConfig().testIds.includes("user_MixedCase"));
  assert.equal(classifyAnalyticsIdentity({...regular,clerkUserId:"user_MixedCase"}).analytics_excluded,true);
  delete process.env.ANALYTICS_TEST_USER_IDS;
  const query=await scopeCustomerAnalyticsQuery("SELECT event FROM events WHERE timestamp >= now() - INTERVAL 1 DAY", "production");
  assert.match(query,/person_id NOT IN \(SELECT id FROM persons/);
  assert.match(query,/event_source\) = 'server' OR NOT isLikelyBot\(properties\.\$raw_user_agent\)/);
  assert.match(query,/is_simulator/); assert.match(query,/analytics_excluded/);
  assert.ok(!query.includes("coalesce(properties.$raw_user_agent"),"must preserve PostHog SDK exception to empty-UA detection");

  // Execute actual audience resolver with read-only Prisma doubles; unknown lookup is not called a customer.
  let assigned=false, unavailable=false, writes=0;
  const audienceModule={exports:{} as any};
  const code=ts.transpileModule(readFileSync("lib/analytics-audience.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports:audienceModule.exports,setTimeout,clearTimeout,require:(id:string)=>{
    if(id==="react") return {cache:(fn:any)=>fn};
    if(id==="./analytics-audience-rules") return {audienceProperties,classifyAnalyticsIdentity,measurementConfig,syntheticSuffixes:["@placeholder.local","@example.com","@example.invalid"]};
    if(id==="./prisma") return {prisma:{user:{findUnique:async()=>{if(unavailable) throw Error("PRIVATE");return regular;},update:()=>{writes++;}},adminMember:{findUnique:async()=>({active:assigned}),findMany:async()=>assigned?[{clerkUserId:"user_staff"}]:[]}}};
    throw Error(id);
  }});
  assert.equal((await audienceModule.exports.getAnalyticsAudience("user_customer")).analytics_audience,"customer");
  assigned=true;assert.equal((await audienceModule.exports.getAnalyticsAudience("user_customer")).analytics_audience,"staff");
  const where=await audienceModule.exports.customerAnalyticsUserWhere("production");assert.equal(where.environment,"production");assert.ok(JSON.stringify(where).includes("user_staff"));
  unavailable=true;assert.equal((await audienceModule.exports.getAnalyticsAudience("user_unknown")).analytics_audience,"unknown");assert.equal(writes,0);

  // Existing web/native consumers identify from plan metadata: unknown must not replace known traits.
  let metadataAudience=audienceProperties("customer");
  const accessModule={exports:{} as any};
  const accessCode=ts.transpileModule(readFileSync("lib/pro-access.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(accessCode,{exports:accessModule.exports,Date,require:(id:string)=>{
    if(id==="./analytics-audience")return {getAnalyticsAudience:async()=>metadataAudience};
    if(id.includes("shared/signup-trial"))return {trialSnapshot:()=>({})};
    if(id.includes("shared/plan-analytics"))return {planContext:()=>({plan_tier:"free",is_paid_subscriber:false})};
    if(id==="@/lib/prisma")return {prisma:{user:{findUniqueOrThrow:async()=>({...regular,id:"synthetic-user",storeAccess:null,billingSubscription:null,proGrants:[]})}}};
    if(id==="@/lib/pro-access-rules")return {calculateProAccess:()=>({planTier:"free",source:"free",hasPaidSubscription:false})};
    if(id==="@/lib/user-limits")return {hasStagingProAccess:()=>false,hasStagingQaAccess:()=>false};
    return {};
  }});
  assert.equal((await accessModule.exports.getProAccess("synthetic-user")).analytics.analytics_audience,"customer");
  metadataAudience=audienceProperties("unknown");
  const unknownAccess=await accessModule.exports.getProAccess("synthetic-user");
  assert.equal(unknownAccess.planTier,"free");assert.equal(unknownAccess.analytics.analytics_audience,undefined);assert.equal(unknownAccess.analytics.analytics_excluded,undefined);
  const captureCode=ts.transpileModule(readFileSync("lib/analytics-capture.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  assert.throws(()=>vm.runInNewContext(captureCode,{exports:{},window:{},require:()=>({})}),/cannot run in a browser/);
  // Use the real pinned Node SDK and real transport; intercept every network request.
  const previousFetch=global.fetch, previousKey=process.env.NEXT_PUBLIC_POSTHOG_KEY;
  process.env.NEXT_PUBLIC_POSTHOG_KEY="synthetic-ingestion-key";
  const requests:any[]=[];
  global.fetch=async (_input,init)=>{const body=init?.body; const bytes=typeof body === "string" ? Buffer.from(body) : Buffer.from(body as Uint8Array); requests.push(JSON.parse(bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes).toString() : bytes.toString()));return Response.json({status:1});};
  try {
    await capturePostHogServerEvent("import_processing_completed","user_customer",{...audienceProperties("customer"),event_source:"web",imported_rows:2});
    assert.equal(requests.length,1,"no flags/retry/extra identify requests");
    const body=requests[0], event=body.batch?.[0] ?? body;
    assert.equal(event.properties.$lib,"posthog-node");
    assert.equal(event.properties.event_source,"server");
    assert.equal(event.properties.$geoip_disable,true,"do not attribute Vercel's location to the customer");
    assert.equal(event.properties.$set.analytics_audience,"customer");
    assert.doesNotMatch(JSON.stringify(requests),/real@example.org|PRIVATE/);
    await capturePostHogServerEvent("plan_changed","user_customer",{...audienceProperties("unknown"),plan_tier:"free"});
    const planEvent=requests.at(-1).batch?.[0] ?? requests.at(-1);
    assert.equal(planEvent.properties.analytics_audience,"unknown","raw outcome remains diagnosable");
    assert.equal(planEvent.properties.$set.plan_tier,"free");
    assert.equal(planEvent.properties.$set.analytics_audience,undefined,"plan changes must not overwrite a known person with an unknown audience");
    assert.equal(planEvent.properties.$set.analytics_excluded,undefined);
    const previousWarn=console.warn, warnings:unknown[][]=[];
    let failures=0;
    global.fetch=async()=>{failures++;return new Response("PRIVATE provider failure",{status:503});};
    console.warn=(...args:unknown[])=>{warnings.push(args);};
    try { await capturePostHogServerEvent("import_failed","user_customer",audienceProperties("customer")); }
    finally { console.warn=previousWarn; }
    assert.equal(failures,1,"ambiguous analytics delivery must not replay product work or retry in capture");
    assert.equal(warnings.length,1);assert.doesNotMatch(JSON.stringify(warnings),/PRIVATE|synthetic-ingestion-key/);
  } finally {global.fetch=previousFetch;if(previousKey===undefined)delete process.env.NEXT_PUBLIC_POSTHOG_KEY;else process.env.NEXT_PUBLIC_POSTHOG_KEY=previousKey;}


  // The actual read-only import report must keep staff/test out of customer denominators.
  const reportOutput:string[]=[], statements:string[]=[];
  let reportEnded=false;
  const summarize=await import("../lib/import-reliability");
  const reportCode=ts.transpileModule(readFileSync("scripts/import-reliability-report.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  class ReportDb {
    async connect(){}
    async end(){reportEnded=true;}
    async query(sql:string,params?:unknown[]){
      statements.push(sql);
      if(!sql.includes('SELECT f."id"'))return {rows:[]};
      assert.equal(params?.[2],"production");assert.match(sql,/u\."environment"=\$3/);
      return {rows:[{...regular,id:"synthetic-customer",uploadedAt:new Date("2026-11-01T00:00:00Z"),status:"failed",availableAt:null,attempts:[],isStaff:false},{...regular,email:"reviewer@clover.ph",id:"synthetic-reviewer",uploadedAt:new Date("2026-11-01T00:00:00Z"),status:"failed",availableAt:null,attempts:[],isStaff:false},{...regular,id:"synthetic-staff",uploadedAt:new Date("2026-11-01T00:00:00Z"),status:"failed",availableAt:null,attempts:[],isStaff:true}]};
    }
  }
  vm.runInNewContext(reportCode,{exports:{},Date,process:{argv:["node","report","2026-11-01T00:00:00Z","2026-11-02T00:00:00Z"],env:{DATABASE_URL:"synthetic"}},console:{log:(s:string)=>reportOutput.push(s),error:(s:string)=>{throw Error(s);}},require:(id:string)=>{
    if(id==="pg")return {Client:ReportDb,types:{setTypeParser:()=>{}}};
    if(id==="../lib/analytics-audience-rules")return {classifyAnalyticsIdentity};
    if(id==="../lib/import-reliability")return summarize;
    throw Error(id);
  }});
  for(let i=0;i<20 && !reportOutput.length;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(reportEnded);assert.equal(reportOutput.length,1);
  const report=JSON.parse(reportOutput[0]);assert.equal(report.uploadedFiles,1);assert.deepEqual(report.excludedUploads,{staff:1,test:1});assert.equal(report.diagnosticAllUploads.uploadedFiles,3);
  assert.ok(statements[0].includes("READ ONLY"));assert.equal(statements.at(-1),"ROLLBACK");assert.doesNotMatch(statements.join("\n"),/\b(UPDATE|INSERT|DELETE)\b/);
  assert.doesNotMatch(reportOutput[0],/real@example.org|synthetic-customer|user_customer/);
  // Execute the actual browser collectors with a DOM/event double, not a second copy of the logic.
  let pathname="/help/imports/receipts", now=0;
  const browserEvents:any[]=[], effects:Array<()=>void>=[], listeners=new Map<string,Function>();
  class ElementDouble {
    constructor(public attrs:Record<string,string>={},public tagName="A",public textContent=""){}
    getAttribute(key:string){return this.attrs[key] ?? null;}
    closest(selector:string){if(selector.startsWith("a,button"))return this;if(selector==="[data-analytics-section]")return new ElementDouble({"data-analytics-section":"hero"});return null;}
  }
  const article=new ElementDouble({"data-analytics-resource":"/help/imports/receipts"});
  const doc={body:{dataset:{environment:"production"}},referrer:"",visibilityState:"visible",scrollingElement:{scrollHeight:1000,clientHeight:600,scrollTop:0},querySelector:()=>article,addEventListener:(key:string,fn:Function)=>listeners.set(key,fn),removeEventListener:(key:string)=>listeners.delete(key)};
  const location={origin:"https://clover.ph",pathname,hostname:"clover.ph",search:"?private=PRIVATE"};
  const browserModule={exports:{} as any};
  const browserSource=ts.transpileModule(readFileSync("components/posthog-analytics.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const sharedAnalytics=await import("../../shared/analytics");
  const measurement=await import("../../shared/analytics-measurement");
  vm.runInNewContext(browserSource+"\nexports.runViews=PostHogPageViews;exports.runBehavior=PostHogBehaviorSignals;",{exports:browserModule.exports,Element:ElementDouble,URL,URLSearchParams,document:doc,navigator:{userAgent:"iPhone Safari",maxTouchPoints:1},performance:{now:()=>now},window:{location,innerWidth:390,innerHeight:844,localStorage:{getItem:()=>null,setItem:()=>{}},posthog:{capture:(event:string,properties:any)=>browserEvents.push({event,properties})},addEventListener:()=>{},removeEventListener:()=>{}},require:(id:string)=>{
    if(id==="react")return {useEffect:(fn:()=>any)=>{const cleanup=fn();if(cleanup)effects.push(cleanup);}};
    if(id==="next/navigation")return {usePathname:()=>pathname};
    if(id.includes("shared/analytics-measurement"))return measurement;
    if(id.includes("shared/analytics"))return sharedAnalytics;
    if(id.includes("shared/plan-analytics"))return {normalizePlanAnalytics:(p:any)=>p};
    if(id==="@/lib/analytics")return {shouldTrackAnalytics:()=>true,getAnalyticsEpochProperties:()=>({}),scopeAnalyticsDistinctId:(x:string)=>x};
    if(id==="@/lib/responsive-layout")return {getCloverViewportLayout:()=>"mobile"};
    return {};
  }});
  browserModule.exports.runViews();browserModule.exports.runBehavior();
  assert.equal(browserEvents[0].properties.is_public_website,true);
  assert.equal(browserEvents[0].properties.public_resource_path,"/help/imports/receipts");
  listeners.get("click")!({target:new ElementDouble({"data-analytics-action":"signup","aria-label":"PRIVATE"},"BUTTON"),clientX:20,clientY:20});
  assert.equal(browserEvents.at(-1).properties.action,"signup");assert.equal(browserEvents.at(-1).properties.cta_placement,"hero");
  listeners.get("click")!({target:new ElementDouble({"href":"https://play.google.com/store/apps/details?id=ph.clover.app"}),clientX:30,clientY:20});
  assert.equal(browserEvents.at(-1).properties.action,"download_android");
  listeners.get("click")!({target:new ElementDouble({"href":"/pricing"}),clientX:30,clientY:20});
  assert.equal(browserEvents.at(-1).properties.action,"view_pricing","paid-card pricing navigation is not a signup");
  listeners.get("click")!({target:new ElementDouble({},"BUTTON","Save"),clientX:30,clientY:20});
  assert.equal(browserEvents.at(-1).properties.action,"save","preserve existing fixed-vocabulary actions");
  listeners.get("click")!({target:new ElementDouble({},"BUTTON","PRIVATE FINANCIAL LABEL"),clientX:30,clientY:20});
  assert.equal(browserEvents.at(-1).properties.action,"other");
  listeners.get("click")!({target:new ElementDouble({"aria-label":"PRIVATE 12345"},"BUTTON"),clientX:30,clientY:20});
  assert.equal(browserEvents.at(-1).properties.action,"other");
  pathname="/accounts";location.pathname=pathname;now=1000;effects.forEach(fn=>fn());
  assert.equal(browserEvents.at(-1).properties.public_resource_path,"/help/imports/receipts","cleanup must retain the old page, not attribute it to the next one");
  assert.doesNotMatch(JSON.stringify(browserEvents),/PRIVATE|12345|private=/);
  console.log("PASS measurement gaps: public resources, named/privacy-safe CTAs, staff/test/customer boundaries, current-person historical filters, simulator/bot separation, read-only audience lookup and real Node SDK provenance.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
