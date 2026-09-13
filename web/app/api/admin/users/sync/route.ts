import { canAdmin } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { reconcileClerkUsers } from "@/lib/clerk-identity-lifecycle";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    await requireAdminAuth("operate");
    const { offset } = z
      .object({ offset: z.number().int().min(0).default(0) })
      .strict()
      .parse(await request.json());
    return NextResponse.json(await reconcileClerkUsers(offset));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : message === "FORBIDDEN"
              ? 403
              : 400,
      },
    );
  }
}

export async function GET() {
  try {
    const actor = await requireAdminAuth();
    return NextResponse.json({
      environment: getAdminDataEnvironment(),
      canOperate: canAdmin(actor.role, "operate"),
      webhookConfigured: Boolean(process.env.CLERK_WEBHOOK_SIGNING_SECRET),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
