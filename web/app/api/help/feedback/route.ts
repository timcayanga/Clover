import { createHash } from "node:crypto";
import { z } from "zod";
import { getKnowledge } from "@/lib/knowledge-store";
import { contentPathSchema } from "@/lib/knowledge-types";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Same-origin requests only." },
      { status: 403 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 1000)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const data = z
      .object({
        path: contentPathSchema,
        voter: z.string().uuid(),
        helpful: z.boolean(),
      })
      .parse(JSON.parse(raw));
    const { entries } = await getKnowledge();
    if (!entries.some((entry) => entry.path === data.path))
      return Response.json({ error: "Article not found." }, { status: 404 });
    // A random, article-specific browser token deduplicates votes without storing
    // an account id, IP address, search query, or financial information.
    const voter = createHash("sha256")
      .update(`${data.path}:${data.voter}`)
      .digest("hex");
    await prisma.knowledgeFeedback.upsert({
      where: { path_voter: { path: data.path, voter } },
      create: { path: data.path, voter, helpful: data.helpful },
      update: { helpful: data.helpful },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Feedback could not be saved. Please try again later." },
      { status: 400 },
    );
  }
}
