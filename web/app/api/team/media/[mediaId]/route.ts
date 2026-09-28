import { NextResponse } from "next/server";
import { requireInternalApiAccess } from "@/lib/internal-access";
import { completeTeamUpload, teamMediaReadUrl } from "@/lib/team-media.server";
import {
  privateHeaders,
  readStudioJson,
  studioError,
} from "@/lib/team-studio-api";
import { z } from "zod";
type Context = { params: Promise<{ mediaId: string }> };
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: Context) {
  try {
    const { userId } = await requireInternalApiAccess();
    const id = z
      .string()
      .uuid()
      .parse((await params).mediaId);
    return NextResponse.json(
      { url: await teamMediaReadUrl(userId, id) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return studioError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const { userId } = await requireInternalApiAccess();
    await readStudioJson(request, 1024);
    const id = z
      .string()
      .uuid()
      .parse((await params).mediaId);
    return NextResponse.json(await completeTeamUpload(userId, id), {
      headers: privateHeaders,
    });
  } catch (error) {
    return studioError(error);
  }
}
