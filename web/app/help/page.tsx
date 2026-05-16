import type { Metadata } from "next";
import { HelpCenter } from "@/components/help-center";
import { helpSections } from "@/lib/help-center";
import { resolvePublicAccountState } from "@/lib/public-account-state";

export const dynamic = "force-dynamic";

type HelpPageProps = {
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Help Center | Clover",
  description:
    "Find help for getting started, importing statements, receipts, screenshots, split bills, transactions, accounts, pricing, privacy, and troubleshooting in Clover.",
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
  const accountState = await resolvePublicAccountState();

  return <HelpCenter returnTo={resolvedSearchParams?.returnTo ?? null} accountState={accountState} />;
}
