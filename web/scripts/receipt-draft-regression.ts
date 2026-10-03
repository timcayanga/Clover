import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { loadReceiptDraft, saveReceiptDraft, validateReceiptDraftConfirmation } from "../lib/receipt-draft";
import { mobileOperation } from "../lib/mobile-api-policy";
const require = createRequire(import.meta.url);
const cache = require("next/cache");
const oldInvalidate = cache.revalidateTag;
cache.revalidateTag = () => {};
const restore: (() => void)[] = [];
function stub(target: any, name: string, fn: (...args: any[]) => any) {
  const original=target[name];target[name]=fn;restore.push(()=>{target[name]=original;});
}
const fields={merchant:"CAN COFFEE",date:"2026-09-11",amount:"425.00",currency:"PHP",accountId:"cash",categoryId:"food"};
const raw={receiptDetails:{merchant_raw:"OCR ORIGINAL",total:null,currency:null},receiptValidation:{issues:["amount"]},deviceText:{text:"PHOTO EVIDENCE"}};
function fixture() {return {id:"import",workspaceId:"profile",status:"failed",processingPhase:"receipt_review_required",documentImport:{id:"document",extractedPayload:{existing:"preserved"},receiptDocument:{id:"receipt",transactionId:null,accountId:null,merchantRaw:"OCR ORIGINAL",merchantClean:null,transactionDate:null,currency:"MIXED",total:null,confidence:40,rawPayload:structuredClone(raw)}}};}
let file:any=fixture(), transaction:any=null, control:string|undefined, created=0, audits:any[]=[], calls:string[]=[];
const account={id:"cash",name:"Cash",currency:"PHP"};
const category={id:"food",name:"Food & Dining"};
const tx:any={
  $queryRaw: async (strings:TemplateStringsArray)=>{assert.match(strings.join(""),/FOR UPDATE/);calls.push("row");return [{id:"import"}];},
  $executeRaw: async (strings:TemplateStringsArray,...values:unknown[])=>{assert.match(strings.join(""),/pg_advisory_xact_lock/);assert.equal(values[0],"receipt-confirm:import");calls.push("advisory");return 1;},
  importFile:{findFirst:async({where}:any)=>where.workspaceId==="profile"?file:null,update:async({data}:any)=>{Object.assign(file,data);return file;}},
  transaction:{findFirst:async()=>transaction,create:async({data}:any)=>{created++;transaction={id:"transaction",...data};return transaction;},count:async()=>0},
  account:{findFirst:async({where}:any)=>where.id===account.id&&where.workspaceId==="profile"?account:null},
  category:{findFirst:async({where}:any)=>where.id===category.id&&where.workspaceId==="profile"?category:null},
  documentImport:{update:async({data}:any)=>{Object.assign(file.documentImport,data);return file.documentImport;}},
  receiptDocument:{update:async({data}:any)=>{Object.assign(file.documentImport.receiptDocument,data);return file.documentImport.receiptDocument;}},
  auditLog:{findFirst:async()=>control?{metadata:{control}}:null,create:async({data}:any)=>{audits.push(data);return data;}},
};
let flight=Promise.resolve();
stub(prisma,"$transaction",(fn:any)=>{
  const next=flight.then(async()=>{
    const before=structuredClone({file,transaction,audits,created});
    try{return await fn(tx);}catch(error){({file,transaction,audits,created}=before);throw error;}
  });
  flight=next.catch(()=>{});return next;
});
stub(prisma.workspace,"findUnique",async()=>({userId:"owner",user:{planTier:"free",regionalPreferences:{baseCurrency:"PHP"},clerkUserId:"fictional"}}));
stub(prisma.importFile,"findFirst",async({where}:any)=>where.workspaceId==="profile"?file:null);
stub(prisma.account,"findMany",async()=>[account]);
stub(prisma.category,"findMany",async()=>[category]);
async function main(){
  assert.equal(validateReceiptDraftConfirmation({...fields,amount:"1,234.56"}).amount,"1234.56");
  for(const patch of [{date:"2026-02-30"},{date:""},{amount:"0"},{amount:"0.001"},{amount:"1e5"},{amount:"-1"},{amount:"1000000000000000"},{merchant:" "},{accountId:""},{currency:"MIXED"},{currency:"XXX"},{currency:"MIX"},{unexpected:"ignored"}]) assert.throws(()=>validateReceiptDraftConfirmation({...fields,...patch}));
  for(const method of ["GET","PATCH","POST"])assert.equal(mobileOperation(method,["imports","import","receipt-draft"]),"import-receipt-draft");
  assert.equal(mobileOperation("DELETE",["imports","import","receipt-draft"]),null);
  const preview=await loadReceiptDraft("import","profile");
  assert.equal(preview.fields.currency,"PHP");assert.equal(preview.fields.amount,"");assert.equal(preview.fields.date,"");
  assert.equal(preview.fields.accountId,"","Never suggest an arbitrary account just because its currency matches");
  file.documentImport.receiptDocument.currency="XXX";
  assert.equal((await loadReceiptDraft("import","profile")).fields.currency,"PHP");
  assert.equal(preview.canEdit,true);assert.equal(JSON.stringify(preview).includes("PHOTO EVIDENCE"),false);
  await assert.rejects(saveReceiptDraft("import","other","user",fields,true),/no receipt draft/);
  await assert.rejects(saveReceiptDraft("import","profile","user",{...fields,accountId:"foreign"},true),/Profile/);
  await assert.rejects(saveReceiptDraft("import","profile","user",{...fields,categoryId:"foreign"},true),/Profile/);
  await assert.rejects(saveReceiptDraft("import","profile","user",{...fields,currency:"USD"},true),/account in USD/);
  for(const state of ["paused","cancelled"]){control=state;await assert.rejects(saveReceiptDraft("import","profile","user",fields,true),/Resume|cancelled/);}
  control=undefined;
  file.processingPhase="reading_receipt";await assert.rejects(saveReceiptDraft("import","profile","user",fields,true),/still being processed/);file.processingPhase="receipt_review_required";
  await saveReceiptDraft("import","profile","user",{...fields,date:"",amount:""},false);
  assert.equal(created,0);assert.deepEqual(file.documentImport.receiptDocument.rawPayload,raw);
  assert.equal(file.documentImport.extractedPayload.existing,"preserved");
  calls=[];
  const saved=await Promise.all([saveReceiptDraft("import","profile","user",fields,true),saveReceiptDraft("import","profile","user",{...fields,amount:"999"},true)]);
  assert.equal(created,1);assert.equal(saved[0].transactionId,saved[1].transactionId);assert.equal(saved[1].duplicate,true);
  assert.deepEqual(calls,["row","advisory","row","advisory"]);
  assert.equal(transaction.amount,"425.00");assert.equal(transaction.reviewStatus,"edited");assert.equal(transaction.normalizedPayload.source,"manual_edit");
  assert.equal(transaction.importFileId,"import");assert.equal(file.status,"done");assert.equal(audits.length,1);
  assert.deepEqual(file.documentImport.receiptDocument.rawPayload,raw);
  await assert.rejects(saveReceiptDraft("import","profile","user",fields,false),/already saved/);
  transaction.deletedAt=new Date();
  assert.equal((await saveReceiptDraft("import","profile","user",fields,true)).duplicate,true);assert.equal(created,1,"A deleted confirmed transaction must not be recreated");
  console.log("PASS receipt draft missing-field validation, default currency, native routes, tenant/account/currency controls, pause/cancel, atomic confirmation replay, raw preservation and no confirmed overwrite");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{restore.reverse().forEach(fn=>fn());cache.revalidateTag=oldInvalidate;});
