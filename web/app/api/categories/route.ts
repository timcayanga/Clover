import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";
import type { TransactionType } from "@/lib/domain-types";

export const dynamic = "force-dynamic";

const createCategorySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["income", "expense", "transfer"]),
  parentCategoryId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const existingCategories = await prisma.category.findMany({
      where: { workspaceId },
      select: { name: true, type: true },
    });
    const categoryKey = (name: string) => name.trim().toLowerCase();
    const existingCategoryNames = new Set(existingCategories.map((category: { name: string }) => categoryKey(category.name)));
    const missingDefaultCategories = DEFAULT_CATEGORY_ROWS.filter((category) => !existingCategoryNames.has(categoryKey(category.name)));
    if (missingDefaultCategories.length > 0) {
      await prisma.category.createMany({
      data: missingDefaultCategories.map((category: { name: string; type: TransactionType }) => ({
          workspaceId,
          name: category.name,
          type: category.type,
        })),
        skipDuplicates: true,
      });
    }

    const categories = await prisma.category.findMany({
      where: { workspaceId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: "Unable to load categories" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const payload = createCategorySchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const category = await prisma.category.create({
      data: {
        workspaceId: payload.workspaceId,
        name: payload.name,
        type: payload.type,
        parentCategoryId: payload.parentCategoryId ?? null,
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create category" }, { status: 400 });
  }
}
