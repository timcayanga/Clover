import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { KnowledgeShell, KnowledgeContact } from "@/components/knowledge-shell";
import { KnowledgeBrowser } from "@/components/knowledge-browser";
import { getKnowledge } from "@/lib/knowledge-store";
import { categoryForLegacy } from "@/lib/knowledge-seed";
type Props = { params: Promise<{ section: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const { categories } = await getKnowledge();
  const category = categories.find((c) => c.slug === section);
  return {
    title: category?.title ?? "Help Center",
    description: category?.summary,
    alternates: { canonical: `https://clover.ph/help/${section}` },
  };
}
export default async function HelpSection({ params }: Props) {
  const { section } = await params;
  const { entries, categories } = await getKnowledge();
  const category = categories.find((c) => c.slug === section);
  if (!category) {
    const alias =
      categoryForLegacy(section) ??
      (
        {
          "product-features": "manage-money",
          "billing-and-accounts": "account-security",
          "privacy-and-security": "account-security",
          security: "account-security",
        } as Record<string, string>
      )[section];
    if (alias) permanentRedirect(`/help/${alias}`);
    notFound();
  }
  return (
    <KnowledgeShell>
      <KnowledgeBrowser
        entries={entries}
        categories={categories}
        category={category}
      />
      <KnowledgeContact />
    </KnowledgeShell>
  );
}
