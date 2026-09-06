import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { getEditorialLibrary, mutateArticle } from "@/lib/knowledge-store";
import {
  aiSettingsSchema,
  contentPathSchema,
  defaultAiSettings,
} from "@/lib/knowledge-types";
import { knowledgeCategories } from "@/lib/knowledge-seed";
import { prisma } from "@/lib/prisma";
import { generateKnowledgeDraft } from "@/lib/knowledge-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    await requireAdminAuth();
  } catch {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 },
    );
  }
  try {
    const path = new URL(request.url).searchParams.get("history");
    if (path) {
      contentPathSchema.parse(path);
      return NextResponse.json({
        revisions: await prisma.knowledgeRevision.findMany({
          where: { path },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
      });
    }
    return NextResponse.json(await getEditorialLibrary());
  } catch {
    return NextResponse.json(
      {
        error:
          "Content storage is unavailable. Apply the editorial migration and check the database connection.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  let actor: string;
  try {
    actor = (await requireAdminAuth()).userId!;
  } catch {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 },
    );
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Same-origin requests only." },
      { status: 403 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 180000)
      return NextResponse.json(
        { error: "Content is too large." },
        { status: 413 },
      );
    const body = JSON.parse(raw);
    if (body.action === "generate")
      return NextResponse.json(await generateKnowledgeDraft());
    if (body.action === "settings") {
      const ai = aiSettingsSchema.parse(body.settings);
      await prisma.knowledgeSettings.upsert({
        where: { id: "editorial" },
        create: { ai },
        update: { ai },
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "categories") {
      const order = z.array(z.string()).parse(body.order);
      if (
        order.length !== knowledgeCategories.length ||
        new Set(order).size !== order.length ||
        order.some((slug) => !knowledgeCategories.some((c) => c.slug === slug))
      )
        throw new Error("Include each category exactly once.");
      await prisma.knowledgeSettings.upsert({
        where: { id: "editorial" },
        create: { ai: defaultAiSettings, categoryOrder: order },
        update: { categoryOrder: order },
      });
      return NextResponse.json({ ok: true });
    }
    const input = z
      .object({
        path: contentPathSchema,
        version: z.number().int().min(0),
        action: z.enum(["save", "publish", "archive", "restore"]),
        content: z.unknown().optional(),
        order: z.number().int().min(-20000).max(100000).optional(),
        verified: z.boolean().optional(),
      })
      .parse(body);
    if (input.action === "publish" && !input.verified)
      throw new Error(
        "Confirm that you reviewed the exact draft, sources, and product steps.",
      );
    return NextResponse.json(await mutateArticle(input, actor));
  } catch (error) {
    const safe =
      error instanceof z.ZodError
        ? error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join(" ")
        : error instanceof Error &&
            !/prisma|database|Invalid.*invocation|connect|relation|Unique constraint|transaction failed/i.test(
              error.message,
            )
          ? error.message
          : "Unable to save. Check content storage, then reload to avoid overwriting another editor.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
