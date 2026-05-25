import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";

export const dynamic = "force-dynamic";

const accountSchema = z.object({
  firstName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
});

const normalizeName = (value: string | null | undefined) => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
};

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const payload = accountSchema.parse(await request.json());
    const firstName = normalizeName(payload.firstName);
    const lastName = normalizeName(payload.lastName);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
      },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update account details.",
      },
      { status: 400 }
    );
  }
}
