import assert from "node:assert/strict";
import { mkdtemp, writeFile, access, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import { purgeNativeUploadsForUser, nativeUploadRequest } from "../lib/native-upload-store";
import { getLocalImportObjectPath } from "../lib/s3";
import { NATIVE_UPLOAD_PART_SIZE } from "../../shared/native-upload";
async function main() {
  assert.notEqual(process.env.NODE_ENV,"production");
  const storage=await mkdtemp(join(tmpdir(),"clover-erasure-test-"));
  const previous=process.env.CLOVER_IMPORT_STORAGE_DIR;process.env.CLOVER_IMPORT_STORAGE_DIR=storage;
  const original=prisma.$transaction;
  const raw=prisma.$executeRaw;
  const row={id:"synthetic-upload",userId:"user_synthetic",state:"uploading",size:NATIVE_UPLOAD_PART_SIZE+1,parts:{"0":"hash"},leaseUntil:null as Date|null};
  let fail=false,removed=false,owner:any={id:"local-user-id",clerkUserId:"user_synthetic",email:"same@example.test"},deleting:any=null;
  const execute=async(strings:TemplateStringsArray,...args:any[])=>{
    const sql=strings.join("?");
    if(sql.includes("DELETE")){assert.equal(row.state,"cancelled");assert.deepEqual(args,[row.id,row.userId]);removed=true;}
    if(sql.includes("UPDATE")){assert.deepEqual(args,[row.userId]);row.state="cancelled";}
    return 1;
  };
  (prisma as any).$executeRaw=execute;
  (prisma as any).$transaction=async(fn:any)=>fn({
    $executeRaw:execute,
    $queryRaw:async(strings:TemplateStringsArray,...args:any[])=>{
      const sql=strings.join("?");
      if(sql.includes("FOR UPDATE")){assert.deepEqual(args,[row.userId]);if(fail)throw Error("database unavailable");return [row];}
      if(sql.includes("COUNT")){assert.deepEqual(args,[row.userId]);return [{count:0n}];}
      if(sql.includes("INSERT")){assert.equal(args[1],row.userId);return [{...row,id:args[0],expiresAt:new Date(Date.now()+60000)}];}
      assert.match(sql,/WHERE "id"=/);return [];
    },
    user:{findUnique:async({where}:any)=>{assert.deepEqual(where,{clerkUserId:row.userId});return owner?.clerkUserId===where.clerkUserId?owner:null;}},clerkIdentityDeletion:{findUnique:async({where}:any)=>deleting?.clerkUserId===where.clerkUserId?deleting:null},
    importFile:{findUnique:async()=>null},
  });
  try {
    const chunk=(i:number)=>getLocalImportObjectPath(`native-upload-parts/${row.id}/${i}`);
    await writeFile(chunk(0),"synthetic-part");await writeFile(chunk(1),"unacknowledged-part");
    row.state="finalizing";row.leaseUntil=new Date(Date.now()+60000);
    await assert.rejects(()=>purgeNativeUploadsForUser(row.userId),/upload is finishing/);await access(chunk(0));assert.equal(removed,false);
    row.leaseUntil=new Date(0);await purgeNativeUploadsForUser(row.userId);
    assert.equal(removed,true);await assert.rejects(()=>access(chunk(0)));await assert.rejects(()=>access(chunk(1)));
    // An object removal failure retains the session for retry, including lost-ack chunks.
    removed=false;row.state="uploading";await mkdir(chunk(0));
    await assert.rejects(()=>purgeNativeUploadsForUser(row.userId));assert.equal(removed,false);
    await rm(chunk(0),{recursive:true});await purgeNativeUploadsForUser(row.userId);assert.equal(removed,true);
    fail=true;removed=false;await assert.rejects(()=>purgeNativeUploadsForUser(row.userId),/database unavailable/);assert.equal(removed,false);
    // New transports cannot start once identity deletion has been accepted.
    deleting={clerkUserId:"user_synthetic"};
    const request=()=>new Request("https://staging.clover.ph/upload",{method:"POST",body:JSON.stringify({name:"receipt.png",mimeType:"image/png",size:100})});
    await assert.rejects(()=>nativeUploadRequest(request(),"6afac50d-2565-49f0-a914-7c042794d75c",row.userId,"workspace","start"),/being deleted/);
    // Recreated email has a new Clerk ID and a distinct local ID. The old tombstone stays.
    fail=false;row.state="uploading";deleting={clerkUserId:"user_deleted_previous_account"};
    const fresh=await nativeUploadRequest(request(),"6afac50d-2565-49f0-a914-7c042794d75c",row.userId,"workspace","start");
    assert.equal(fresh.status,200);assert.equal((await fresh.json()).state,"uploading");
    assert.equal(deleting.clerkUserId,"user_deleted_previous_account");
    // Completing a deletion never makes that old identity reusable.
    deleting={clerkUserId:row.userId,completedAt:new Date()};
    await assert.rejects(()=>nativeUploadRequest(request(),"6afac50d-2565-49f0-a914-7c042794d75c",row.userId,"workspace","start"),/being deleted/);
    owner=null;deleting=null;
    await assert.rejects(()=>nativeUploadRequest(request(),"6afac50d-2565-49f0-a914-7c042794d75c",row.userId,"workspace","start"),/sign in again/);
    console.log("PASS upload erasure: owned row locks, active-finalizer protection, unacknowledged parts, retry after storage failure and blocked recreation");
  }finally{(prisma as any).$transaction=original;(prisma as any).$executeRaw=raw;if(previous===undefined)delete process.env.CLOVER_IMPORT_STORAGE_DIR;else process.env.CLOVER_IMPORT_STORAGE_DIR=previous;await rm(storage,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
