import { requireAdminAuth } from "@/lib/admin";
import { canAdmin } from "@/lib/admin-permissions";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { homeBannerConfig, homeBannerSaveSchema, HomeBannerConflict, saveHomeBanners, uploadHomeBannerArtwork } from "@/lib/home-banners.server";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const admin = await requireAdminAuth(); return Response.json({ ...await homeBannerConfig(), editable: canAdmin(admin.role, "operate") }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Admin access required or banner storage unavailable." }, { status: 403 }); }
}
export async function POST(request: Request) {
  let actor: string;
  try { actor = (await requireAdminAuth("operate")).userId!; assertTrustedRequestOrigin(request); }
  catch { return Response.json({ error: "Admin access and a trusted request are required." }, { status: 403 }); }
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (Number(request.headers.get("content-length") ?? 0) > 2.2 * 1024 * 1024) return Response.json({ error: "Use artwork up to 2 MB." }, { status: 413 });
      const form = await request.formData(), file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choose artwork first.");
      const asset = await uploadHomeBannerArtwork(file);
      return Response.json({ assetId: asset.id, imageUrl: `/api/home-banners/assets/${asset.id}` }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const raw = await request.text();
    if (raw.length > 64000) return Response.json({ error: "Banner configuration is too large." }, { status: 413 });
    return Response.json(await saveHomeBanners(homeBannerSaveSchema.parse(JSON.parse(raw)), actor), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).slice(0, 3).join(" ") : error instanceof HomeBannerConflict ? error.message : error instanceof Error && /^(Use |Choose |Another)/.test(error.message) ? error.message : "Unable to save banners. Check the artwork and try again.";
    return Response.json({ error: message }, { status: error instanceof HomeBannerConflict ? 409 : 400 });
  }
}
