import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const resolveRecurringPatternRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const toRawPayloadObject = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveRecurringPatternRouteUserId();
    const { patternId } = await params;
    const pattern = await prisma.recurringPattern.findUnique({
      where: { id: patternId },
      select: {
        id: true,
        workspaceId: true,
        rawPayload: true,
      },
    });

    if (!pattern) {
      return NextResponse.json({ error: "Recurring suggestion not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, pattern.workspaceId);

    await prisma.recurringPattern.update({
      where: { id: pattern.id },
      data: {
        rawPayload: {
          ...toRawPayloadObject(pattern.rawPayload),
          dismissed: true,
          dismissedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to dismiss recurring pattern", error);
    return NextResponse.json({ error: "Unable to dismiss recurring suggestion" }, { status: 400 });
  }
}
