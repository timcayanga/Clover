import { parseReceiptLineItemsFromPayload } from "@/lib/receipt-line-items";
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { entryDraftSchema } from "@/lib/adviser-entry-schema";
import { saveAdviserEntries, EntrySaveError } from "@/lib/adviser-entry-save";
export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function authorize(request: Request) {
  const { userId } = await getSessionContext();
  const user = await getOrCreateCurrentUser(userId);
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) throw new EntrySaveError("Choose a Profile first.");
  await assertWorkspaceAccess(user.clerkUserId, workspaceId);
  return { user, workspaceId };
}
export async function GET(request: Request) {
  try {
    const { workspaceId } = await authorize(request);
    if (new URL(request.url).searchParams.get("scopeOnly") === "true")
      return respond({ workspaceId });
    const selectedIds = (
      new URL(request.url).searchParams.get("transactionIds") || ""
    )
      .split(",")
      .filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id))
      .slice(0, 10);
    const transactionSelect = {
      id: true,
      merchantClean: true,
      merchantRaw: true,
      amount: true,
      currency: true,
      date: true,
      updatedAt: true,
      rawPayload: true,
      normalizedPayload: true,
    } as const;
    const [accounts, categories, transactions, selected] = await Promise.all([
      prisma.account.findMany({
        where: { workspaceId },
        select: { id: true, name: true, currency: true, type: true },
        take: 300,
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({
        where: { workspaceId },
        select: { id: true, name: true, type: true },
        take: 300,
        orderBy: { name: "asc" },
      }),
      prisma.transaction.findMany({
        where: { workspaceId, deletedAt: null },
        select: transactionSelect,
        orderBy: { date: "desc" },
        take: 50,
      }),
      selectedIds.length
        ? prisma.transaction.findMany({
            where: { workspaceId, deletedAt: null, id: { in: selectedIds } },
            select: transactionSelect,
          })
        : [],
    ]);
    return respond({
      accounts,
      categories,
      transactions: [
        ...new Map(
          [...selected, ...transactions].map((row) => [row.id, row]),
        ).values(),
      ].map((row) => ({
        id: row.id,
        name: row.merchantClean || row.merchantRaw,
        amount: row.amount.toString(),
        currency: row.currency,
        date: row.date.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        receiptItems: parseReceiptLineItemsFromPayload(
          row.rawPayload,
          row.normalizedPayload,
        ),
      })),
    });
  } catch (error) {
    return respond(
      {
        error:
          error instanceof EntrySaveError
            ? error.message
            : "Unable to load Adviser entry options.",
      },
      error instanceof EntrySaveError ? error.status : 403,
    );
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { user, workspaceId } = await authorize(request);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 100000)
      return respond({ error: "Please shorten this draft." }, 413);
    const parsed = entryDraftSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return respond(
        { error: "Review the draft fields before confirming." },
        400,
      );
    if (parsed.data.workspaceId !== workspaceId)
      return respond(
        { error: "This draft belongs to a different Profile." },
        403,
      );
    return respond(await saveAdviserEntries(parsed.data, user.id));
  } catch (error) {
    return respond(
      {
        error:
          error instanceof EntrySaveError
            ? error.message
            : "Unable to save this draft. It has not been automatically resent.",
      },
      error instanceof EntrySaveError
        ? error.status
        : error instanceof SyntaxError
          ? 400
          : 500,
    );
  }
}
