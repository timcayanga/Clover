import { NextResponse } from "next/server";
import { requireInternalApiAccess } from "@/lib/internal-access";
import {
  privateHeaders,
  readStudioJson,
  studioError,
} from "@/lib/team-studio-api";
import { listAssignments, startAssignment } from "@/lib/team-agent-store";
import { startAssignmentSchema } from "@/lib/team-agent-contract";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
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
    const input = startAssignmentSchema.parse(
      await readStudioJson(request, 10000),
    );
    return NextResponse.json(await startAssignment(userId, input), {
      status: 202,
      headers: privateHeaders,
    });
  } catch (error) {
    return studioError(error);
  }
}
