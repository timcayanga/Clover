import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getKnowledge } from "@/lib/knowledge-store";
import { legacyKnowledgePaths } from "@/lib/knowledge-seed";
import { KnowledgeShell, KnowledgeContact } from "@/components/knowledge-shell";
import { KnowledgeArticle } from "@/components/knowledge-article";
type Props = { params: Promise<{ section: string; article: string }> };
export const dynamic = "force-dynamic";
async function resolve(params: Props["params"]) {
  const { section, article } = await params;
  const path = `/help/${section}/${article}`;
  const canonical = legacyKnowledgePaths.get(path) ?? path;
  const data = await getKnowledge();
  return {
    ...data,
    path,
    canonical,
    entry: data.entries.find((e) => e.path === canonical),
  };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entry, canonical } = await resolve(params);
  return {
    title: entry?.content.title ?? "Help",
    description: entry?.content.summary,
    alternates: { canonical: `https://clover.ph${canonical}` },
  };
}
export default async function Article({ params }: Props) {
  const { entry, entries, categories, path, canonical } = await resolve(params);
  if (!entry) notFound();
  if (path !== canonical) permanentRedirect(canonical);
  return (
    <KnowledgeShell>
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
