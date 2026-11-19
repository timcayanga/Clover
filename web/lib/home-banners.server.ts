import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { getCurrentUserEnvironment } from "./user-environment";
import { getProAccess } from "./pro-access";
import { campaignConfig } from "./switch-campaign.server";
import { campaignOpen } from "../../shared/switch-campaign";
import { DEFAULT_HOME_BANNERS, HOME_BANNER_ARTWORK, validHomeBannerHref, visibleHomeBanners, type HomeBanner } from "../../shared/home-banners";

export const homeBannerSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  kind: z.enum(["bank_sync", "switch_campaign", "custom"]), enabled: z.boolean(),
  title: z.string().trim().min(1).max(65), body: z.string().trim().min(1).max(140),
  ctaLabel: z.string().trim().min(1).max(32), href: z.string().max(450).refine(validHomeBannerHref, "Choose a supported Clover page starting with /.") ,
  theme: z.enum(["teal", "mint"]), icon: z.enum(["accounts", "budgeting"]), assetId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).nullable(),
}).superRefine((item, ctx) => {
  if (!validHomeBannerHref(item.href)) return;
  const path = new URL(item.href, "https://clover.ph").pathname;
  if (item.kind === "switch_campaign" && path !== "/settings/plan/switch-to-clover") ctx.addIssue({ code: "custom", message: "The campaign banner must open the campaign form." });
  if (item.kind === "bank_sync" && path !== "/settings/plan") ctx.addIssue({ code: "custom", message: "The bank-sync upgrade banner must open Plans." });
});
export const homeBannerSaveSchema = z.object({ version: z.number().int().min(0), items: z.array(homeBannerSchema).max(12).refine(items => new Set(items.map(item => item.id)).size === items.length, "Banner IDs must be unique.") });
export async function homeBannerConfig() {
  const row = await prisma.homeBannerConfig.findUnique({ where: { environment: getCurrentUserEnvironment() } });
  const parsed = row ? z.array(homeBannerSchema).safeParse(row.items) : null;
  if (row && !parsed?.success) throw new Error("Banner configuration needs review.");
  return { version: row?.version ?? 0, items: parsed?.success ? parsed.data : DEFAULT_HOME_BANNERS.map(item => ({ ...item })) };
}
export async function homeBannersForUser(userId: string) {
  const access = await getProAccess(userId);
  if (access.planTier !== "free") return { banners: [] };
  const [config, campaign] = await Promise.all([homeBannerConfig(), campaignConfig()]);
  return { banners: visibleHomeBanners(config.items, access.planTier, campaignOpen(campaign, new Date())) };
}
export class HomeBannerConflict extends Error {}
export async function saveHomeBanners(input: z.infer<typeof homeBannerSaveSchema>, actorId: string) {
  const environment = getCurrentUserEnvironment();
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`home-banners:${environment}`}, 0))`;
    const before = await tx.homeBannerConfig.findUnique({ where: { environment } });
    if ((before?.version ?? 0) !== input.version) throw new HomeBannerConflict("Another administrator updated these banners. Reload before saving.");
    const ids = [...new Set(input.items.flatMap(item => item.assetId ? [item.assetId] : []))];
    if (ids.length && await tx.homeBannerAsset.count({ where: { id: { in: ids }, environment } }) !== ids.length) throw new Error("Choose artwork uploaded in this environment.");
    const after = await tx.homeBannerConfig.upsert({ where: { environment }, create: { environment, version: 1, items: input.items }, update: { version: { increment: 1 }, items: input.items } });
    await tx.growthAudit.create({ data: { actorId, targetId: `home-banners:${environment}`, action: "home_banners_save", reason: "Updated Free mobile Home banners and display order", before: before ? { version: before.version, items: before.items } : undefined, after: { version: after.version, items: input.items } } });
    return { version: after.version, items: input.items };
  });
}
export async function uploadHomeBannerArtwork(file: File) {
  if (!file.size || file.size > HOME_BANNER_ARTWORK.maxBytes || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use PNG, JPEG or WebP up to 2 MB.");
  const sharp = (await import("sharp")).default;
  const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 12_000_000, animated: false, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new Error("Use genuine PNG, JPEG or WebP artwork.");
  const w = metadata.autoOrient.width, h = metadata.autoOrient.height;
  if (!w || !h || w < 600 || h < 300 || w > 2400 || h > 1200 || Math.abs(w / h - 2) > 0.01 || (metadata.pages ?? 1) > 1) throw new Error("Use 2:1 artwork: recommended 1200 × 600 px; minimum 600 × 300, maximum 2400 × 1200. Animated files are not supported.");
  const output = await image.rotate().resize({ width: 1200, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const environment = getCurrentUserEnvironment(), id = randomUUID(), storageKey = `home-banner-artwork/${environment}/${id}.webp`;
  const { uploadObject } = await import("./s3");
  await uploadObject(storageKey, new Uint8Array(output), "image/webp");
  try { return await prisma.homeBannerAsset.create({ data: { id, environment, storageKey, width: Math.min(w, 1200), height: Math.min(h, 600) } }); }
  catch (error) { const { deleteImportObject } = await import("./s3-delete"); await deleteImportObject(storageKey).catch(() => {}); throw error; }
}
