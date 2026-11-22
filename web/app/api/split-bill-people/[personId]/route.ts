import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export const dynamic = "force-dynamic";

const updatePersonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().min(1).max(80).nullable().optional(),
  avatarUrl: z.string().trim().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const user = await getSplitBillCurrentUser();
    const { personId } = await params;
    const body = updatePersonSchema.parse(await request.json());

    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"split-bill-people:" + user.id}))`;
      const existing = await tx.splitBillPerson.findFirst({
        where: { id: personId, userId: user.id },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Person not found" },
          { status: 404 },
        );
      const nameMatch = { equals: body.name, mode: "insensitive" as const };
      const conflict = await tx.splitBillPerson.findFirst({
        where: {
          userId: user.id,
          id: { not: personId },
          OR: [{ name: nameMatch }, { displayName: nameMatch }],
        },
      });
      if (conflict)
        return NextResponse.json(
          { error: "A person with that name already exists." },
          { status: 409 },
        );
      // Bills and Circle membership use the original name to identify historical participants.
      const person = await tx.splitBillPerson.update({
        where: { id: personId },
        data: {
          displayName: body.name === existing.name ? null : body.name,
          email: body.email,
          phone: body.phone,
          avatarUrl: body.avatarUrl,
        },
        select: {
          id: true,
          name: true,
          displayName: true,
          email: true,
          phone: true,
          fromContacts: true,
          avatarUrl: true,
        },
      });
      return NextResponse.json({ person });
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update person",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const user = await getSplitBillCurrentUser();
    const { personId } = await params;

    const existing = await prisma.splitBillPerson.findFirst({
      where: {
        id: personId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    await prisma.splitBillPerson.delete({
      where: { id: personId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to delete person",
      },
      { status: 400 },
    );
  }
}
