import { prisma } from "./prisma";
import type { z } from "zod";
import type { adviserHistoryInput } from "./adviser-history";
export type ConversationRecord={id:string;title:string;messages:unknown;revision:number;updatedAt:Date};
export async function listAdviserConversations(userId:string,workspaceId:string) {
  return prisma.$queryRaw<Array<Omit<ConversationRecord,"messages">>>`SELECT "id", "title", "revision", "updatedAt" FROM "AdviserConversation" WHERE "userId"=${userId} AND "workspaceId"=${workspaceId} ORDER BY "updatedAt" DESC LIMIT 50`;
}
export async function loadAdviserConversation(userId:string,workspaceId:string,id:string) {
  const rows=await prisma.$queryRaw<ConversationRecord[]>`SELECT "id", "title", "messages", "revision", "updatedAt" FROM "AdviserConversation" WHERE "id"=${id} AND "userId"=${userId} AND "workspaceId"=${workspaceId}`;
  return rows[0]??null;
}
export async function saveAdviserConversation(userId:string,workspaceId:string,input:z.infer<typeof adviserHistoryInput>) {
  const title=input.messages.find(m=>m.role==="user")!.content.slice(0,80),payload=JSON.stringify(input.messages);
  const rows=input.revision===0
    ? await prisma.$queryRaw<Array<{revision:number}>>`INSERT INTO "AdviserConversation" ("id","userId","workspaceId","title","messages") VALUES (${input.id},${userId},${workspaceId},${title},${payload}::jsonb) ON CONFLICT ("id") DO NOTHING RETURNING "revision"`
    : await prisma.$queryRaw<Array<{revision:number}>>`UPDATE "AdviserConversation" SET "messages"=${payload}::jsonb,"title"=${title},"revision"="revision"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${input.id} AND "userId"=${userId} AND "workspaceId"=${workspaceId} AND "revision"=${input.revision} RETURNING "revision"`;
  return rows[0]?.revision??null;
}
