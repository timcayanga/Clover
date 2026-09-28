import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalApiAccess } from "@/lib/internal-access";
import {
  privateHeaders,
  readStudioJson,
  studioError,
} from "@/lib/team-studio-api";
import {
  approveAssignment,
  cancelAssignment,
  getAssignment,
  refreshAssignment,
} from "@/lib/team-agent-store";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ runId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { userId } = await requireInternalApiAccess();
    const id = z
      .string()
      .uuid()
      .parse((await context.params).runId);
    return NextResponse.json(await getAssignment(userId, id), {
      headers: privateHeaders,
    });
  } catch (error) {
    return studioError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { userId } = await requireInternalApiAccess();
    const id = z
      .string()
      .uuid()
      .parse((await context.params).runId);
    const { action } = z
      .object({ action: z.enum(["refresh", "cancel", "approve"]) })
      .parse(await readStudioJson(request, 1000));
    const run = await {
      refresh: refreshAssignment,
      cancel: cancelAssignment,
      approve: approveAssignment,
    }[action](userId, id);
    return NextResponse.json(run, { headers: privateHeaders });
  } catch (error) {
    return studioError(error);
  }
}
