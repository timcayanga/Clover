import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KnowledgeShell, KnowledgeContact } from "@/components/knowledge-shell";
import { KnowledgeArticle } from "@/components/knowledge-article";
import { getKnowledge } from "@/lib/knowledge-store";
type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { entries } = await getKnowledge();
  const entry = entries.find((e) => e.path === `/guides/${slug}`);
  return {
    title: entry?.content.title ?? "Guide",
    description: entry?.content.summary,
    alternates: { canonical: `https://clover.ph/guides/${slug}` },
  };
}
export default async function Guide({ params }: Props) {
  const { slug } = await params;
  const { entries, categories } = await getKnowledge();
  const entry = entries.find((e) => e.path === `/guides/${slug}`);
  if (!entry) notFound();
  return (
    <KnowledgeShell active="guide">
      <KnowledgeArticle
        entry={entry}
        category={categories.find((c) => c.slug === entry.content.category)}
        related={entries
          .filter(
            (e) =>
              e.path !== entry.path &&
              e.content.category === entry.content.category,
          )
          .slice(0, 3)}
      />
      <KnowledgeContact />
    </KnowledgeShell>
  );
}
