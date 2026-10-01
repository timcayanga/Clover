import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { GET as listInvitations } from "../app/api/circle-invitations/route";
import { GET as viewInvitation, POST as acceptInvitation } from "../app/api/circle-invitations/[token]/route";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { POST } from "../app/api/mobile/v1/[...path]/route";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_qa")) throw Error("Use an isolated local QA database");
const identity = "connect-fixture-user", legacyId = "onboarding-legacy-fixture";
const email = "connect-fixture@example.invalid";
async function call(action: string, currency = "PHP", token = "connect-fixture-token") {
 return POST(new Request("https://clover.ph/api/mobile/v1/onboarding", {method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({experience:"comfortable",currency,locale:"en-PH",timeZone:"Asia/Manila"})}),{params:Promise.resolve({path:["onboarding"]})});
}
async function main() {
 await prisma.user.deleteMany({where:{clerkUserId:{in:[identity,legacyId,"onboarding-conflict-fixture"]}}});
 const legacy = await prisma.user.create({data:{clerkUserId:legacyId,email,environment:"staging",planTier:"premium",planTierLocked:true,onboardingCompletedAt:new Date(),workspaces:{create:{name:"Existing savings",type:"personal",accounts:{create:{name:"Savings",type:"bank",currency:"USD",balance:1234}}}}},include:{workspaces:{include:{accounts:true}}}});
 try {
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "User_email_key" ON "User"("email")');
  assert.equal((await call("skip")).status,503,"Reproduce legacy global email collision");
  for (const statement of readFileSync("prisma/migrations/20261002010000_user_email_environment/migration.sql","utf8").split(";").filter(s=>s.trim())) await prisma.$executeRawUnsafe(statement);
  assert.equal((await call("skip","PHP","bad")).status,401);
  assert.equal((await call("skip","XXX")).status,400);
  for (const action of ["skip","file","camera","library"]) {
   const r=await call(action);assert.equal(r.status,200,await r.text());
   const user=await prisma.user.findUniqueOrThrow({where:{clerkUserId:identity},include:{workspaces:{include:{accounts:true}}}});
   assert.notEqual(user.id,legacy.id);assert.equal(user.environment,"production");assert.equal(user.planTier,"free");assert.ok(user.onboardingCompletedAt);
   if (action === "skip") {
    const circle = await prisma.circle.create({data:{ownerUserId:legacy.id,name:"Legacy private Circle",type:"household"}});
    const token="a".repeat(48);
    await prisma.circleInvitation.create({data:{circleId:circle.id,invitedByUserId:legacy.id,email,token,role:"member",expiresAt:new Date(Date.now()+86400000)}});
    const request=new Request("https://clover.ph/api/circle-invitations/"+token,{method:"POST"});
    const context={params:Promise.resolve({token})};
    assert.equal((await viewInvitation(request,context)).status,404);
    assert.equal((await withMobileRequestContext(identity,request,()=>acceptInvitation(request,context))).status,404);
    const listed=await withMobileRequestContext(identity,request,()=>listInvitations());
    assert.equal(listed.status,200);assert.deepEqual((await listed.json()).invitations,[]);
    assert.equal(await prisma.circleMembership.count({where:{circleId:circle.id,userId:user.id}}),0);
    console.log("PASS matching email cannot expose or accept legacy staging Circle invitations");
   }
   assert.equal(user.workspaces.length,1);assert.equal(user.workspaces[0].accounts.length,1);assert.equal(user.workspaces[0].accounts[0].currency,"PHP");
   assert.equal((await call(action,"USD")).status,200);
   assert.equal((await prisma.account.findUniqueOrThrow({where:{id:user.workspaces[0].accounts[0].id}})).currency,"PHP");
   assert.deepEqual(await prisma.user.findUniqueOrThrow({where:{id:legacy.id},include:{workspaces:{include:{accounts:true}}}}),legacy);
   await prisma.user.delete({where:{id:user.id}});
   console.log(`PASS ${action}: separate production identity, starter Profile, retry and legacy financial records preserved`);
  }
  await prisma.user.create({data:{clerkUserId:"onboarding-conflict-fixture",email,environment:"production"}});
  const conflict=await call("skip");assert.equal(conflict.status,409);assert.match((await conflict.json()).error,/original sign-in/);
  assert.equal(await prisma.user.count({where:{clerkUserId:identity}}),0);
  console.log("PASS same-environment identity collision stays blocked without merging");
 } finally {
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "User_email_key"');
  await prisma.user.deleteMany({where:{clerkUserId:{in:[identity,legacyId,"onboarding-conflict-fixture"]}}});
 }
}
main().finally(()=>prisma.$disconnect());
