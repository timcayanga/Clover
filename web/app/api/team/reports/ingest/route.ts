import { NextResponse } from "next/server";
import { requireReportIngestAccess } from "@/lib/team-report-auth";
import { privateHeaders, readStudioBody, studioError } from "@/lib/team-studio-api";
import { teamReportSchema } from "@/lib/team-report-contract";
import { saveTeamReport } from "@/lib/team-report-store";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const ownerId = await requireReportIngestAccess(request);
    const input = teamReportSchema.parse(await readStudioBody(request, 500000));
    return NextResponse.json(await saveTeamReport(ownerId, input), {headers: privateHeaders});
  } catch (error) { return studioError(error); }
}
