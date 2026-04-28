import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpSectionPage } from "@/components/help-section-page";
import { helpSectionMap, isHelpSection } from "@/lib/help-center";

type HelpSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

export function generateStaticParams() {
  return Array.from(helpSectionMap.keys()).map((section) => ({ section }));
}

export async function generateMetadata({ params }: HelpSectionPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const section = helpSectionMap.get(resolvedParams.section);

  if (!section) {
    return {
      title: "Help",
    };
  }

  return {
    title: section.title,
    description: section.summary,
    keywords: Array.from(
      new Set([
        section.title,
        section.summary,
        ...section.keywords,
        ...section.highlights,
        ...section.questions.map((question) => question.question),
      ])
    ),
  };
}

export default async function HelpSectionRoute({ params, searchParams }: HelpSectionPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : null;

  if (!isHelpSection(resolvedParams.section)) {
    notFound();
  }

  const section = helpSectionMap.get(resolvedParams.section);

  if (!section) {
    notFound();
  }

  return <HelpSectionPage section={section} returnTo={resolvedSearchParams?.returnTo ?? null} />;
}
