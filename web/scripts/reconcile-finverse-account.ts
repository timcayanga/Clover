/** Explicit operator repair. Env is supplied externally; secrets never enter output. */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { writeFileSync } from 'node:fs';
import { matchingBankAccounts } from '../lib/finverse-matching';
import { planBankReconciliation } from '../lib/finverse-reconciliation';
const [sourceId,targetId,backupPath,mode] = process.argv.slice(2);
if (!sourceId || !targetId || !backupPath || sourceId===targetId) throw new Error('Supply source ID, target ID, secure backup path and optional --apply.');
const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
async function main() { try {
 await p.$transaction(async tx=>{
  const target=await tx.account.findUniqueOrThrow({where:{id:targetId}});
  const workspace=await tx.workspace.findUniqueOrThrow({where:{id:target.workspaceId}});
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${workspace.userId}`},0))`;
  const source=await tx.account.findUniqueOrThrow({where:{id:sourceId}});
  if(source.workspaceId!==target.workspaceId || source.source!=='finverse' || !matchingBankAccounts([target],source).length) throw new Error('Account identity guard failed.');
  const link=await tx.finverseAccountLink.findUniqueOrThrow({where:{accountId:sourceId}});
  if(await tx.finverseAccountLink.findUnique({where:{accountId:targetId}})) throw new Error('Target already has a connection.');
  const rows=await tx.transaction.findMany({where:{accountId:{in:[sourceId,targetId]}}});
  const sourceRows=rows.filter(t=>t.accountId===sourceId),targetRows=rows.filter(t=>t.accountId===targetId);
  const plan=planBankReconciliation(sourceRows,targetRows);
  const records=await tx.finverseTransactionRecord.findMany({where:{connectionId:link.connectionId,externalAccountId:link.externalAccountId}});
  // These are not expected for a pure bank-generated duplicate. Abort instead of cascading data.
  for (const model of ['importFile','documentImport','accountStatementCheckpoint','receiptDocument','investmentSnapshot','investmentHolding','recurringPattern','financialCommitment','investmentPurchase','investmentDividend','investmentPosition','investmentTrade','budget','circleInvestmentShare'] as const) {
    if(await (tx[model] as any).count({where:{accountId:sourceId}})) throw new Error(`Source has ${model} dependencies; extend repair explicitly.`);
  }
  const rules=await tx.accountRule.findMany({where:{accountId:sourceId}});
  const audit={source,target,link,rows,records,rules,plan};
  writeFileSync(backupPath,JSON.stringify(audit,null,2),{mode:0o600,flag:'wx'});
  console.log({mode:mode==='--apply'?'apply':'dry-run',sourceRows:sourceRows.length,preservedTargetRows:targetRows.length,newRows:plan.filter(x=>!x.needsReview).length,excludedForReview:plan.filter(x=>x.needsReview).length});
  if(mode!=='--apply') return;
  for(const item of plan) {
    const before=sourceRows.find(t=>t.id===item.id)!;
    await tx.transaction.update({where:{id:item.id},data:{accountId:targetId,...(item.needsReview?{isExcluded:true,reviewStatus:'pending_review',reviewPriority:'high',duplicateConfidence:60,reviewReasons:['finverse_reconciliation_overlap'],normalizedPayload:{...(before.normalizedPayload as object ?? {}),reconciliation:{sourceAccountId:sourceId,targetAccountId:targetId,candidateTransactionIds:item.candidates,reason:'Existing uploaded history may overlap; confirmed rows preserved.'}} as Prisma.InputJsonValue}:{})}});
  }
  await tx.accountRule.updateMany({where:{accountId:sourceId},data:{accountId:targetId}});
  await tx.finverseAccountLink.update({where:{id:link.id},data:{accountId:targetId,normalizedPayload:{...(link.normalizedPayload as object),reconciledFromAccountId:sourceId} as Prisma.InputJsonValue}});
  await tx.auditLog.create({data:{workspaceId:target.workspaceId,actorUserId:workspace.userId,action:'finverse_account_reconciled',entity:'Account',entityId:targetId,metadata:JSON.parse(JSON.stringify(audit))}});
  await tx.account.delete({where:{id:sourceId}});
  console.log('Reconciled. Target financial fields and all provider records preserved.');
 },{timeout:60000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
} finally {await p.$disconnect();}

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
