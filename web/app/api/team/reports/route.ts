import { NextResponse } from "next/server";
import { requireInternalApiAccess } from "@/lib/internal-access";
import { privateHeaders, readStudioJson, studioError } from "@/lib/team-studio-api";
import { teamReportSchema } from "@/lib/team-report-contract";
import { saveTeamReport } from "@/lib/team-report-store";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const {userId} = await requireInternalApiAccess();
    const input = teamReportSchema.parse(await readStudioJson(request, 500000));
    return NextResponse.json(await saveTeamReport(userId, input), {headers: privateHeaders});
  } catch (error) { return studioError(error); }
}
