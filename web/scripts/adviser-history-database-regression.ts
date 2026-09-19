// This suite uses a disposable local database, never Clover staging data.
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listAdviserConversations, loadAdviserConversation, saveAdviserConversation } from "../lib/adviser-history-store";
async function main(){
  assert.equal(process.env.DATABASE_URL,"postgresql://clover_test@127.0.0.1:56544/clover_adviser");
  await prisma.$executeRaw`INSERT INTO "User" (id) VALUES ('owner'),('other')`;
  await prisma.$executeRaw`INSERT INTO "Workspace" (id) VALUES ('profile'),('other-profile')`;
  const input={id:"b6278059-5b57-468b-9e86-94e4c9cf12fe",revision:0,messages:[{role:"user" as const,content:"Show my spending"},{role:"assistant" as const,content:"Your report"}]};
  assert.equal(await saveAdviserConversation("owner","profile",input),1);
  assert.equal((await listAdviserConversations("owner","profile")).length,1);
  assert.equal((await listAdviserConversations("other","profile")).length,0);
  assert.equal(await loadAdviserConversation("owner","other-profile",input.id),null);
  assert.equal(await loadAdviserConversation("other","profile",input.id),null);
  assert.equal(await saveAdviserConversation("other","profile",{...input,revision:1}),null);
  assert.equal(await saveAdviserConversation("owner","other-profile",{...input,revision:1}),null);
  assert.equal(await saveAdviserConversation("owner","profile",{...input,revision:1}),2);
  assert.equal(await saveAdviserConversation("owner","profile",{...input,revision:1}),null,"Stale revisions cannot overwrite the latest chat");
  assert.equal(await saveAdviserConversation("other","other-profile",input),null,"Reusing another chat ID cannot take it over");
  const permissions=await prisma.$queryRaw<Array<{allowed:boolean}>>`SELECT has_table_privilege('anon','"AdviserConversation"','SELECT') AS allowed`;
  assert.equal(permissions[0].allowed,false);
  await prisma.$executeRaw`DELETE FROM "Workspace" WHERE id='profile'`;
  assert.equal(await loadAdviserConversation("owner","profile",input.id),null,"Deleting a Profile also removes its saved conversations");
  console.log("PASS history create/load, user and Profile isolation, optimistic conflicts, restricted DB access and deletion cascade");
}
main().finally(()=>prisma.$disconnect());
