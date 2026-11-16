import type { Metadata } from "next";
import { KnowledgeShell, KnowledgeContact } from "@/components/knowledge-shell";
import { KnowledgeBrowser } from "@/components/knowledge-browser";
import { getKnowledge } from "@/lib/knowledge-store";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Find answers about Clover uploads, accounts, transactions, Reports, Ask Clover, budgets, goals, investments, Circles, and your account.",
  alternates: { canonical: "https://clover.ph/help" },
};
export default async function HelpPage() {
  const { entries, categories } = await getKnowledge();
  return (
    <KnowledgeShell>
      <KnowledgeBrowser entries={entries} categories={categories} />
      <KnowledgeContact />
    </KnowledgeShell>
  );
}
