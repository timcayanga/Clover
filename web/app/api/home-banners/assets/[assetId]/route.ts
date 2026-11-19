import { prisma } from "@/lib/prisma";
import { homeBannerConfig } from "@/lib/home-banners.server";
import { getCurrentUserEnvironment } from "@/lib/user-environment";
import { requireAdminAuth } from "@/lib/admin";
import { downloadImportObject } from "@/lib/import-storage.server";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const { assetId } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(assetId)) return new Response(null, { status: 404 });
    const asset = await prisma.homeBannerAsset.findFirst({ where: { id: assetId, environment: getCurrentUserEnvironment() } });
    if (!asset) return new Response(null, { status: 404 });
    const published = (await homeBannerConfig()).items.some(item => item.enabled && item.assetId === assetId);
    if (!published) await requireAdminAuth("operate");
    const bytes = await downloadImportObject(asset.storageKey);
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": published ? "public, max-age=3600" : "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
