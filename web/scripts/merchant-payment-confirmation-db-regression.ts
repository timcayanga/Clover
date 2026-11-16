import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createRequire} from "node:module";
import {paymentConfirmation} from "./merchant-payment-confirmation-regression";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,process.env.CLOVER_QA_PARSER_PORT??"55441");
assert.equal(url.pathname,"/clover_migration_qa");assert(process.argv.includes("--execute"));
const require=createRequire(import.meta.url);
require("next/cache").revalidateTag=()=>{};require("next/server").after=()=>{};
let network=0;globalThis.fetch=async()=>{network++;throw Error("Payment confirmation QA prohibits providers");};
async function main(){
 const {prisma:db}=await import("../lib/prisma");
 const {processImportFileText,confirmImportFile}=await import("../workers/import-processor");
 const user=await db.user.create({data:{clerkUserId:randomUUID(),email:randomUUID()+"@example.invalid",environment:"staging",planTier:"pro",planTierLocked:true,regionalPreferences:{baseCurrency:"PHP"}}});
 try{
  const workspace=await db.workspace.create({data:{userId:user.id,name:"Merchant payment QA"}});
  const account=await db.account.create({data:{workspaceId:workspace.id,name:"Confirmed bank",type:"bank",currency:"PHP",balance:"321.09"}});
  const prior=await db.transaction.create({data:{workspaceId:workspace.id,accountId:account.id,date:new Date("2026-10-01"),amount:"22.25",currency:"PHP",type:"expense",merchantRaw:"Confirmed purchase",reviewStatus:"confirmed"}});
  const priorSnapshot=JSON.stringify([account,prior]);
  const file=await db.importFile.create({data:{workspaceId:workspace.id,fileName:"invented-payment-confirmation.png",fileType:"image/png",storageKey:"qa/"+randomUUID(),sourceFingerprint:createHash("sha256").update(paymentConfirmation).digest("hex")}});
  await processImportFileText(file.id,{text:paymentConfirmation,importMode:"statement",actorUserId:user.clerkUserId,skipVisualBackupParser:true});
  const rows=await db.transaction.findMany({where:{importFileId:file.id},include:{account:true}});
  assert.equal(rows.length,1,"A merchant debit screenshot is one expense, not a zero-row statement or split bill");
  assert.equal(rows[0].amount.toString(),"80");assert.equal(rows[0].currency,"PHP");assert.equal(rows[0].type,"expense");
  assert.equal(rows[0].date.toISOString().slice(0,10),"2026-10-29");
  assert.equal(rows[0].account.type,"cash","Established editable receipt default applies without inventing a bank issuer");
  assert.equal(rows[0].account.accountNumber,null,"Payee code 1122 cannot become a funding account suffix");
  assert.notEqual(rows[0].reviewStatus,"confirmed","Heuristic extraction is not a user-confirmed financial label");
  const document=await db.documentImport.findUniqueOrThrow({where:{importFileId:file.id},include:{receiptDocument:true}});
  assert(JSON.stringify(document.receiptDocument?.rawPayload).includes(JSON.stringify(paymentConfirmation).slice(1,-1)),"Exact source remains traceable");
  const saved=JSON.stringify(rows);
  await confirmImportFile(file.id);
  assert.equal(JSON.stringify(await db.transaction.findMany({where:{importFileId:file.id},include:{account:true}})),saved,"Repeated confirmation is a no-op for saved finance");
  assert.equal(JSON.stringify([await db.account.findUniqueOrThrow({where:{id:account.id}}),await db.transaction.findUniqueOrThrow({where:{id:prior.id}})]),priorSnapshot);
  assert.equal(await db.auditLog.count({where:{entityId:file.id,action:"import.parser_usage"}}),1);
  assert.equal(network,0,"A complete verified payment core does not spend AI allowance");
  console.log("Merchant payment worker: one exact pending-review expense, default currency, raw source, no invented bank/suffix, no model calls, repeat no-op and confirmed-finance preservation passed.");
 }finally{await db.user.delete({where:{id:user.id}});await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
