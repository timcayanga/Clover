import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export const dynamic = "force-dynamic";

const createPersonSchema = z.object({
  name: z.string().trim().min(1),
});

export async function GET() {
  try {
    const user = await getSplitBillCurrentUser();
    const people = await prisma.splitBillPerson.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ people });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load people" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSplitBillCurrentUser();
    const body = createPersonSchema.parse(await request.json());
    const name = body.name.trim();

    const existing = await prisma.splitBillPerson.findFirst({
      where: {
        userId: user.id,
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    });

    if (existing) {
      return NextResponse.json({ person: existing }, { status: 200 });
    }

    const person = await prisma.splitBillPerson.create({
      data: {
        userId: user.id,
        name,
      },
    });

    return NextResponse.json({ person }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create person",
      },
      { status: 400 }
    );
  }
}
