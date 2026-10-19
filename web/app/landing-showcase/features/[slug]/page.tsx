import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FEATURE_STORY_MAP } from "@/lib/feature-stories";
import { FeatureShowcase } from "../feature-showcase";
import { featurePreviewStory } from "../feature-content";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const story = FEATURE_STORY_MAP.get((await params).slug);
  return { title: `${story?.title ?? "Features"} · Clover preview`, robots: { index: false, follow: false } };
}
export default async function FeatureShowcasePage({ params }: Props) {
  // Experimental feature designs remain staging-only for this homepage release.
  if (process.env.VERCEL_ENV === "production") notFound();
  const story = FEATURE_STORY_MAP.get((await params).slug);
  if (!story) notFound();
  const country = (await headers()).get("x-vercel-ip-country");
  return <FeatureShowcase key={story.slug} story={featurePreviewStory(story)} authEnabled={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY)} initialMarket={country === "PH" ? "ph" : "global"} />;
}
