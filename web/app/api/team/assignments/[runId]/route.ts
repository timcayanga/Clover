import { assignmentTransferSchema } from "@/lib/team-agent-contract";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalApiAccess } from "@/lib/internal-access";
import {
  privateHeaders,
  readStudioJson,
  studioError,
} from "@/lib/team-studio-api";
import {
  transferAssignment,
  approveAssignment,
  withdrawAssignmentApproval,
  cancelAssignment,
  getAssignment,
  refreshAssignment,
} from "@/lib/team-agent-store";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
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
    const raw = await readStudioJson(request, 30000);
    if (typeof raw === "object" && raw !== null && "kind" in raw)
      return NextResponse.json(
        await transferAssignment(
          userId,
          id,
          assignmentTransferSchema.parse(raw),
        ),
        { headers: privateHeaders },
      );
    const { action } = z
      .object({ action: z.enum(["refresh", "cancel", "approve", "withdraw"]) })
      .parse(raw);
    const run = await {
      refresh: refreshAssignment,
      cancel: cancelAssignment,
      approve: approveAssignment,
      withdraw: withdrawAssignmentApproval,
    }[action](userId, id);
    return NextResponse.json(run, { headers: privateHeaders });
  } catch (error) {
    return studioError(error);
  }
}
