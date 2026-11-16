import { NextResponse } from "next/server";
import { requireInternalApiAccess } from "@/lib/internal-access";
import {
  privateHeaders,
  readStudioJson,
  studioError,
} from "@/lib/team-studio-api";
import {
  listAssignments,
  startAssignment,
  refreshOwnerAssignments,
} from "@/lib/team-agent-store";
import { startAssignmentSchema } from "@/lib/team-agent-contract";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    const { userId } = await requireInternalApiAccess();
    return NextResponse.json(
      {
        runs: await listAssignments(
          userId,
          new URL(request.url).searchParams.get("briefId") || undefined,
        ),
        enabled:
          !!process.env.OPENAI_API_KEY &&
          process.env.CLOVER_TEAM_AGENTS_ENABLED !== "false",
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return studioError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { userId } = await requireInternalApiAccess();
    const raw = await readStudioJson(request, 20000);
    if (
      typeof raw === "object" &&
      raw !== null &&
      "action" in raw &&
      raw.action === "refresh"
    )
      return NextResponse.json(await refreshOwnerAssignments(userId), {
        headers: privateHeaders,
      });
    const input = startAssignmentSchema.parse(raw);
    return NextResponse.json(await startAssignment(userId, input), {
      status: 202,
      headers: privateHeaders,
    });
  } catch (error) {
    return studioError(error);
  }
}
