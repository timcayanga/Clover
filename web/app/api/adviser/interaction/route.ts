import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RequestBody = {
  kind?: "card" | "prompt" | "feedback";
  group?: string;
  itemId?: string;
  label?: string;
  href?: string;
  pathname?: string;
  rating?: "helpful" | "not_helpful";
};

export async function POST(request: Request) {
  try {
    const { userId } = await getSessionContext();
    const user = await getOrCreateCurrentUser(userId);
    const body = (await request.json().catch(() => null)) as RequestBody | null;

    if (!body?.kind || !["card", "prompt", "feedback"].includes(body.kind)) {
      return NextResponse.json({ error: "An interaction kind is required." }, { status: 400 });
    }

    if (!body.group?.trim() || !body.itemId?.trim() || !body.label?.trim()) {
      return NextResponse.json({ error: "An interaction payload is required." }, { status: 400 });
    }

    if (body.kind === "feedback" && (!body.rating || !["helpful", "not_helpful"].includes(body.rating))) {
      return NextResponse.json({ error: "A feedback rating is required." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const selectedWorkspaceId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";

    const workspace =
      (selectedWorkspaceId
        ? await prisma.workspace.findFirst({
            where: {
              id: selectedWorkspaceId,
              user: {
                clerkUserId: user.clerkUserId,
              },
            },
            select: {
              id: true,
            },
          })
        : null) ??
      (await prisma.workspace.findFirst({
        where: {
          user: {
            clerkUserId: user.clerkUserId,
          },
        },
        select: {
          id: true,
        },
        orderBy: { createdAt: "asc" },
      }));

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    await assertWorkspaceAccess(user.clerkUserId, workspace.id);

    await prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.clerkUserId,
        action: body.kind === "card" ? "adviser.card_opened" : body.kind === "prompt" ? "adviser.prompt_clicked" : "adviser.chat_feedback",
        entity: "Adviser",
        entityId: body.itemId.trim(),
        metadata: {
          kind: body.kind,
          group: body.group.trim(),
          itemId: body.itemId.trim(),
          label: body.label.trim(),
          href: body.href?.trim() ?? null,
          pathname: body.pathname?.trim() ?? null,
          rating: body.rating ?? null,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record Adviser interaction.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
