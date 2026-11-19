/** Operator-only, bounded, READ ONLY export of one bank account. No tokens or bank credentials selected. */
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {writeFile} from 'node:fs/promises';
import type {BankValidationSnapshot,BankObservedRow} from '../../shared/bank-statement-validation';
function arg(name:string){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;}
async function main(){
 const workspaceId=arg('--workspace'),connectionId=arg('--connection'),sourceAccountId=arg('--account'),environment=arg('--environment'),out=arg('--out');
 if(!workspaceId||!connectionId||!sourceAccountId||!out||!['production','staging'].includes(environment??''))throw Error('Usage: --workspace ID --connection ID --account EXTERNAL_ID --environment production|staging --out PRIVATE.json');
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required for an explicit read-only export');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000})});try{
 const snapshot=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const [guard]=await tx.$queryRaw<{read_only:string}[]>`SELECT current_setting('transaction_read_only') AS read_only`;if(guard?.read_only!=='on')throw Error('READ_ONLY_REQUIRED');
  const [account]=await tx.$queryRaw<{account_id:string;bank_id:string;as_of_date:string|null;balance:unknown}[]>`SELECT a."accountId" AS account_id,c."institutionId" AS bank_id,to_char(c."lastSyncedAt",'YYYY-MM-DD') AS as_of_date,a."rawPayload"->'balance' AS balance FROM "FinverseAccountLink" a JOIN "FinverseConnection" c ON c.id=a."connectionId" JOIN "User" u ON u.id=c."userId" WHERE c.id=${connectionId} AND c."workspaceId"=${workspaceId} AND a."workspaceId"=${workspaceId} AND a."externalAccountId"=${sourceAccountId} AND u.environment=${environment} LIMIT 1`;
  if(!account?.account_id||!account.bank_id)throw Error('No mapped account in the requested environment');
  type Source={source_id:string;date:string|null;currency:string|null;amount:string|null;description:string|null;pending:string|null;ledger_id:string|null;ledger_account_id:string|null;ledger_date:string|null;ledger_amount:string|null;ledger_currency:string|null;ledger_type:string|null;ledger_description:string|null};
  // to_char deliberately avoids the host timezone parser for timestamp-without-time-zone ledger dates.
  const rows=await tx.$queryRaw<Source[]>`SELECT r."externalTransactionId" AS source_id,r."rawPayload"->>'posted_date' AS date,r."rawPayload"#>>'{amount,currency}' AS currency,r."rawPayload"#>>'{amount,value}' AS amount,COALESCE(r."rawPayload"->>'description',r."rawPayload"->>'merchant_name') AS description,r."rawPayload"->>'is_pending' AS pending,t.id AS ledger_id,t."accountId" AS ledger_account_id,to_char(t.date,'YYYY-MM-DD') AS ledger_date,t.amount::text AS ledger_amount,t.currency AS ledger_currency,t.type::text AS ledger_type,t."merchantRaw" AS ledger_description FROM "FinverseTransactionRecord" r JOIN "FinverseConnection" c ON c.id=r."connectionId" LEFT JOIN "Transaction" t ON t.id=COALESCE(r."transactionId",r."normalizedPayload"->>'reconciledTransactionId') AND t."workspaceId"=c."workspaceId" WHERE c.id=${connectionId} AND c."workspaceId"=${workspaceId} AND r."externalAccountId"=${sourceAccountId} ORDER BY r."externalTransactionId" LIMIT 50001`;
  if(rows.length>50000)throw Error('Export limit reached; completeness cannot be established from a truncated snapshot');
  const provider:BankObservedRow[]=rows.map(r=>({id:r.source_id,accountId:sourceAccountId,date:r.date,currency:r.currency,signedAmount:r.amount,description:r.description??'',status:r.pending==='true'?'pending':r.date?'booked':'unknown'}));
  const ledger:BankObservedRow[]=[];const seen=new Set<string>();for(const r of rows){if(!r.ledger_id||seen.has(r.ledger_id))continue;seen.add(r.ledger_id);ledger.push({id:r.ledger_id,accountId:r.ledger_account_id??'',date:r.ledger_date,currency:r.ledger_currency,signedAmount:r.ledger_amount===null?null:r.ledger_type==='expense'?'-'+r.ledger_amount:r.ledger_type==='income'?r.ledger_amount:null,description:r.ledger_description??'',status:r.pending==='true'?'pending':'booked'});}
  const raw=account.balance&&typeof account.balance==='object'?account.balance as {currency?:unknown;value?:unknown}:{};
  return {version:1,bankId:account.bank_id,accountId:sourceAccountId,ledgerAccountId:account.account_id,capturedAt:new Date().toISOString(),dataAsOfDate:null,coverage:{from:null,through:null,evidence:null},retrieval:'unknown',provider,ledger,links:rows.map(r=>({providerId:r.source_id,ledgerId:r.ledger_id})),balance:typeof raw.currency==='string'&&(typeof raw.value==='string'||typeof raw.value==='number')?{currency:raw.currency,amount:String(raw.value),asOfDate:null,cutoff:'unknown'}:null} satisfies BankValidationSnapshot;
 },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:30000});
 await writeFile(out,JSON.stringify(snapshot,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({readOnly:true,providerOccurrences:snapshot.provider.length,bankLinkedLedgerRows:snapshot.ledger.length,coverage:'unknown',retrieval:'unknown'}));
 }finally{await db.$disconnect();}
}
main().catch(error=>{const e=error&&typeof error==='object'?error as {code?:unknown;meta?:{code?:unknown}}:{};const code=[e.code,e.meta?.code].filter((c):c is string=>typeof c==='string'&&/^[A-Z0-9_]{2,30}$/.test(c)).join('/');console.error(error instanceof Error&&/^(Usage:|READ_ONLY|No mapped|Export limit|DATABASE_URL)/.test(error.message)?error.message:`Read-only snapshot export failed (${code||'UNKNOWN'}); inspect the private database configuration`);process.exitCode=1;});
