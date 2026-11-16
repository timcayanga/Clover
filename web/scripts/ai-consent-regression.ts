import assert from "node:assert/strict";
import { AI_CONSENT_VERSION, hasCurrentAiConsent } from "../../shared/ai-consent";
import { prisma } from "../lib/prisma";
import { getAiConsent, setAiConsent, maySendToCloudAi, aiConsentDecision } from "../lib/ai-consent";
import { parseAppPreferences, updateAppPreferences } from "../lib/app-preferences";
import { parseImportTextWithOpenAIFallback, transcribeImportImagesWithOpenAI } from "../lib/openai-import-parser";
async function main() {
 const grant={version:AI_CONSENT_VERSION,grantedAt:new Date().toISOString(),withdrawnAt:null};
 assert.equal(hasCurrentAiConsent(grant),true);
 for(const bad of [null,{},true,{...grant,version:"old"},{...grant,withdrawnAt:new Date().toISOString()},{...grant,grantedAt:"invalid"}]) assert.equal(hasCurrentAiConsent(bad),false);
 assert.equal(aiConsentDecision.safeParse({allow:true,version:"old"}).success,false);
 assert.equal(aiConsentDecision.safeParse({allow:true,version:AI_CONSENT_VERSION,grantedAt:"forged"}).success,false);
 let preferences:Record<string,unknown>={privacy:{adviserUsesContext:false},defaults:{defaultLandingPage:"accounts"}};
 const audits:unknown[]=[];
 const originalRead=prisma.user.findUniqueOrThrow, originalTx=prisma.$transaction, originalFetch=globalThis.fetch;
 let identity = "user_fixture";
 const read=async()=>({appPreferences:preferences,clerkUserId:identity});
 Object.assign(prisma.user,{findUniqueOrThrow:read});
 Object.assign(prisma,{$transaction:async(fn:Function)=>fn({$queryRaw:async()=>[],user:{findUniqueOrThrow:read,update:async({data}:any)=>{preferences=data.appPreferences;}},workspace:{findFirst:async()=>({id:"fixture"})},auditLog:{create:async({data}:any)=>audits.push(data)}})});
 let networkCalls=0;
 globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected external request");};
 try {
  assert.equal(await maySendToCloudAi(),false);
  assert.equal((await getAiConsent("fixture")).allowed,false);
  await setAiConsent("fixture",{allow:true,version:AI_CONSENT_VERSION});
  assert.equal(await maySendToCloudAi("fixture"),true);
  identity = "staging-guest";
  assert.equal(await maySendToCloudAi("fixture"),false);
  await assert.rejects(()=>setAiConsent("fixture",{allow:true,version:AI_CONSENT_VERSION}),/Sign in/);
  identity = "user_fixture";
  assert.equal(parseAppPreferences(preferences).privacy.adviserUsesContext,false);
  await updateAppPreferences("fixture",{defaults:{defaultLandingPage:"reports"}});
  assert.equal(await maySendToCloudAi("fixture"),true);
  assert.equal(parseAppPreferences(preferences).defaults.defaultLandingPage,"reports");
  await assert.rejects(()=>updateAppPreferences("fixture",{aiConsent:grant}));
  await setAiConsent("fixture",{allow:false,version:AI_CONSENT_VERSION});
  assert.equal(await maySendToCloudAi("fixture"),false);
  assert.equal(await parseImportTextWithOpenAIFallback({consentUserId:"fixture",text:"Sample receipt",detectedMetadata:null,parsedRows:[]}),null);
  assert.equal(await transcribeImportImagesWithOpenAI({consentUserId:"fixture",detectedMetadata:null,pageImages:[{page:1,dataUrl:"data:image/png;base64,AA=="}]}),null);
  assert.equal(networkCalls,0);
  assert.equal(audits.length,2);
  Object.assign(prisma.user,{findUniqueOrThrow:async()=>{throw new Error("DB unavailable");}});
  assert.equal(await maySendToCloudAi("fixture"),false);
 } finally {Object.assign(prisma.user,{findUniqueOrThrow:originalRead});Object.assign(prisma,{$transaction:originalTx});globalThis.fetch=originalFetch;}
 console.log("AI consent passed: version, grant/withdrawal, protected metadata, preserved preferences, audit, denied parser/OCR outbound calls and fail-closed database errors. No real data or external AI calls.");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
