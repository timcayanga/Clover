import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { knowledgeSeeds, knowledgeCategories } from "@/lib/knowledge-seed";
import {
  aiSettingsSchema,
  contentSchema,
  contentPathSchema,
  defaultAiSettings,
  type KnowledgeEntry,
  type KnowledgeContent,
} from "@/lib/knowledge-types";

export const getKnowledge = cache(async () => {
  const entries = new Map(knowledgeSeeds.map((entry) => [entry.path, entry]));
  let categories = knowledgeCategories;
  // Local previews without a database use the bundled collection. Configured
  // deployments fail closed during an outage so archived content cannot reappear.
  if (process.env.DATABASE_URL || process.env.DIRECT_URL) {
    try {
      const [rows, settings] = await Promise.all([
        prisma.knowledgeArticle.findMany({
          select: {
            path: true,
            published: true,
            archived: true,
            sortOrder: true,
          },
        }),
        prisma.knowledgeSettings.findUnique({ where: { id: "editorial" } }),
      ]);
      for (const row of rows) {
        if (row.archived) {
          entries.delete(row.path);
          continue;
        }
        if (row.published) {
          const parsed = contentSchema.safeParse(row.published);
          if (!parsed.success) throw new Error("Invalid published article snapshot.");
          if (parsed.success)
            entries.set(row.path, {
              path: row.path,
              content: parsed.data,
              order: row.sortOrder,
            });
        }
      }
      if (settings?.categoryOrder.length)
        categories = [...categories].sort((a, b) => {
          const rank = (slug: string) => {
            const index = settings.categoryOrder.indexOf(slug);
            return index < 0 ? 999 : index;
          };
          return rank(a.slug) - rank(b.slug);
        });
    } catch {
      throw new Error(
        "Help content is temporarily unavailable. Please try again shortly.",
      );
    }
  }
  return {
    entries: [...entries.values()].sort((a, b) => a.order - b.order),
    categories,
  };
});

export async function getEditorialLibrary() {
  const [rows, settings, runs, feedback] = await Promise.all([
    prisma.knowledgeArticle.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.knowledgeSettings.findUnique({ where: { id: "editorial" } }),
    prisma.knowledgeGeneration.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.knowledgeFeedback.groupBy({
      by: ["path", "helpful"],
      _count: { _all: true },
    }),
  ]);
  const items = new Map<
    string,
    KnowledgeEntry & {
      version: number;
      needsReview: boolean;
      archived: boolean;
      origin: string;
      published?: KnowledgeContent;
    }
  >(
    knowledgeSeeds.map((entry) => [
      entry.path,
      {
        ...entry,
        version: 0,
        needsReview: false,
        archived: false,
        origin: "existing",
        published: entry.content,
      },
    ]),
  );
  for (const row of rows) {
    const content = contentSchema.parse(row.draft);
    items.set(row.path, {
      path: row.path,
      content,
      order: row.draftOrder,
      version: row.version,
      needsReview: row.needsReview,
      archived: row.archived,
      origin: row.origin,
      published: row.published
        ? contentSchema.parse(row.published)
        : knowledgeSeeds.find((e) => e.path === row.path)?.content,
    });
  }
  return {
    items: [...items.values()],
    feedback: feedback.map((row) => ({
      path: row.path,
      helpful: row.helpful,
      count: row._count._all,
    })),
    settings: settings
      ? aiSettingsSchema.parse(settings.ai)
      : defaultAiSettings,
    categoryOrder:
      settings?.categoryOrder ?? knowledgeCategories.map((c) => c.slug),
    runs: runs.map((run) => ({
      ...run,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    })),
  };
}

export async function mutateArticle(
  input: {
    path: string;
    version: number;
    action: "save" | "publish" | "archive" | "restore";
    content?: unknown;
    order?: number;
  },
  actor: string,
) {
  const path = contentPathSchema.parse(input.path);
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.knowledgeArticle.findUnique({ where: { path } });
      if ((row?.version ?? 0) !== input.version)
        throw new Error(
          "This article changed in another session. Reload before saving.",
        );
      const seed = knowledgeSeeds.find((entry) => entry.path === path);
      const current = row?.draft ?? seed?.content;
      const content = contentSchema.parse(
        input.action === "save" ? input.content : current,
      );
      if (
        !knowledgeCategories.some(
          (category) => category.slug === content.category,
        )
      )
        throw new Error("Choose a valid category.");
      if ((content.kind === "guide") !== path.startsWith("/guides/"))
        throw new Error("The URL must match the content type.");
      if (
        input.action === "publish" &&
        content.kind === "guide" &&
        content.market === "ph" &&
        !content.sources.length
      )
        throw new Error(
          "Philippines guides require source links before approval.",
        );
      const json = content as Prisma.InputJsonValue;
      const version = input.version + 1;
      const published =
        input.action === "publish"
          ? json
          : ((row?.published ??
              seed?.content ??
              Prisma.DbNull) as Prisma.InputJsonValue);
      const archived =
        input.action === "archive"
          ? true
          : input.action === "restore" || input.action === "publish"
            ? false
            : (row?.archived ?? false);
      const draftOrder =
        input.action === "save"
          ? (input.order ?? row?.draftOrder ?? seed?.order ?? 1000)
          : (row?.draftOrder ?? seed?.order ?? 1000);
      const data = {
        draft: json,
        published,
        version,
        archived,
        needsReview:
          input.action === "save"
            ? true
            : input.action === "publish"
              ? false
              : (row?.needsReview ?? false),
        draftOrder,
        sortOrder:
          input.action === "publish"
            ? draftOrder
            : (row?.sortOrder ?? seed?.order ?? 1000),
      };
      if (row) {
        const result = await tx.knowledgeArticle.updateMany({
          where: { path, version: input.version },
          data,
        });
        if (result.count !== 1)
          throw new Error("Article changed. Reload before saving.");
      } else await tx.knowledgeArticle.create({ data: { path, ...data } });
      await tx.knowledgeRevision.create({
        data: { path, version, action: input.action, actor, content: json },
      });
      return { version };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
