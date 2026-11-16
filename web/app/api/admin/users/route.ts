import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import {
  assertClerkIdentityEnvironment,
  syncClerkIdentity,
} from "@/lib/clerk-identity-lifecycle";
import { recordAdminSupportAction } from "@/lib/admin-support";
import { NextResponse } from "next/server";
import type { PlanTier } from "@prisma/client";
import { getAdminUsers } from "@/lib/admin-users";
import { requireAdminAuth } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminAuth();

    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
    const planTier = url.searchParams.get("planTier");
    const verified = url.searchParams.get("verified");
    const locked = url.searchParams.get("locked");

    const payload = await getAdminUsers({
      query,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 25,
      planTier:
        planTier === "free" || planTier === "pro" || planTier === "premium"
          ? (planTier as PlanTier)
          : "all",
      verified: verified === "yes" || verified === "no" ? verified : "all",
      locked: locked === "locked" || locked === "unlocked" ? locked : "all",
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json(
      { error: message === "FORBIDDEN" ? "Forbidden" : "Unauthorized" },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("operate");
    await assertClerkIdentityEnvironment();
    const input = z
      .object({
        email: z.string().trim().email(),
        firstName: z.string().trim().max(80),
        lastName: z.string().trim().max(80),
        requestId: z.string().uuid(),
      })
      .strict()
      .parse(await request.json());
    const client = await clerkClient();
    // Clerk enforces unique external IDs, making a retry after an uncertain response safe.
    const externalId = `clover-admin:${actor.userId}:${input.requestId}`;
    const previous = await client.users.getUserList({
      externalId: [externalId],
      limit: 1,
    });
    const source =
      previous.data[0] ??
      (await client.users.createUser({
        emailAddress: [input.email],
        firstName: input.firstName,
        lastName: input.lastName,
        externalId,
        skipPasswordRequirement: true,
      }));
    const user = await syncClerkIdentity(source.id);
    if (!user)
      throw new Error(
        "This creation request belongs to a deleted user. Start a new request.",
      );
    await recordAdminSupportAction({
      actorUserId: actor.userId,
      targetUserId: user.id,
      targetClerkUserId: source.id,
      action: "create_user",
    });
    return NextResponse.json(
      { success: true, userId: user.id },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create user.";
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
