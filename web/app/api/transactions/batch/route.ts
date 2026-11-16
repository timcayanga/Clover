import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import {
  transactionTableSchema,
  commitTransactionTable,
} from "@/lib/transaction-table-save";
import { EntrySaveError } from "@/lib/adviser-entry-save";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await getSessionContext();
    const user = await getOrCreateCurrentUser(userId);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 100000)
      return reply({ error: "Paste up to 50 rows per batch." }, 413);
    const parsed = transactionTableSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return reply(
        { error: "Check the batch fields. No rows were saved." },
        400,
      );
    const requestedWorkspace = new URL(request.url).searchParams.get(
      "workspaceId",
    );
    if (requestedWorkspace && requestedWorkspace !== parsed.data.workspaceId)
      return reply(
        { error: "This draft belongs to a different Profile." },
        403,
      );
    await assertWorkspaceAccess(user.clerkUserId, parsed.data.workspaceId);
    const result = await commitTransactionTable(prisma, parsed.data, user.id);
    invalidateWorkspaceSummaryCache(parsed.data.workspaceId);
    return reply(result);
  } catch (error) {
    return reply(
      {
        error:
          error instanceof EntrySaveError
            ? error.message
            : "Unable to confirm the batch. Retry the same draft to check its result safely.",
      },
      error instanceof EntrySaveError ? error.status : 500,
    );
  }
}
