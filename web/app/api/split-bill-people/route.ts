import { loadSplitBillPeople } from "@/lib/split-bill-people";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export const dynamic = "force-dynamic";

const createPersonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().trim().nullable().optional(),
});

export async function GET() {
  try {
    const user = await getSplitBillCurrentUser();
    const people = await loadSplitBillPeople(user.id);

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

    const result = await prisma.$transaction(async tx => {
      // Use the same lock as Circle and group contact discovery.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"split-bill-people:" + user.id}))`;
      const existing = await tx.splitBillPerson.findFirst({
        where: { userId: user.id, name: { equals: name, mode: "insensitive" } },
      });
      if (existing) {
        const update = {
          ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl || null } : {}),
          ...(!existing.email && body.email ? { email: body.email } : {}),
          ...(!existing.phone && body.phone ? { phone: body.phone } : {}),
        };
        const person = Object.keys(update).length
          ? await tx.splitBillPerson.update({ where: { id: existing.id }, data: update })
          : existing;
        return { person, status: 200 };
      }
      const person = await tx.splitBillPerson.create({ data: { ...body, userId: user.id, name } });
      return { person, status: 201 };
    });
    return NextResponse.json({ person: result.person }, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create person",
      },
      { status: 400 }
    );
  }
}
