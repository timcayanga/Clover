import { NextResponse } from "next/server";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const resolveUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export async function GET(request: Request) {
  try {
    const userId = await resolveUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim() ?? "";
    const query = searchParams.get("q")?.trim() ?? "";

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    if (query.length < 1) {
      return NextResponse.json({ suggestions: [] });
    }

    const rows = await prisma.transaction.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        reviewStatus: { not: "rejected" },
        OR: [
          { merchantClean: { contains: query, mode: "insensitive" } },
          { merchantRaw: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
      take: 80,
      select: {
        merchantRaw: true,
        merchantClean: true,
        categoryId: true,
        accountId: true,
        type: true,
        date: true,
        category: { select: { name: true } },
        account: { select: { name: true, institution: true } },
      },
    });

    const normalizedQuery = normalizeKey(query);
    const grouped = new Map<
      string,
      {
        name: string;
        categoryId: string | null;
        categoryName: string | null;
        accountId: string;
        accountName: string;
        type: "income" | "expense" | "transfer";
        count: number;
        latestDate: number;
      }
    >();

    for (const row of rows) {
      const name = (row.merchantClean ?? row.merchantRaw).trim();
      const key = normalizeKey(name);
      if (!key) continue;

      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }

      grouped.set(key, {
        name,
        categoryId: row.categoryId,
        categoryName: row.category?.name ?? null,
        accountId: row.accountId,
        accountName: row.account.name,
        type: row.type,
        count: 1,
        latestDate: row.date.getTime(),
      });
    }

    const suggestions = Array.from(grouped.values())
      .sort((left, right) => {
        const leftPrefix = normalizeKey(left.name).startsWith(normalizedQuery) ? 1 : 0;
        const rightPrefix = normalizeKey(right.name).startsWith(normalizedQuery) ? 1 : 0;
        if (leftPrefix !== rightPrefix) return rightPrefix - leftPrefix;
        if (left.count !== right.count) return right.count - left.count;
        return right.latestDate - left.latestDate;
      })
      .slice(0, 6)
      .map(({ latestDate: _latestDate, ...suggestion }) => suggestion);

    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=45" } }
    );
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
