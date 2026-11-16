import type { Metadata } from "next";
import { KnowledgeShell, KnowledgeContact } from "@/components/knowledge-shell";
import { KnowledgeBrowser } from "@/components/knowledge-browser";
import { getKnowledge } from "@/lib/knowledge-store";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Guides",
  description:
    "Download statements and wallet history, organize credit-card transactions, and understand records across multiple accounts with Clover.",
  alternates: { canonical: "https://clover.ph/guides" },
};
export default async function Guides() {
  const { entries, categories } = await getKnowledge();
  return (
    <KnowledgeShell active="guide">
      <KnowledgeBrowser
        entries={entries}
        categories={categories}
        mode="guide"
      />
      <KnowledgeContact />
    </KnowledgeShell>
  );
}
