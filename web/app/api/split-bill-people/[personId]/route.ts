import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export const dynamic = "force-dynamic";

const updatePersonSchema = z.object({
  name: z.string().trim().min(1),
  avatarUrl: z.string().trim().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ personId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { personId } = await params;
    const body = updatePersonSchema.parse(await request.json());

    const existing = await prisma.splitBillPerson.findFirst({
      where: {
        id: personId,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const person = await prisma.splitBillPerson.update({
      where: { id: personId },
      data: {
        name: body.name,
        avatarUrl: body.avatarUrl?.trim() || null,
      },
    });

    return NextResponse.json({ person });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update person",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ personId: string }> }) {
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
        error: error instanceof Error ? error.message : "Unable to delete person",
      },
      { status: 400 }
    );
  }
}
