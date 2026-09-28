import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { loadTeamStudio, saveTeamStudio } from "@/lib/team-studio-store";
import { requireInternalApiAccess } from "@/lib/internal-access";
import { studioSchema } from "@/lib/team-studio";
import {
  privateHeaders,
  readStudioJson,
  studioError,
} from "@/lib/team-studio-api";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireInternalApiAccess();
    return NextResponse.json(await loadTeamStudio(userId), {
      headers: privateHeaders,
    });
  } catch (error) {
    return studioError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const { userId } = await requireInternalApiAccess();
    const input = z
      .object({ revision: z.number().int().nonnegative(), state: studioSchema })
      .parse(await readStudioJson(request));
    const result = await saveTeamStudio(userId, input);
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      return studioError(new Error("CONFLICT"));
    return studioError(error);
  }
}
