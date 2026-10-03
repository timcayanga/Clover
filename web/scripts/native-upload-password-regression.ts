import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import { nativeUploadRequest } from "../lib/native-upload-store";
import { getLocalImportObjectPath } from "../lib/s3";
import { listImportFileSummariesCompat } from "../lib/data-engine";

async function main() {
  assert.notEqual(process.env.NODE_ENV, "production", "This test only uses disposable local storage and stubbed database calls.");
  const storage = await mkdtemp(join(tmpdir(), "clover-password-test-"));
  const oldStorage = process.env.CLOVER_IMPORT_STORAGE_DIR;
  process.env.CLOVER_IMPORT_STORAGE_DIR = storage;
  const restore: Array<() => void> = [];
  const stub = (target: any, name: string, fn: (...args: any[]) => any) => {
    const previous = target[name]; restore.push(() => {target[name] = previous;}); target[name] = fn;
  };
  // PDF-shaped source is deliberately fictional. This tests the password transport,
  // acknowledgement and retry state machine, not the PDF reader itself.
  const bytes = Buffer.from("%PDF-1.7\nFictional protected statement transport fixture\n%%EOF");
  const id = randomUUID(), workspaceId = "qa-password-profile", userId = "qa-password-user";
  const row: any = {id, workspaceId, userId, state:"uploading", fileName:"fictional.pdf", contentType:"application/pdf",
    size:bytes.length, expiresAt:new Date(Date.now()+60000), parts:{"0":createHash("sha256").update(bytes).digest("hex")}, response:null};
  const saved: any = {status:"failed", processingPhase:"password_required", storageKey:"qa-protected-source.pdf"};
  let calls = 0, expectedPassword = "fictional-correct-password", lastPassword: unknown;
  stub(prisma.importFile, "findFirst", async (query) => {assert.deepEqual(query.where,{id,workspaceId}); return {...saved};});
  stub(prisma, "$queryRaw", async (parts: TemplateStringsArray, ...values: unknown[]) => {
    if(parts.join("").includes("information_schema")) return ["id","fileName","status","uploadedAt","storageKey"].map(column_name=>({column_name}));
    assert.deepEqual(values,[id,userId,workspaceId],"Transport ownership must be scoped to the signed-in user and Profile");
    return [{...row}];
  });
  stub(prisma, "$executeRaw", async (parts: TemplateStringsArray, ...values: any[]) => {
    const sql = parts.join("?");
    if (sql.includes("SET \"state\"='finalizing'")) { row.state="finalizing"; return 1; }
    if (sql.includes('"response"=')) { row.state="done"; row.response=JSON.parse(values[0]); return 1; }
    row.state = sql.includes("SET \"state\"='done'") ? "done" : values[0]; return 1;
  });
  stub(prisma,"$queryRawUnsafe",async (sql:string,...values:unknown[])=>{
    assert.deepEqual(values,[workspaceId]);assert.match(sql,/LIMIT 10$/);assert.match(sql,/WHERE "workspaceId" = \$1/);
    assert.ok(!sql.includes('"storageKey"'));assert.ok(!sql.includes('SELECT *'));
    return [{id,fileName:row.fileName,status:"failed"}];
  });
  const processor = async (request: Request) => {
    calls++; const form = await request.formData(); lastPassword=form.get("password");
    assert.equal(form.get("workspaceId"),workspaceId);
    assert.deepEqual(Buffer.from(await (form.get("file") as File).arrayBuffer()),bytes);
    if(lastPassword!==expectedPassword) return Response.json({error:"Statement password required",code:"IMPORT_PASSWORD_REQUIRED"},{status:422});
    return Response.json({ok:true,queued:true,canonicalImportFileId:id});
  };
  const complete = (password?: string) => nativeUploadRequest(new Request("https://staging.clover.ph/api/mobile/v1/uploads/test/complete",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(password ? {password} : {}),
  }),id,userId,workspaceId,"complete",processor);
  try {
    await writeFile(getLocalImportObjectPath(`native-upload-parts/${id}/0`),bytes);
    assert.equal((await complete()).status,422);assert.equal(row.state,"uploading");
    assert.equal((await complete("fictional-wrong-password")).status,422);assert.equal(row.state,"uploading");
    assert.equal((await complete(expectedPassword)).status,200);assert.equal(lastPassword,expectedPassword);assert.equal(row.state,"done");
    saved.status="processing";saved.processingPhase="reading_account_details";
    await complete(expectedPassword);assert.equal(calls,3,"Lost completion acknowledgements must not duplicate processing");
    // Simulate deferred reading requesting a password after temporary parts were cleaned.
    saved.status="failed";saved.processingPhase="password_required";
    await writeFile(getLocalImportObjectPath(saved.storageKey),bytes);
    assert.equal((await complete("fictional-wrong-password")).status,422);assert.equal(row.state,"done","Keep the durable source acknowledged after an invalid password");
    assert.equal((await complete(expectedPassword)).status,200);assert.equal(calls,5);
    row.state="finalizing";row.leaseUntil=new Date(Date.now()-1000);
    assert.equal((await complete(expectedPassword)).status,200);assert.equal(calls,6,"An interrupted password retry must reuse its acknowledged original after the lease expires");
    assert.ok(!JSON.stringify(row.response).includes(expectedPassword),"Passwords must never enter persisted response metadata");
    await listImportFileSummariesCompat(workspaceId);
    // A separate fictional image proves OCR survives the actual native multipart
    // handoff, not only the client transport mock above.
    const imageBytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKRAAAAAASUVORK5CYII=","base64");
    const evidence={version:1,source:"apple_vision",text:"COFFEE RECEIPT\n".repeat(200),pagesRead:1,totalPages:1,complete:true,durationMs:700};
    Object.assign(row,{state:"uploading",response:null,fileName:"receipt.png",contentType:"image/png",size:imageBytes.length,parts:{"0":createHash("sha256").update(imageBytes).digest("hex")}});
    saved.status="failed";saved.processingPhase="receipt_review_required";
    await writeFile(getLocalImportObjectPath(`native-upload-parts/${id}/0`),imageBytes);
    const body=JSON.stringify({deviceText:evidence});
    const imageResult=await nativeUploadRequest(new Request("https://staging.clover.ph/api/mobile/v1/uploads/test/complete",{
      method:"POST",headers:{"content-type":"application/json","content-length":String(Buffer.byteLength(body))},body,
    }),id,userId,workspaceId,"complete",async request=>{
      const form=await request.formData();
      assert.deepEqual(JSON.parse(String(form.get("deviceText"))),{...evidence,text:evidence.text.trim()});
      assert.deepEqual(Buffer.from(await (form.get("file") as File).arrayBuffer()),imageBytes);
      return Response.json({ok:true,canonicalImportFileId:id});
    });
    assert.equal(imageResult.status,200);
    console.log("PASS bounded device OCR reaches the receipt processor alongside the exact original image");
    console.log("PASS native password retries preserve source bytes, forward corrected passwords, reuse acknowledged sources and prevent duplicate completion; recent history is bounded and excludes private storage metadata");
  } finally {
    restore.reverse().forEach(fn=>fn());
    if(oldStorage===undefined)delete process.env.CLOVER_IMPORT_STORAGE_DIR;else process.env.CLOVER_IMPORT_STORAGE_DIR=oldStorage;
    await rm(storage,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
