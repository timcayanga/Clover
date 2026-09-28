import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalApiAccess } from "@/lib/internal-access";
import { teamMediaReadUrl } from "@/lib/team-media.server";
import { privateHeaders, studioError } from "@/lib/team-studio-api";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    const { userId } = await requireInternalApiAccess();
    const id = z.string().uuid().parse((await params).mediaId);
    return NextResponse.redirect(await teamMediaReadUrl(userId, id, true), { status: 307, headers: privateHeaders });
  } catch (error) { return studioError(error); }
}
