import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";
import type { TransactionType } from "@/lib/domain-types";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const resolveCategoriesRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const createCategorySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["income", "expense", "transfer"]),
  parentCategoryId: z.string().optional().nullable(),
});

const updateCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  type: z.enum(["income", "expense", "transfer"]).optional(),
  isArchived: z.boolean().optional(),
});

const normalizeCategoryName = (value: string) => value.trim().toLowerCase();

export async function GET(request: Request) {
  try {
    const userId = await resolveCategoriesRouteUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const includeArchived = searchParams.get("includeArchived") === "true";

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const categoriesForSeeding = await prisma.category.findMany({
      where: { workspaceId },
      select: { name: true },
    });
    const existingCategoryNames = new Set(categoriesForSeeding.map((category) => normalizeCategoryName(category.name)));
    const missingDefaultCategories = DEFAULT_CATEGORY_ROWS.filter((category) => !existingCategoryNames.has(normalizeCategoryName(category.name)));
    if (missingDefaultCategories.length > 0) {
      await prisma.category.createMany({
        data: missingDefaultCategories.map((category: { name: string; type: TransactionType }) => ({
          workspaceId,
          name: category.name,
          type: category.type,
          isSystem: true,
        })),
        skipDuplicates: true,
      });
    }

    const categories = await prisma.category.findMany({
      where: {
        workspaceId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [
        { isSystem: "desc" },
        { isArchived: "asc" },
        { type: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: "Unable to load categories" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await resolveCategoriesRouteUserId();
    const payload = createCategorySchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const normalizedName = normalizeCategoryName(payload.name);
    const existingCategories = await prisma.category.findMany({
      where: { workspaceId: payload.workspaceId },
      select: { id: true, name: true, type: true, isArchived: true, isSystem: true },
    });
    const existingCategory = existingCategories.find((category) => normalizeCategoryName(category.name) === normalizedName);

    if (existingCategory) {
      if (existingCategory.isArchived) {
        const restoredCategory = await prisma.category.update({
          where: { id: existingCategory.id },
          data: {
            name: payload.name.trim(),
            type: payload.type,
            parentCategoryId: payload.parentCategoryId ?? null,
            isArchived: false,
          },
        });

        void capturePostHogServerEvent("category_created", userId, {
          workspace_id: payload.workspaceId,
          category_id: restoredCategory.id,
          category_name: restoredCategory.name,
          category_type: restoredCategory.type,
          parent_category_id: restoredCategory.parentCategoryId,
        });

        return NextResponse.json({ category: restoredCategory }, { status: 200 });
      }

      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }

    const category = await prisma.category.create({
      data: {
        workspaceId: payload.workspaceId,
        name: payload.name.trim(),
        type: payload.type,
        parentCategoryId: payload.parentCategoryId ?? null,
        isSystem: false,
      },
    });

    void capturePostHogServerEvent("category_created", userId, {
      workspace_id: payload.workspaceId,
      category_id: category.id,
      category_name: category.name,
      category_type: category.type,
      parent_category_id: category.parentCategoryId,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to create category" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await resolveCategoriesRouteUserId();
    const payload = updateCategorySchema.parse(await request.json());

    const existingCategory = await prisma.category.findUnique({
      where: { id: payload.id },
      select: { id: true, workspaceId: true, isSystem: true, isArchived: true, name: true, type: true, parentCategoryId: true },
    });

    if (!existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, existingCategory.workspaceId);

    if (existingCategory.isSystem && (payload.name !== undefined || payload.type !== undefined || payload.isArchived !== undefined)) {
      return NextResponse.json({ error: "Built-in categories are locked." }, { status: 400 });
    }

    const category = await prisma.category.update({
      where: { id: payload.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.isArchived !== undefined ? { isArchived: payload.isArchived } : {}),
      },
    });

    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "Unable to update category" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await resolveCategoriesRouteUserId();
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = typeof body.id === "string" ? body.id : "";

    if (!id) {
      return NextResponse.json({ error: "Category id is required" }, { status: 400 });
    }

    const existingCategory = await prisma.category.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, isSystem: true },
    });

    if (!existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, existingCategory.workspaceId);

    if (existingCategory.isSystem) {
      return NextResponse.json({ error: "Built-in categories are locked." }, { status: 400 });
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        isArchived: true,
      },
    });

    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "Unable to delete category" }, { status: 400 });
  }
}
