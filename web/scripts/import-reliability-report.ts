// Explicit read-only diagnostic; no customer records, source text, names or
// amounts are written or printed. Usage: tsx scripts/import-reliability-report.ts FROM_ISO TO_ISO
import { Client, types } from "pg";
import { classifyAnalyticsIdentity } from "../lib/analytics-audience-rules";
import { summarizeImportReliability, type ReliabilityFile } from "../lib/import-reliability";
async function main() {
  const [from,to] = process.argv.slice(2,4).map(s=>new Date(s));
  const environment=process.argv[4] ?? "production";
  if (!["production","staging"].includes(environment)) throw new Error("Environment must be production or staging.");
  if (!from || !to || !Number.isFinite(+from) || !Number.isFinite(+to) || +to<=+from || +to-+from>93*86400_000) throw new Error("Provide a valid UTC ISO range, at most 93 days, with an exclusive end.");
  const observedAt = new Date();
  if (!process.env.DATABASE_URL) throw new Error("Explicit DATABASE_URL is required; no implicit application environment is loaded.");
  types.setTypeParser(1114,value=>new Date(value.replace(" ","T")+"Z"));
  const db = new Client({connectionString:process.env.DATABASE_URL,statement_timeout:60_000});
  await db.connect();
  const cohorts: Record<string,ReliabilityFile[]>={customer:[],staff:[],test:[]};
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {rows} = await db.query<{id:string;clerkUserId:string;email:string;isStaff:boolean;uploadedAt:Date;status:string;availableAt:Date|null;attempts:ReliabilityFile["attempts"]}>(`
      SELECT f."id", f."uploadedAt", f."status", u."clerkUserId", u."email",
        EXISTS(SELECT 1 FROM "AdminMember" am WHERE am."clerkUserId"=u."clerkUserId" AND am."active"=true) AS "isStaff",
        (SELECT MIN(t."createdAt") FROM "Transaction" t WHERE t."workspaceId"=f."workspaceId"
          AND (t."importFileId"=f."id" OR t."rawPayload"->>'sourceImportFileId'=f."id")) AS "availableAt",
        COALESCE((SELECT jsonb_agg(a."metadata" ORDER BY a."createdAt", a."id") FROM "AuditLog" a
          WHERE a."workspaceId"=f."workspaceId" AND a."entityId"=f."id" AND a."action"='import.processing_attempt'), '[]'::jsonb) AS attempts
      FROM "ImportFile" f JOIN "Workspace" w ON w."id"=f."workspaceId" JOIN "User" u ON u."id"=w."userId"
      WHERE f."uploadedAt">=$1 AND f."uploadedAt"<$2 AND u."environment"=$3
      ORDER BY f."uploadedAt" LIMIT 20001`,[from,to,environment]);
    if (rows.length>20000) throw new Error("Range exceeds 20,000 uploads; use a smaller interval. No partial report was emitted.");
    for (const r of rows) { const audience=classifyAnalyticsIdentity(r,r.isStaff).analytics_audience; cohorts[audience].push({id:r.id,uploadedAt:r.uploadedAt.toISOString(),hasTransactions:!!r.availableAt,
      completedWithoutMeasuredAttempt:r.status === "done" && r.attempts.length === 0,
      availableAt:r.attempts.flatMap(a=>a.transactionObservedAt?[a.transactionObservedAt]:[]).sort()[0]??null,attempts:r.attempts}); }
    await db.query("ROLLBACK");
  } finally { await db.end(); }
  console.log(JSON.stringify({from:from.toISOString(),toExclusive:to.toISOString(),observedAt:observedAt.toISOString(),environment,scope:"Retained customer uploads; known staff/test activity excluded and reported separately",excludedUploads:{staff:cohorts.staff.length,test:cohorts.test.length},...summarizeImportReliability(cohorts.customer,observedAt),diagnosticAllUploads:summarizeImportReliability(Object.values(cohorts).flat(),observedAt)},null,2));
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Report failed");process.exitCode=1;});
