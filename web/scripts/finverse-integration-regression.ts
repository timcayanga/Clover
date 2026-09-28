import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getFinverseInstitutionCatalog,
  createFinverseRefresh,
  createFinverseLink,
  visibleFinverseBanks,
  decryptFinverseToken,
  encryptFinverseToken,
  hashFinverseState,
  isFinverseDataReady,
  normalizeFinverseAccount,
  normalizeFinverseTransaction,
} from "../lib/finverse";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const encrypted = encryptFinverseToken("sensitive-login-token", encryptionKey);
assert.notEqual(encrypted, "sensitive-login-token");
assert.equal(decryptFinverseToken(encrypted, encryptionKey), "sensitive-login-token");
const tampered = encrypted.split(".");
const ciphertext = Buffer.from(tampered[3], "base64url");
ciphertext[0] ^= 1;
tampered[3] = ciphertext.toString("base64url");
assert.throws(() => decryptFinverseToken(tampered.join("."), encryptionKey));
assert.equal(hashFinverseState("state"), hashFinverseState("state"));
assert.notEqual(hashFinverseState("state"), hashFinverseState("other-state"));
assert.equal(isFinverseDataReady("DATA_RETRIEVAL_COMPLETE"), true);
assert.equal(isFinverseDataReady("DATA_RETRIEVAL_IN_PROGRESS"), false);

const account = normalizeFinverseAccount({
  account_id: "acc_test",
  account_name: "Everyday Account",
  account_number_masked: "•••• 1234",
  account_currency: "PHP",
  account_type: { type: "DEPOSIT" },
  balance: { currency: "PHP", value: "812.34" },
}, "Test Bank");
assert.deepEqual(account, {
  name: "Everyday Account",
  institution: "Test Bank",
  accountNumber: "•••• 1234",
  type: "bank",
  currency: "PHP",
  balance: 812.34,
});

const debit = normalizeFinverseTransaction({
  transaction_id: "txn_debit",
  account_id: "acc_test",
  description: "Coffee",
  posted_date: "2026-08-14",
  amount: { currency: "PHP", value: -125.5 },
});
assert.equal(debit?.amount, 125.5);
assert.equal(debit?.type, "expense");
assert.equal(debit?.merchantRaw, "Coffee");

const credit = normalizeFinverseTransaction({
  transaction_id: "txn_credit",
  account_id: "acc_test",
  merchant_name: "Payroll",
  posted_date: "2026-08-14",
  amount: { currency: "PHP", value: 20_000 },
});
assert.equal(credit?.type, "income");
assert.equal(normalizeFinverseTransaction({ transaction_id: "bad", account_id: "acc_test", posted_date: "bad" }), null);

const finverseSource = readFileSync(new URL("../lib/finverse.ts", import.meta.url), "utf8");
assert.match(finverseSource, /ui_mode: "auto_redirect"/);
const callbackSource = readFileSync(new URL("../app/api/integrations/finverse/callback/route.ts", import.meta.url), "utf8");
assert.match(callbackSource, /export const OPTIONS/);
const connectButtonSource = readFileSync(new URL("../components/finverse-connect-button.tsx", import.meta.url), "utf8");
assert.match(connectButtonSource, /FINVERSE_MAX_POLL_ATTEMPTS = 30/);
assert.match(connectButtonSource, /await onSyncedRef\.current\?\.\(\)/);
assert.doesNotMatch(connectButtonSource, /window\.location\.assign\("\/accounts"\)/);
const accountsPageSource = readFileSync(new URL("../app/accounts/page.tsx", import.meta.url), "utf8");
assert.match(accountsPageSource, /FinversePendingAccounts/);
assert.doesNotMatch(accountsPageSource, />Connect bank</);
assert.doesNotMatch(accountsPageSource, />Sync bank</);

console.log("Finverse integration regression checks passed.");

const realBank = { institution_id: "bank-one", institution_name: "Standard Chartered", countries: ["PHL"], products_supported: ["ACCOUNTS", "TRANSACTIONS"], tags: ["real"], status: "SUPPORTED", login_actions: ["PRIVATE"] };
const testBank = { ...realBank, institution_id: "test", institution_name: "Test bank", tags: ["test"], status: "BETA" };
const bankCases = [realBank, testBank, {...realBank,institution_id:"other-country",countries:["SGP"]}, {...realBank,institution_id:"no-transactions",products_supported:["ACCOUNTS"]}, {...realBank,institution_id:"alpha",status:"ALPHA"}, null];
assert.deepEqual(visibleFinverseBanks(bankCases,"live"),[{id:"bank-one",name:"Standard Chartered",countries:["PHL"],status:"SUPPORTED"},{id:"other-country",name:"Standard Chartered",countries:["SGP"],status:"SUPPORTED"}]);
assert.deepEqual(visibleFinverseBanks(bankCases,"test"),[{id:"test",name:"Test bank",countries:["PHL"],status:"BETA"}]);
assert.deepEqual(visibleFinverseBanks([],"live"),[]);
assert.throws(()=>visibleFinverseBanks({error:"bad response"},"live"));
assert.deepEqual(visibleFinverseBanks([realBank,realBank],"live"),[{id:"bank-one",name:"Standard Chartered",countries:["PHL"],status:"SUPPORTED"}]);
import { mobileOperation } from "../lib/mobile-api-policy";
assert.equal(mobileOperation("GET",["finverse","institutions"]),"finverse-institutions");
assert.equal(mobileOperation("POST",["finverse","link"]),"finverse-link");
assert.equal(mobileOperation("POST",["finverse","sync"]),"finverse-sync");
assert.equal(mobileOperation("GET",["finverse","link"]),null);
assert.equal(mobileOperation("POST",["finverse","institutions"]),null);
assert.equal(mobileOperation("GET",["finverse","callback"]),null);
console.log("Finverse bank discovery: mode, region, products, status, deduplication and mobile method boundaries passed.");

import { finverseCountries } from "../../shared/finverse-countries";
assert.deepEqual(finverseCountries([]),[]);
assert.deepEqual(finverseCountries([{countries:["PHL","SGP"]}]).map(c=>c.name),["Philippines","Singapore"]);
const citi=visibleFinverseBanks([{...realBank,institution_id:"citi",institution_name:"Citibank",countries:["USA","GBR","HKG","SGP","PHL"]}],"live");
assert.deepEqual(citi[0].countries,["HKG","PHL","SGP"]);
assert.deepEqual(visibleFinverseBanks([{...realBank,countries:["USA","THA"]}],"live"),[]);
assert.deepEqual(finverseCountries([{countries:["GBR","NLD"]}]).map(c=>c.name),[]);
assert.deepEqual(visibleFinverseBanks([{...realBank,countries:["ZZZ"]}],"live"),[]);
assert.equal(mobileOperation("GET",["finverse","connections"]),"finverse-connections");
assert.equal(mobileOperation("POST",["finverse","connections"]),"finverse-connections");

async function refreshRequests() {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  Object.assign(process.env, { FINVERSE_ENABLED:"true", FINVERSE_CLIENT_ID:"test", FINVERSE_CLIENT_SECRET:"test", FINVERSE_REDIRECT_URI:"https://clover.test/callback", FINVERSE_TOKEN_ENCRYPTION_KEY:encryptionKey });
  const requests: {url:string;body:Record<string,unknown>}[]=[];
  globalThis.fetch = async (url,init) => {
    requests.push({url:String(url),body:JSON.parse(String(init?.body || "{}"))});
    return new Response(JSON.stringify(String(url).includes("customer/token")?{access_token:"customer"}:{link_url:"https://link.finverse.com/test"}),{status:200});
  };
  try {
    await createFinverseRefresh("existing-access","refresh.state","identity",true);
    assert(requests.at(-1)?.url.endsWith("/login_identity/refresh"));
    assert.equal(requests.at(-1)?.body.user_present,true);
    assert.deepEqual(requests.at(-1)?.body.link_customizations,{redirect_uri:"https://clover.test/callback",state:"refresh.state",ui_mode:"auto_redirect"});
    await createFinverseRefresh("existing-access","state","identity",false);
    assert(requests.at(-1)?.url.endsWith("/link/token"));
    assert.equal(requests.at(-1)?.body.login_identity_id,"identity","Relink must reuse the existing identity");
    await createFinverseLink("owner","state","sg-bank");
    assert.equal(requests.at(-1)?.body.institution_id,"sg-bank");
    assert.equal(requests.at(-1)?.body.institution_status,"supported beta");
    assert.deepEqual(requests.at(-1)?.body.products_requested,["ACCOUNTS","TRANSACTIONS","ACCOUNT_NUMBERS"]);
    assert.equal(requests.at(-1)?.body.countries,undefined,"Selected banks outside the Philippines must remain connectable");
    console.log("Finverse refresh, relink and multi-country requests passed.");
  } finally { globalThis.fetch=originalFetch; for(const key of Object.keys(process.env)) if(!(key in originalEnv)) delete process.env[key];Object.assign(process.env,originalEnv); }
}
refreshRequests().then(catalogCacheRequests).catch(error=>{console.error(error);process.exitCode=1;});

import { finverseBankPresentation } from "../lib/finverse-bank-presentation";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FINVERSE_COUNTRIES } from "../../shared/finverse-countries";
for (const country of FINVERSE_COUNTRIES) if (country.flagSrc) {
  assert(existsSync(fileURLToPath(new URL(`../../${country.flagSrc.slice(1)}`, import.meta.url))));
  assert(existsSync(fileURLToPath(new URL(`../../mobile/${country.flagSrc.slice(1)}`, import.meta.url))));
}
for (const [input, expected, country] of [["BDO Personal", "BDO", "PHL"], ["BPI (Business)", "BPI", "PHL"], ["Citibank Personal", "Citibank", "SGP"], ["CitiDirect", "Citibank", "SGP"], ["HSBC Business", "HSBC", "HKG"]]) {
  const display = finverseBankPresentation({name:input,countries:[country]});
  assert.equal(display.name, expected);
  assert(!display.logoUrl.includes("account-types"), `${input} must use a real bank logo`);
  assert.equal(display.logoUrls[country],display.logoUrl);
}
assert(finverseBankPresentation({name:"Citibank",countries:["SGP"]}).logoUrl.includes("singapore"));
assert(finverseBankPresentation({name:"HSBC",countries:["HKG"]}).logoUrl.includes("hong kong"));
console.log("Connect flags, full country names, short bank names and regional logos passed.");

import { summarizeFinverseCatalog } from "../lib/finverse";
const report = summarizeFinverseCatalog([realBank,{...realBank,institution_id:"beta",status:"BETA"},{...realBank,institution_id:"limited",products_supported:["ACCOUNTS"]}],"live");
assert.equal(report.length,3,"Catalogue must retain entries hidden by Connect filters");
assert.equal(report[0].shownInClover,true);
assert.equal(report[1].shownInClover,true,"Beta is available with disclosure");
assert(report[2].excludedReasons.includes("Missing Accounts or Transactions support"));
assert(!JSON.stringify(report).includes("PRIVATE"),"Never export institution login fields");

import { connectBankCountries } from "../../shared/finverse-countries";
import { groupFinverseBanks, finverseOptionLabel } from "../../shared/finverse-bank-options";
assert.deepEqual(connectBankCountries("Citibank", ["HKG", "THA", "PHL"]), ["HKG", "PHL"]);
const catalogue = [
  {...realBank,institution_id:"bpi",institution_name:"BPI - Personal"},
  {...realBank,institution_id:"bpi-business",institution_name:"BPI - Business",status:"BETA"},
  {...realBank,institution_id:"bdoph-business",institution_name:"BDO - Business",status:"ALPHA"},
  {...realBank,institution_id:"unionbank-ph",institution_name:"UnionBank - Personal",products_supported:["ACCOUNTS"]},
  {...realBank,institution_id:"citi-hk",institution_name:"Citibank (HK) - Personal",countries:["HKG"],status:"BETA"},
  {...realBank,institution_id:"uob-business",institution_name:"UOB - Business",countries:["SGP"]},
  {...realBank,institution_id:"uob-sg-business",institution_name:"UOB (SG) - Business",countries:["SGP"]},
  {...realBank,institution_id:"uob-sg",institution_name:"UOB (SG) - Personal",countries:["SGP"]},
];
const available=visibleFinverseBanks(catalogue,"live").map(bank=>({...bank,...finverseBankPresentation(bank)}));
assert.equal(available.length,6);
assert.deepEqual(finverseCountries(available).map(c=>c.name),["Hong Kong","Philippines","Singapore"]);
const ph=groupFinverseBanks(available,"PHL");assert.equal(ph.length,1);assert.equal(ph[0].name,"BPI");assert.equal(ph[0].accessLabel,"Personal & Business");assert.equal(ph[0].betaOnly,false);
assert.deepEqual(ph[0].options.map(o=>[o.id,o.status]),[["bpi","SUPPORTED"],["bpi-business","BETA"]]);
assert.equal(groupFinverseBanks(available,"HKG")[0].betaOnly,true);
const uob=groupFinverseBanks(available,"SGP")[0];assert.equal(uob.options.length,3);
assert.equal(new Set(uob.options.map(o=>finverseOptionLabel(o,uob.options))).size,3,"Different business portals must remain identifiable");
const unknown=[{id:"a",name:"Similar Bank",countries:["PHL"],logoUrl:""},{id:"b",name:"Similar Bank",countries:["PHL"],logoUrl:""}];
assert.equal(groupFinverseBanks(unknown,"PHL").length,2,"Unknown connectors must not be merged by name");
assert.equal(visibleFinverseBanks(catalogue,"test").length,0,"Test mode must not expose real banks");
console.log("API-driven coverage, Beta availability, brand grouping, portal identity and country eligibility passed.");

async function catalogCacheRequests() {
  const originalFetch=globalThis.fetch, originalNow=Date.now, originalEnv={...process.env};
  let now=originalNow(), calls=0, fail=false;
  Object.assign(process.env,{FINVERSE_ENABLED:"true",FINVERSE_CLIENT_ID:"cache-test",FINVERSE_CLIENT_SECRET:"secret",FINVERSE_REDIRECT_URI:"https://clover.test/callback",FINVERSE_TOKEN_ENCRYPTION_KEY:encryptionKey,FINVERSE_MODE:"test"});
  Date.now=()=>now;
  globalThis.fetch=async url=>{
    if(String(url).includes("customer/token"))return Response.json({access_token:"customer"});
    calls++;
    await new Promise(resolve=>setTimeout(resolve,10));
    return fail ? Response.json({message:"unavailable"},{status:503}) : Response.json([realBank,testBank]);
  };
  try {
    await Promise.all(Array.from({length:8},()=>getFinverseInstitutionCatalog()));
    assert.equal(calls,1,"Concurrent pickers share one provider request");
    await getFinverseInstitutionCatalog(); assert.equal(calls,1,"Warm catalogue is reused");
    now+=5*60_000+1;
    await getFinverseInstitutionCatalog(); assert.equal(calls,2,"Expired catalogue is refreshed");
    await getFinverseInstitutionCatalog({fresh:true}); assert.equal(calls,3,"Link validation and admin export bypass cached data");
    process.env.FINVERSE_MODE="live";
    assert.equal((await getFinverseInstitutionCatalog()).mode,"live"); assert.equal(calls,4,"Live and test catalogues are isolated");
    process.env.FINVERSE_CLIENT_ID="other-client";
    await getFinverseInstitutionCatalog(); assert.equal(calls,5,"Client configuration changes invalidate the cache");
    now+=5*60_000+1; fail=true;
    await assert.rejects(getFinverseInstitutionCatalog());
    fail=false; await getFinverseInstitutionCatalog(); assert.equal(calls,7,"Failed requests are retryable and never cached");
    process.env.FINVERSE_ENABLED="false";
    await assert.rejects(getFinverseInstitutionCatalog(),/FINVERSE_DISABLED/);
    console.log("Catalogue concurrency, TTL, fresh validation, configuration isolation and retry checks passed.");
  } finally {globalThis.fetch=originalFetch;Date.now=originalNow;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);}
}
