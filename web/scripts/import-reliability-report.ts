// Explicit read-only diagnostic; no customer records, source text, names or
// amounts are written or printed. Usage: tsx scripts/import-reliability-report.ts FROM_ISO TO_ISO
import { Client, types } from "pg";
import { summarizeImportReliability, type ReliabilityFile } from "../lib/import-reliability";
async function main() {
  const [from,to] = process.argv.slice(2).map(s=>new Date(s));
  if (!from || !to || !Number.isFinite(+from) || !Number.isFinite(+to) || +to<=+from || +to-+from>93*86400_000) throw new Error("Provide a valid UTC ISO range, at most 93 days, with an exclusive end.");
  const observedAt = new Date();
  if (!process.env.DATABASE_URL) throw new Error("Explicit DATABASE_URL is required; no implicit application environment is loaded.");
  types.setTypeParser(1114,value=>new Date(value.replace(" ","T")+"Z"));
  const db = new Client({connectionString:process.env.DATABASE_URL,statement_timeout:60_000});
  await db.connect();
  let files: ReliabilityFile[];
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {rows} = await db.query<{id:string;uploadedAt:Date;availableAt:Date|null;attempts:ReliabilityFile["attempts"]}>(`
      SELECT f."id", f."uploadedAt",
        (SELECT MIN(t."createdAt") FROM "Transaction" t WHERE t."workspaceId"=f."workspaceId"
          AND (t."importFileId"=f."id" OR t."rawPayload"->>'sourceImportFileId'=f."id")) AS "availableAt",
        COALESCE((SELECT jsonb_agg(a."metadata" ORDER BY a."createdAt", a."id") FROM "AuditLog" a
          WHERE a."workspaceId"=f."workspaceId" AND a."entityId"=f."id" AND a."action"='import.processing_attempt'), '[]'::jsonb) AS attempts
      FROM "ImportFile" f WHERE f."uploadedAt">=$1 AND f."uploadedAt"<$2
      ORDER BY f."uploadedAt" LIMIT 20001`,[from,to]);
    if (rows.length>20000) throw new Error("Range exceeds 20,000 uploads; use a smaller interval. No partial report was emitted.");
    files = rows.map(r=>({id:r.id,uploadedAt:r.uploadedAt.toISOString(),hasTransactions:!!r.availableAt,
      availableAt:r.attempts.flatMap(a=>a.transactionObservedAt?[a.transactionObservedAt]:[]).sort()[0]??null,attempts:r.attempts}));
    await db.query("ROLLBACK");
  } finally { await db.end(); }
  console.log(JSON.stringify({from:from.toISOString(),toExclusive:to.toISOString(),observedAt:observedAt.toISOString(),scope:"All retained uploads in the selected database; includes staff/test activity unless separately segmented",...summarizeImportReliability(files,observedAt)},null,2));
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Report failed");process.exitCode=1;});
