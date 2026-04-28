import type { Metadata } from "next";
import { HelpCenter } from "@/components/help-center";
import { helpSections } from "@/lib/help-center";

type HelpPageProps = {
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Find help for getting started, importing statements, transactions, accounts, pricing, privacy, and troubleshooting in Clover.",
  keywords: Array.from(
    new Set(
      helpSections.flatMap((section) => [
        section.title,
        section.summary,
        ...section.keywords,
        ...section.searchPhrases,
        ...section.articles.map((article) => article.title),
        ...section.questions.map((question) => question.question),
      ])
    )
  ),
};

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : null;

  return <HelpCenter returnTo={resolvedSearchParams?.returnTo ?? null} />;
}
