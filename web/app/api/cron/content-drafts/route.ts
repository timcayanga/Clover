import { timingSafeEqual } from "node:crypto";
import { generateKnowledgeDraft } from "@/lib/knowledge-ai";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await generateKnowledgeDraft());
  } catch {
    return Response.json(
      {
        error:
          "Draft generation failed. Check the Admin content queue; no content was published.",
      },
      { status: 500 },
    );
  }
}
