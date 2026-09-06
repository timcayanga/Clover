import type { MetadataRoute } from "next";
import { getKnowledge } from "@/lib/knowledge-store";
import { FEATURE_LINKS } from "@/lib/public-site";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries, categories } = await getKnowledge();
  const paths = [
    "/",
    "/help",
    "/guides",
    "/pricing",
    "/contact",
    "/privacy-policy",
    "/terms-of-service",
    ...FEATURE_LINKS.map((l) => l.href),
    ...categories.map((c) => `/help/${c.slug}`),
    ...entries.map((e) => e.path),
  ];
  return [...new Set(paths)].map((path) => ({
    url: `https://clover.ph${path}`,
  }));
}
