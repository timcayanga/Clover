import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { FeatureStory } from "@/components/feature-story";
import { FEATURE_STORY_MAP } from "@/lib/feature-stories";
import { FEATURE_PAGE_MAP, resolveFeatureSlug } from "@/lib/public-site";

type FeatureDetailPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: FeatureDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSlug = resolveFeatureSlug(slug);
  const page = FEATURE_PAGE_MAP.get(resolvedSlug);
  if (!page) return { title: "Features" };
  return { title: page.navLabel, description: FEATURE_STORY_MAP.get(resolvedSlug)?.chapters[0].copy ?? page.overview, alternates: { canonical: `/features/${resolvedSlug}` } };
}

export default async function FeatureDetailPage({ params }: FeatureDetailPageProps) {
  const { slug } = await params;
  const resolvedSlug = resolveFeatureSlug(slug);
  const story = FEATURE_STORY_MAP.get(resolvedSlug);
  if (!story) notFound();
  if (resolvedSlug !== slug) permanentRedirect(`/features/${resolvedSlug}`);
  const requestHeaders = await headers();
  const countryCode = requestHeaders.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY);
  return <main id="main-content" tabIndex={-1}>
    <FeatureStory story={story} authEnabled={authEnabled} initialMarket={countryCode === "PH" ? "ph" : "global"} countryResolved={countryCode !== null} />
  </main>;
}
