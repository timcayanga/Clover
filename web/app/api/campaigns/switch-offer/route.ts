import { campaignConfig } from "@/lib/switch-campaign.server";
import { campaignOpen } from "../../../../../shared/switch-campaign";
export const dynamic="force-dynamic";
export async function GET(){const c=await campaignConfig();return Response.json({open:campaignOpen(c,new Date())},{headers:{"Cache-Control":"no-store"}});}
