import { NextResponse } from "next/server";
import { requireInternalApiAccess } from "@/lib/internal-access";
import { prepareTeamUpload, mediaRequestSchema } from "@/lib/team-media.server";
import {
  privateHeaders,
  readStudioJson,
  studioError,
} from "@/lib/team-studio-api";
export async function POST(request: Request) {
  try {
    const { userId } = await requireInternalApiAccess();
    const input = mediaRequestSchema.parse(await readStudioJson(request, 2048));
    return NextResponse.json(await prepareTeamUpload(userId, input), {
      headers: privateHeaders,
    });
  } catch (error) {
    return studioError(error);
  }
}
