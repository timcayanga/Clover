import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/admin";
import { getCurrentUserEnvironment } from "@/lib/user-environment";
import { downloadImportObject } from "@/lib/import-storage.server";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try {const {userId}=await auth();if(!userId)return new Response("Unauthorized",{status:401});
 const item=await prisma.switchEvidence.findUnique({where:{id:new URL(request.url).searchParams.get("id")??""},include:{application:{include:{user:{select:{clerkUserId:true}},campaign:true}}}});
 if(!item||item.purgedAt||item.application.campaign.environment!==getCurrentUserEnvironment())return new Response("Not found",{status:404});
 if(item.application.user.clerkUserId!==userId)await requireAdminAuth("support");
 const bytes=await downloadImportObject(item.storageKey);
 return new Response(Buffer.from(bytes),{headers:{"Content-Type":item.mime,"Cache-Control":"private, no-store","Content-Disposition":`inline; filename="receipt.${item.mime==="application/pdf"?"pdf":item.mime==="image/png"?"png":"jpg"}"`,"Content-Security-Policy":"sandbox","X-Content-Type-Options":"nosniff"}});
 }catch{return new Response("Forbidden",{status:403});}
}
