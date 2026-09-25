import { auth } from "@clerk/nextjs/server";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { activateSwitch, submitSwitchEvidence, switchAnalytics, switchSnapshot } from "@/lib/switch-campaign.server";
import { after } from "next/server";
export const dynamic="force-dynamic";
async function user() {const {userId}=getMobileRequestContext()??await auth();if(!userId)throw new Error("UNAUTHORIZED");return getOrCreateCurrentUser(userId);}
function failure(e:unknown) {const message=e instanceof Error?e.message:"Unable to process application.";return Response.json({error:message},{status:message==="UNAUTHORIZED"?401:400});}
export async function GET(){try{return Response.json(await switchSnapshot((await user()).id),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  assertTrustedRequestOrigin(request);const u=await user();
  if(request.headers.get("content-type")?.includes("multipart/form-data")) {
    if(Number(request.headers.get("content-length")??0)>3.5*1024*1024) throw new Error("Choose a receipt up to 3 MB.");
    const data=await request.formData();const file=data.get("file");if(!(file instanceof File)) throw new Error("Choose a receipt.");
    await submitSwitchEvidence(u.id,file,String(data.get("note")??""),data.get("consent")==="true");
    await switchAnalytics(u.id,"application_submitted");
  }else{
    const body=await request.json();if(body.action!=="activate")throw new Error("Invalid action.");
    await activateSwitch(u.id);
    after(async()=>{const {dispatchSwitchEmails}=await import("@/lib/switch-campaign-notifications.server");await dispatchSwitchEmails();});
  }
  return Response.json(await switchSnapshot(u.id));
}catch(e){return failure(e);}}
