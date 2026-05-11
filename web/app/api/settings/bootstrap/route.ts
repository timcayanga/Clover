import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getSessionContext } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSessionContext();
    const user = await getOrCreateCurrentUser(session.userId);
    const env = getEnv();

    if (!session.isGuest && !hasCompletedOnboarding(user)) {
      return NextResponse.json({ error: "onboarding_required" }, { status: 409 });
    }

    const cookieStore = await cookies();
    const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
    let selectedWorkspace = selectedWorkspaceCookieId
      ? await prisma.workspace.findFirst({
          where: { id: selectedWorkspaceCookieId, userId: user.id },
          select: {
            id: true,
            name: true,
          },
        })
      : null;

    if (!selectedWorkspace) {
      selectedWorkspace = await prisma.workspace.findFirst({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
      });
    }

    if (!selectedWorkspace) {
      const starterWorkspace = await ensureStarterWorkspace(user);
      selectedWorkspace = {
        id: starterWorkspace.id,
        name: starterWorkspace.name,
      };
    }

    return NextResponse.json({
      workspaceId: selectedWorkspace.id,
      workspaceName: selectedWorkspace.name,
      selectedProfileId: selectedWorkspace.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      planTier: user.planTier,
      paypalClientId: env.PAYPAL_CLIENT_ID ?? null,
      paypalMonthlyPlanId: env.PAYPAL_MONTHLY_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null,
      paypalAnnualPlanId: env.PAYPAL_ANNUAL_PLAN_ID ?? env.PAYPAL_PRO_PLAN_ID ?? null,
      paypalBuyerCountry: env.PAYPAL_BUYER_COUNTRY ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
