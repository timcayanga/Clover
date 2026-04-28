import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticlePage } from "@/components/help-article-page";
import { findHelpSectionArticle, helpSectionMap, isHelpArticleSlug, isHelpSection } from "@/lib/help-center";

type HelpArticlePageProps = {
  params: Promise<{
    section: string;
    article: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

export function generateStaticParams() {
  return Array.from(helpSectionMap.values()).flatMap((section) =>
    section.articles.map((article) => ({
      section: section.slug,
      article: article.slug,
    }))
  );
}

export async function generateMetadata({ params }: HelpArticlePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const section = helpSectionMap.get(resolvedParams.section);
  const article = findHelpSectionArticle(resolvedParams.section, resolvedParams.article);

  if (!section || !article) {
    return {
      title: "Help",
    };
  }

  return {
    title: article.seoTitle,
    description: article.seoDescription,
    keywords: Array.from(
      new Set([
        section.title,
        section.summary,
        article.title,
        article.summary,
        ...section.keywords,
        ...article.keywords,
        ...article.questions.map((question) => question.question),
      ])
    ),
  };
}

export default async function HelpArticleRoute({ params, searchParams }: HelpArticlePageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : null;

  if (!isHelpSection(resolvedParams.section) || !isHelpArticleSlug(resolvedParams.section, resolvedParams.article)) {
    notFound();
  }

  const section = helpSectionMap.get(resolvedParams.section);
  const article = findHelpSectionArticle(resolvedParams.section, resolvedParams.article);

  if (!section || !article) {
    notFound();
  }

  return <HelpArticlePage section={section} article={article} returnTo={resolvedSearchParams?.returnTo ?? null} />;
}

