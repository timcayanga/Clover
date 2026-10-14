import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FEATURE_STORY_MAP } from "@/lib/feature-stories";
import { FeatureShowcase } from "../feature-showcase";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const story = FEATURE_STORY_MAP.get((await params).slug);
  return { title: `${story?.title ?? "Features"} · Clover preview`, robots: { index: false, follow: false } };
}
export default async function FeatureShowcasePage({ params }: Props) {
  const story = FEATURE_STORY_MAP.get((await params).slug);
  if (!story) notFound();
  const country = (await headers()).get("x-vercel-ip-country");
  return <FeatureShowcase key={story.slug} story={story} initialMarket={country === "PH" ? "ph" : "global"} />;
}
